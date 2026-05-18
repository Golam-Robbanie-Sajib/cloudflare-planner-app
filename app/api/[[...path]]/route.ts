// app/api/[[...path]]/route.ts
//
// All five edge endpoints (chat-message, generate-plan, integrate-plan,
// reschedule-event, generate-quiz) live here. Schemas come from
// `lib/schemas.ts` and are shared with the frontend — no shape lives in two
// places. Model routing is split: cheap/fast llama-3.1-8b-instant for
// classification, gpt-oss-120b for the heavyweight plan/quiz generation.

import { Hono } from "hono"
import type { Context } from "hono"
import { handle } from "hono/vercel"
import { cors } from "hono/cors"
import { trimTrailingSlash } from "hono/trailing-slash"
import { ZodError, type ZodSchema } from "zod"

import {
  BackendTaskSchema,
  ChatMessageRequestSchema,
  ChatMessageResponseSchema,
  GeneratePlanRequestSchema,
  IntegratePlanRequestSchema,
  QuizRequestSchema,
  RescheduleRequestSchema,
  parseGeneratedPlan,
  parseQuizPayload,
  type BackendTask,
  type ChatMessageResponse,
  type GeneratePlanRequest,
} from "@/lib/schemas"

export const runtime = "edge"

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
// Cheap & fast classifier for /chat-message (intent + param extraction).
const GROQ_FAST_MODEL = "llama-3.1-8b-instant"
// Heavyweight model for plan generation and quizzes — quality matters more
// than latency for these.
const GROQ_SMART_MODEL = "openai/gpt-oss-120b"
const CALENDAR_API_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
const DEFAULT_TIMEZONE = "Asia/Dhaka"

// ─── Helpers ────────────────────────────────────────────────────────────────

interface OpenAIMessage {
  role: "system" | "user" | "assistant"
  content: string
}

function geminiContentsToOpenAIMessages(
  contents: { role: "user" | "model"; parts: { text: string }[] }[],
): OpenAIMessage[] {
  return contents.map((entry) => ({
    role: entry.role === "model" ? "assistant" : "user",
    content: entry.parts.map((p) => p?.text || "").join("\n"),
  }))
}

class PermissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PermissionError"
  }
}

interface CallGroqArgs {
  systemPrompt: string
  messages: OpenAIMessage[]
  jsonMode?: boolean
  temperature?: number
  model?: string
}

async function callGroq(apiKey: string, args: CallGroqArgs): Promise<string> {
  const body: Record<string, unknown> = {
    model: args.model ?? GROQ_SMART_MODEL,
    messages: [{ role: "system", content: args.systemPrompt }, ...args.messages],
    temperature: args.temperature ?? 0.4,
  }
  if (args.jsonMode) body.response_format = { type: "json_object" }

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    let errorPayload: { error?: { message?: string } } = {}
    try {
      errorPayload = (await response.json()) as typeof errorPayload
    } catch {
      errorPayload = { error: { message: await response.text() } }
    }
    console.error("Groq API Error:", errorPayload)
    throw new Error(errorPayload.error?.message || "Groq API request failed")
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    console.error("No content returned from Groq:", data)
    throw new Error("AI returned an empty or malformed response.")
  }
  return content.trim()
}

function requireGroqKey(): string {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error("GROQ_API_KEY environment variable not found.")
  return key
}

// Tries to parse the request body against a Zod schema; on failure returns
// a 400 with the first issue path/message so the caller has something
// actionable to log.
async function parseBody<S extends ZodSchema>(c: Context, schema: S): Promise<{ ok: true; data: ReturnType<S["parse"]> } | { ok: false; response: Response }> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return { ok: false, response: c.json({ detail: "Body must be valid JSON." }, 400) }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const detail = issue ? `${issue.path.join(".") || "(body)"}: ${issue.message}` : "Invalid request body."
    return { ok: false, response: c.json({ detail }, 400) }
  }
  return { ok: true, data: parsed.data as ReturnType<S["parse"]> }
}

