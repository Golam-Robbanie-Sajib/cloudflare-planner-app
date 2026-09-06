// lib/schemas.ts
//
// Single source of truth for every shape that crosses a process boundary
// (frontend ↔ Hono edge, LLM ↔ backend, Firestore ↔ app). Each schema lives
// here once; both ends parse with it. This eliminates "the field type drifted
// between server and client" bugs that were the most common failure mode in
// the codebase before.
//
// Conventions:
//   * `*Schema` exports the runtime Zod schema.
//   * `T` exports the inferred type.
//   * Schemas are .passthrough()-free by default so unexpected fields are
//     dropped — important when accepting LLM output.

import { z } from "zod"

// ─── Common primitives ─────────────────────────────────────────────────────

// Same regex used in route.js — accepts "YYYY-MM-DDTHH:MM[:SS][.fff][Z|±HH:MM]".
export const isoDateTimeLoose = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/, "Not a valid ISO 8601 datetime")
  .refine((v) => !Number.isNaN(new Date(v).getTime()), { message: "Datetime is unparseable" })

export const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
export const hhmm = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Must be HH:MM or HH:MM:SS")

// ─── LLM task output (the heart of the contract) ───────────────────────────

export const ResourceTypeSchema = z.enum([
  "article", "video", "course", "book", "docs", "tool", "other",
])
export type ResourceType = z.infer<typeof ResourceTypeSchema>

export const TaskResourceSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    url: z.string().url().regex(/^https?:\/\//i).optional(),
    type: ResourceTypeSchema.catch("other"),
  })
  .strip()
export type TaskResource = z.infer<typeof TaskResourceSchema>

// What the AI returns for one task — and what the rest of the app speaks of
// as a "BackendTask". Use `.superRefine` so end > start is enforced atomically.
export const BackendTaskSchema = z
  .object({
    summary: z.string().trim().min(1).max(500),
    description: z.string().nullable().optional(),
    startTime: isoDateTimeLoose,
    endTime: isoDateTimeLoose,
    resources: z.array(TaskResourceSchema).max(8).optional().default([]),
  })
  .strip()
  .superRefine((t, ctx) => {
    if (new Date(t.endTime).getTime() <= new Date(t.startTime).getTime()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endTime"], message: "endTime must be after startTime" })
    }
  })
export type BackendTask = z.infer<typeof BackendTaskSchema>

// LLM JSON envelope for /generate-plan. Tasks are sanitized one-by-one so a
// single bad entry doesn't poison the batch — see `parseGeneratedPlan` below.
export const GeneratedPlanSchema = z.object({
  human_readable_plan: z.string().default(""),
  structured_tasks: z.array(z.unknown()).default([]),
})

// Filter+sanitize each task with BackendTaskSchema; drop the ones that fail.
// Returned tasks are guaranteed valid; the rejected ones are silently dropped
// (the route surface returns 422 when zero survive).
export function parseGeneratedPlan(raw: unknown): { humanReadablePlan: string; structuredTasks: BackendTask[] } {
  const env = GeneratedPlanSchema.safeParse(raw)
  if (!env.success) return { humanReadablePlan: "", structuredTasks: [] }
  const tasks: BackendTask[] = []
  for (const candidate of env.data.structured_tasks) {
    const parsed = BackendTaskSchema.safeParse(candidate)
    if (parsed.success) tasks.push(parsed.data)
  }
  return { humanReadablePlan: env.data.human_readable_plan, structuredTasks: tasks }
}

// ─── /chat-message ─────────────────────────────────────────────────────────

export const GeminiContentPartSchema = z.object({ text: z.string() })
export const GeminiContentSchema = z.object({
  role: z.enum(["user", "model"]),
  parts: z.array(GeminiContentPartSchema),
})
export type GeminiContent = z.infer<typeof GeminiContentSchema>

export const ChatMessageRequestSchema = z.object({
  userMessage: z.string().min(1).max(8000),
  chatHistory: z.array(GeminiContentSchema).max(200).default([]),
})
export type ChatMessageRequest = z.infer<typeof ChatMessageRequestSchema>

export const ExtractedParamsSchema = z
  .object({
    goal: z.string().nullable(),
    durationDays: z.number().nullable(),
    dailyHours: z.number().nullable(),
    startDate: z.string().nullable(),
    currentSkillLevel: z.string().nullable(),
  })
  .partial()
  .nullable()
export type ExtractedParams = z.infer<typeof ExtractedParamsSchema>

export const ChatMessageResponseSchema = z.object({
  intent: z.enum(["chat", "create_goal"]).catch("chat"),
  goalTitle: z.string().nullable().default(null),
  response: z.string().default("Could you tell me a bit more about what you'd like to learn?"),
  extractedParams: ExtractedParamsSchema.optional(),
  missingParams: z.array(z.string()).default([]),
})
export type ChatMessageResponse = z.infer<typeof ChatMessageResponseSchema>

// ─── /generate-plan ────────────────────────────────────────────────────────

export const BusySlotSchema = z.object({
  date: dateKey,
  startTime: hhmm,
  endTime: hhmm,
  title: z.string().max(200),
})
export type BusySlot = z.infer<typeof BusySlotSchema>