function handleServiceError(error: unknown, c: Context) {
  const err = error as Error
  console.error(`Service error: ${err?.message ?? error}`)
  if (err instanceof PermissionError || err?.name === "PermissionError") {
    return c.json({ detail: err.message }, 401)
  }
  if (error instanceof ZodError) {
    return c.json({ detail: error.issues[0]?.message ?? "Validation failed." }, 400)
  }
  return c.json({ detail: err?.message ?? "Internal error" }, 500)
}

// ─── Domain logic ──────────────────────────────────────────────────────────

async function runChatMessage(apiKey: string, userMessage: string, chatHistory: { role: "user" | "model"; parts: { text: string }[] }[]): Promise<ChatMessageResponse> {
  const systemPrompt = `You are an intelligent goal-planning assistant. You hold a conversation with the user and decide, on every turn, whether you have enough information to create a learning plan, or whether you need to ask one short follow-up question first.

You always respond with a single JSON object — no prose outside it — matching this schema exactly:
{
  "intent": "chat" | "create_goal",
  "goalTitle": string | null,
  "response": string,
  "extractedParams": {
    "goal": string | null,
    "durationDays": number | null,
    "dailyHours": number | null,
    "startDate": string | null,
    "currentSkillLevel": string | null
  },
  "missingParams": string[]
}

Rules for deciding intent:
1. Carefully read the ENTIRE chat history. Information may be spread across multiple turns — e.g. the user says "I want to learn React" in one message and "for two weeks, two hours a day" in another. Combine them.
2. Essential parameters for a plan are: goal (skill/topic), durationDays (total length), dailyHours (or weekly hours), startDate (or a clear relative date like "tomorrow"). currentSkillLevel is helpful but not strictly required — only ask if the goal is technical and the level is genuinely ambiguous.
3. If ANY essential parameter is missing or ambiguous, set "intent" to "chat" and put a concise, friendly question in "response" that asks for the most important missing piece (one thing at a time — do not bombard the user). List all still-missing params in "missingParams".
4. Only when all essential parameters are clearly established, set "intent" to "create_goal", populate "goalTitle" with a short title (e.g. "Learn React in 14 days"), and put a confirmation sentence in "response" telling the user you have what you need and will generate the plan.
5. If the user is just chatting / asking a question / refining an existing plan (not stating a new goal), set "intent" to "chat" with an empty "missingParams" array and a helpful conversational "response".
6. Never invent values for "extractedParams"; use null when unknown. Dates must be ISO YYYY-MM-DD if you have them.

Output ONLY the JSON object.`

  const messages = geminiContentsToOpenAIMessages(chatHistory)
  messages.push({ role: "user", content: userMessage })

  let raw: string
  try {
    raw = await callGroq(apiKey, {
      systemPrompt,
      messages,
      jsonMode: true,
      temperature: 0.3,
      model: GROQ_FAST_MODEL,
    })
  } catch (e) {
    console.error("Chat-message Groq error:", e)
    return { intent: "chat", goalTitle: null, response: "I had a little trouble understanding that. Could you please rephrase?", missingParams: [] }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { intent: "chat", goalTitle: null, response: "I had a little trouble understanding that. Could you please rephrase?", missingParams: [] }
  }

  const result = ChatMessageResponseSchema.safeParse(parsed)
  if (!result.success) {
    return { intent: "chat", goalTitle: null, response: "I had a little trouble understanding that. Could you please rephrase?", missingParams: [] }
  }
  return result.data
}

async function runGeneratePlan(apiKey: string, req: GeneratePlanRequest): Promise<{ tasks: BackendTask[] | null; plan: string }> {
  const currentDate = new Date().toISOString().split("T")[0]
  const systemPrompt = `You are an AI specialized in generating structured, realistic learning plans.

You always respond with a single JSON object — no prose outside it — matching this schema exactly:
{
  "human_readable_plan": string,
  "structured_tasks": [
    {
      "summary": string,
      "description": string | null,
      "startTime": string,
      "endTime": string,
      "resources": [
        { "title": string, "url": string | null, "type": "article" | "video" | "course" | "book" | "docs" | "tool" | "other" }
      ]
    }
  ]
}

Field rules:
- "human_readable_plan": a conversational, multi-paragraph narrative summarizing the plan, week by week or phase by phase.
- "structured_tasks": one entry per concrete calendar block. Each task must be schedulable as a single Google Calendar event.
- "startTime" / "endTime": ISO 8601 datetime WITHOUT a timezone offset (e.g. "2025-04-12T09:00:00"). They will be interpreted in the timezone '${DEFAULT_TIMEZONE}'.
- "resources": 0-4 high-signal recommendations for THIS task — official docs, well-known tutorials, specific exercises, named books. Only include URLs you're confident exist (https only); omit url if uncertain. Prefer breadth over depth: a doc + a video + an exercise is better than 4 articles.
- The current date is ${currentDate}. Never schedule tasks in the past — if the requested start date is in the past, shift the plan forward.
- Mix theory, practice, and review tasks. Build difficulty progressively. Keep individual task duration realistic (typically 30–180 minutes).
- Match the user's daily/weekly hour availability if it is specified.
- For refinement requests, preserve the spirit of the previous plan and apply only the requested adjustments.`

  const parts: string[] = []
  if (req.refinementInstruction && req.existingPlanTasksForRefinement) {
    parts.push(`***PLAN REFINEMENT REQUEST***`)
    parts.push(`Refine the existing plan for the goal '${req.goal}'. Existing tasks:`)
    req.existingPlanTasksForRefinement.forEach((task, i) => {
      parts.push(`- Task ${i + 1}: '${task.summary}' from ${task.startTime} to ${task.endTime}.`)
    })
    parts.push(`\nRefinement instruction: '${req.refinementInstruction}'`)
    parts.push(`The refined plan must cover ${req.durationDays} days, starting around ${req.startDate}.`)
  } else {
    parts.push(`***NEW PLAN GENERATION REQUEST***`)
    parts.push(`- Goal/Skill: ${req.goal}`)
    parts.push(`- Duration: ${req.durationDays} days`)
    parts.push(`- Desired Start Date: ${req.startDate}`)
    if (req.dailyHours) parts.push(`- Daily Hours Available: ${req.dailyHours}`)
    if (req.learningStyle) parts.push(`- Preferred Learning Style: ${req.learningStyle}`)
    if (req.preferredTime) parts.push(`- Preferred Time of Day: ${req.preferredTime}`)
    if (req.currentSkillLevel) parts.push(`- Current Skill Level: ${req.currentSkillLevel}`)
  }
  if (req.busySlots && req.busySlots.length > 0) {
    parts.push(`\n***BUSY SLOTS (the user already has these — do NOT schedule overlapping events; pick different times or different days)***`)
    req.busySlots.slice(0, 50).forEach((s) => {
      parts.push(`- ${s.date} ${s.startTime}–${s.endTime}: ${s.title}`)
    })
  }
  if (req.userProgress) {
    const p = req.userProgress
    parts.push(`\n***USER PROGRESS SIGNAL (use this to calibrate difficulty/pace)***`)
    if (typeof p.completionRate === "number") parts.push(`- Past completion rate: ${(p.completionRate * 100).toFixed(0)}% (${p.completedTasks ?? "?"} of ${p.totalTasks ?? "?"} previous tasks completed)`)
    if (typeof p.avgDelayDays === "number") parts.push(`- Average task slippage: ${p.avgDelayDays.toFixed(1)} days late`)
    if (p.recentlyCompleted?.length) parts.push(`- Recently completed: ${p.recentlyCompleted.slice(0, 5).join("; ")}`)
    if (p.recentlyMissed?.length) parts.push(`- Recently skipped/missed: ${p.recentlyMissed.slice(0, 5).join("; ")}`)
    if (p.activeGoals?.length) {
      parts.push(`- Active goals already in progress (DO NOT overbook the user — distribute the new plan across days where they have headroom):`)
      p.activeGoals.forEach((g) => parts.push(`    • "${g.title}": ${g.tasksRemaining} tasks remaining (~${g.estimatedHoursRemaining}h)`))
    }
    parts.push(`If completion rate is below 50%, reduce daily intensity and prefer shorter sessions. If above 85%, push slightly harder.`)
  }
  parts.push(`\nReturn ONLY the JSON object described in the system prompt.`)
  const userPrompt = parts.join("\n")

  const messages: OpenAIMessage[] = req.chatHistoryForContext
    ? geminiContentsToOpenAIMessages(req.chatHistoryForContext)
    : []
  messages.push({ role: "user", content: userPrompt })

  try {
    const raw = await callGroq(apiKey, { systemPrompt, messages, jsonMode: true, temperature: 0.5 })
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { tasks: null, plan: "AI returned malformed JSON." }
    }
    const { humanReadablePlan, structuredTasks } = parseGeneratedPlan(parsed)
    if (structuredTasks.length === 0) {
      return { tasks: null, plan: "AI did not return any valid scheduled tasks. Please try again." }
    }
    return { tasks: structuredTasks, plan: humanReadablePlan }
  } catch (e) {
    return { tasks: null, plan: `An unexpected error occurred: ${(e as Error).message}` }
  }
}