export const ActiveGoalLoadSchema = z.object({
  title: z.string(),
  tasksRemaining: z.number().int().min(0),
  estimatedHoursRemaining: z.number().min(0),
})

export const UserProgressSchema = z.object({
  completionRate: z.number().min(0).max(1).optional(),
  completedTasks: z.number().int().min(0).optional(),
  totalTasks: z.number().int().min(0).optional(),
  avgDelayDays: z.number().optional(),
  recentlyCompleted: z.array(z.string()).optional(),
  recentlyMissed: z.array(z.string()).optional(),
  activeGoals: z.array(ActiveGoalLoadSchema).optional(),
})
export type UserProgress = z.infer<typeof UserProgressSchema>

// IANA timezone name (e.g. "America/New_York"). Sent by the client from
// UserProfile.timezone so scheduled times and Google Calendar events land in
// the user's actual zone rather than a server-side default. Loosely validated
// here — the server re-checks it against Intl before use.
export const timeZoneName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9+_\-]*(\/[A-Za-z0-9+_\-]+)*$/, "Not a valid IANA timezone name")

export const GeneratePlanRequestSchema = z.object({
  timeZone: timeZoneName.optional(),
  goal: z.string().min(1),
  durationDays: z.number().int().min(1).max(365),
  startDate: dateKey,
  learningStyle: z.string().optional(),
  preferredTime: z.string().optional(),
  dailyHours: z.number().min(0).max(24).optional(),
  currentSkillLevel: z.string().optional(),
  chatHistoryForContext: z.array(GeminiContentSchema).max(200).optional(),
  refinementInstruction: z.string().optional(),
  existingPlanTasksForRefinement: z.array(BackendTaskSchema).optional(),
  userProgress: UserProgressSchema.optional(),
  busySlots: z.array(BusySlotSchema).max(100).optional(),
})
export type GeneratePlanRequest = z.infer<typeof GeneratePlanRequestSchema>

export const GeneratePlanResponseSchema = z.object({
  humanReadablePlan: z.string(),
  structuredTasks: z.array(BackendTaskSchema),
})
export type GeneratePlanResponse = z.infer<typeof GeneratePlanResponseSchema>

// ─── /integrate-plan ───────────────────────────────────────────────────────

export const IntegratePlanRequestSchema = z.object({
  skillName: z.string().min(1),
  structuredTasks: z.array(BackendTaskSchema).min(1),
  timeZone: timeZoneName.optional(),
})
export type IntegratePlanRequest = z.infer<typeof IntegratePlanRequestSchema>

export const IntegrateResultSchema = z.object({
  index: z.number().int().min(0),
  status: z.enum(["synced", "failed"]),
  googleEventId: z.string().optional(),
  googleEventLink: z.string().optional(),
  error: z.string().optional(),
})
export type IntegrateResult = z.infer<typeof IntegrateResultSchema>

export const IntegratePlanResponseSchema = z.object({
  message: z.string(),
  results: z.array(IntegrateResultSchema),
  calendarEventLinks: z.array(z.string()).optional(),
})
export type IntegratePlanResponse = z.infer<typeof IntegratePlanResponseSchema>

// ─── /reschedule-event ─────────────────────────────────────────────────────

export const RescheduleRequestSchema = z
  .object({
    timeZone: timeZoneName.optional(),
    googleEventId: z.string().min(1),
    startTime: isoDateTimeLoose,
    endTime: isoDateTimeLoose,
  })
  .superRefine((d, ctx) => {
    if (new Date(d.endTime).getTime() <= new Date(d.startTime).getTime()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endTime"], message: "endTime must be after startTime" })
    }
  })
export type RescheduleRequest = z.infer<typeof RescheduleRequestSchema>

export const RescheduleResponseSchema = z.object({
  googleEventId: z.string(),
  googleEventLink: z.string().optional(),
})

// ─── /generate-quiz ────────────────────────────────────────────────────────

export const QuizRequestSchema = z.object({
  taskTitle: z.string().min(1).max(500),
  taskDescription: z.string().max(4000).optional(),
  goalTitle: z.string().max(500).optional(),
})
export type QuizRequest = z.infer<typeof QuizRequestSchema>

export const QuizQuestionSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string(),
})
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>

export const QuizResponseSchema = z.object({
  questions: z.array(QuizQuestionSchema),
})
export type QuizResponse = z.infer<typeof QuizResponseSchema>

// Tolerant parser for the LLM's raw quiz JSON.
export function parseQuizPayload(raw: unknown): QuizQuestion[] {
  const env = z.object({ questions: z.array(z.unknown()).default([]) }).safeParse(raw)
  if (!env.success) return []
  const out: QuizQuestion[] = []
  for (const q of env.data.questions) {
    const parsed = QuizQuestionSchema.safeParse(q)
    if (parsed.success) out.push(parsed.data)
  }
  return out.slice(0, 3)
}

// ─── Error envelope (consistent across routes) ─────────────────────────────

export const ApiErrorSchema = z.object({ detail: z.string() })