async function pushTasksToGoogleCalendar(
  skillName: string,
  tasks: BackendTask[],
  accessToken: string,
): Promise<{ message: string; results: { index: number; status: "synced" | "failed"; googleEventId?: string; googleEventLink?: string; error?: string }[] }> {
  const results: { index: number; status: "synced" | "failed"; googleEventId?: string; googleEventLink?: string; error?: string }[] = []
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    const eventBody = {
      summary: t.summary || `${skillName} Task`,
      description: t.description || "",
      start: { dateTime: t.startTime, timeZone: DEFAULT_TIMEZONE },
      end: { dateTime: t.endTime, timeZone: DEFAULT_TIMEZONE },
    }
    try {
      const response = await fetch(CALENDAR_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "TaskFlow/1.0",
        },
        body: JSON.stringify(eventBody),
      })
      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
        if (response.status === 401) {
          throw new PermissionError(errorData.error?.message || "Google Calendar access expired.")
        }
        results.push({ index: i, status: "failed", error: errorData.error?.message || `HTTP ${response.status}` })
        continue
      }
      const eventData = (await response.json()) as { id: string; htmlLink?: string }
      results.push({ index: i, status: "synced", googleEventId: eventData.id, googleEventLink: eventData.htmlLink })
    } catch (e) {
      if (e instanceof PermissionError) throw e
      results.push({ index: i, status: "failed", error: (e as Error).message })
    }
  }
  const okCount = results.filter((r) => r.status === "synced").length
  return { message: `Synced ${okCount}/${tasks.length} tasks to Google Calendar.`, results }
}

// ─── Hono app ──────────────────────────────────────────────────────────────

const app = new Hono().basePath("/api")
app.use("*", trimTrailingSlash())

const appOrigins = [
  "http://localhost:3000",
  "https://cloudflare-planner-app.pages.dev",
]
app.use(
  "*",
  cors({
    origin: (origin) => (appOrigins.includes(origin) ? origin : appOrigins[0]),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
)

app.post("/chat-message", async (c) => {
  try {
    const apiKey = requireGroqKey()
    const parsed = await parseBody(c, ChatMessageRequestSchema)
    if (!parsed.ok) return parsed.response
    const reply = await runChatMessage(apiKey, parsed.data.userMessage, parsed.data.chatHistory)
    return c.json(reply)
  } catch (e) {
    return handleServiceError(e, c)
  }
})

app.post("/generate-plan", async (c) => {
  try {
    const apiKey = requireGroqKey()
    const parsed = await parseBody(c, GeneratePlanRequestSchema)
    if (!parsed.ok) return parsed.response
    const { tasks, plan } = await runGeneratePlan(apiKey, parsed.data)
    if (!tasks) return c.json({ detail: plan }, 422)
    return c.json({ humanReadablePlan: plan, structuredTasks: tasks })
  } catch (e) {
    return handleServiceError(e, c)
  }
})

app.post("/integrate-plan", async (c) => {
  try {
    const authHeader = c.req.header("authorization")
    const accessToken = authHeader?.split(" ")[1]
    if (!accessToken) return c.json({ detail: "Authorization header is missing" }, 401)
    const parsed = await parseBody(c, IntegratePlanRequestSchema)
    if (!parsed.ok) return parsed.response
    const { message, results } = await pushTasksToGoogleCalendar(parsed.data.skillName, parsed.data.structuredTasks, accessToken)
    const calendarEventLinks = results.filter((r) => r.status === "synced" && r.googleEventLink).map((r) => r.googleEventLink as string)
    return c.json({ message, results, calendarEventLinks })
  } catch (e) {
    return handleServiceError(e, c)
  }
})

app.post("/reschedule-event", async (c) => {
  try {
    const authHeader = c.req.header("authorization")
    const accessToken = authHeader?.split(" ")[1]
    if (!accessToken) return c.json({ detail: "Authorization header is missing" }, 401)
    const parsed = await parseBody(c, RescheduleRequestSchema)
    if (!parsed.ok) return parsed.response
    const { googleEventId, startTime, endTime } = parsed.data

    const url = `${CALENDAR_API_URL}/${encodeURIComponent(googleEventId)}`
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start: { dateTime: startTime, timeZone: DEFAULT_TIMEZONE },
        end: { dateTime: endTime, timeZone: DEFAULT_TIMEZONE },
      }),
    })
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
      if (response.status === 401) {
        throw new PermissionError(errorData.error?.message || "Google Calendar access expired.")
      }
      return c.json({ detail: errorData.error?.message || `HTTP ${response.status}` }, response.status as 400)
    }
    const eventData = (await response.json()) as { id: string; htmlLink?: string }
    return c.json({ googleEventId: eventData.id, googleEventLink: eventData.htmlLink })
  } catch (e) {
    return handleServiceError(e, c)
  }
})

app.post("/generate-quiz", async (c) => {
  try {
    const apiKey = requireGroqKey()
    const parsed = await parseBody(c, QuizRequestSchema)
    if (!parsed.ok) return parsed.response
    const { taskTitle, taskDescription, goalTitle } = parsed.data

    const systemPrompt = `You are a quiz writer that produces a single JSON object — no prose outside it — matching this schema exactly:
{
  "questions": [
    {
      "question": string,
      "options": [string, string, string, string],
      "correctIndex": number,
      "explanation": string
    }
  ]
}

Constraints:
- Exactly 3 questions.
- Each question has EXACTLY 4 distinct options.
- "correctIndex" is 0-3 and matches a real option.
- Difficulty: comprehension/applied — not trivia. Aim at someone who just finished the task.
- "explanation" is 1-2 sentences explaining WHY the right answer is correct.`

    const userMessage = [
      `Goal: ${goalTitle || "(not specified)"}`,
      `Task just completed: ${taskTitle}`,
      taskDescription ? `Task notes: ${taskDescription}` : "",
      `Write a 3-question check.`,
    ]
      .filter(Boolean)
      .join("\n")

    const raw = await callGroq(apiKey, {
      systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      jsonMode: true,
      temperature: 0.4,
    })

    let rawParsed: unknown
    try {
      rawParsed = JSON.parse(raw)
    } catch {
      return c.json({ detail: "AI returned malformed JSON." }, 502)
    }
    const questions = parseQuizPayload(rawParsed)
    if (questions.length === 0) {
      return c.json({ detail: "AI did not return any valid questions." }, 422)
    }
    return c.json({ questions })
  } catch (e) {
    return handleServiceError(e, c)
  }
})

app.get("/", (c) => c.json({ message: "API is running!" }))

export const GET = handle(app)
export const POST = handle(app)
