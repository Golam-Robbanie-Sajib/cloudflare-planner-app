// app/api/[[...path]]/route.js

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { cors } from 'hono/cors';
import { trimTrailingSlash } from 'hono/trailing-slash';

// Edge runtime — same environment as Cloudflare Workers.
export const runtime = 'edge';

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";
const CALENDAR_API_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const DEFAULT_TIMEZONE = 'Asia/Dhaka';

// --- Validation helpers -----------------------------------------------------
// AI-generated task fields aren't trusted: anything that can't be parsed as a
// real datetime or has end <= start is dropped before it reaches Firestore or
// Google Calendar. A plan with zero surviving tasks is treated as a failure.

const ISO_LOOSE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

function validateAndSanitizeTask(task) {
    if (!task || typeof task !== 'object') return null;
    const summary = typeof task.summary === 'string' ? task.summary.trim() : '';
    if (!summary) return null;
    const startStr = typeof task.startTime === 'string' ? task.startTime : '';
    const endStr = typeof task.endTime === 'string' ? task.endTime : '';
    if (!ISO_LOOSE.test(startStr) || !ISO_LOOSE.test(endStr)) return null;
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    if (end.getTime() <= start.getTime()) return null;
    return {
        summary,
        description: typeof task.description === 'string' ? task.description : null,
        startTime: startStr,
        endTime: endStr,
    };
}

function validateTaskBatch(tasks) {
    if (!Array.isArray(tasks)) return [];
    return tasks.map(validateAndSanitizeTask).filter(Boolean);
}

// Convert the Gemini-style `contents` array the frontend still sends
// (`{role: 'user'|'model', parts: [{text}]}`) into OpenAI chat-completions
// `messages` (`{role: 'user'|'assistant', content}`). Keeps the frontend
// contract intact during the migration.
function geminiContentsToOpenAIMessages(contents) {
    return contents.map((entry) => {
        const text = (entry.parts || [])
            .map((p) => (typeof p === 'string' ? p : p?.text || ''))
            .join('\n');
        return {
            role: entry.role === 'model' ? 'assistant' : 'user',
            content: text,
        };
    });
}

class LearningPlannerService {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error("GROQ_API_KEY environment variable not found.");
        }
        this.apiKey = apiKey;
    }

    async _callGroq({ systemPrompt, messages, jsonMode = false, temperature = 0.4 }) {
        const fullMessages = [
            { role: 'system', content: systemPrompt },
            ...messages,
        ];

        const body = {
            model: GROQ_MODEL,
            messages: fullMessages,
            temperature,
        };
        if (jsonMode) {
            body.response_format = { type: 'json_object' };
        }

        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            let errorPayload;
            try { errorPayload = await response.json(); } catch { errorPayload = { error: { message: await response.text() } }; }
            console.error("Groq API Error:", errorPayload);
            throw new Error(errorPayload.error?.message || 'Groq API request failed');
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            console.error("No content returned from Groq:", data);
            throw new Error("AI returned an empty or malformed response.");
        }
        return content.trim();
    }

    async handleChatMessage(userMessage, chatHistory) {
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
1. Carefully read the ENTIRE chat history (up to 131K tokens of context). Information may be spread across multiple turns — e.g. the user says "I want to learn React" in one message and "for two weeks, two hours a day" in another. Combine them.
2. Essential parameters for a plan are: goal (skill/topic), durationDays (total length), dailyHours (or weekly hours), startDate (or a clear relative date like "tomorrow"). currentSkillLevel is helpful but not strictly required — only ask if the goal is technical and the level is genuinely ambiguous.
3. If ANY essential parameter is missing or ambiguous, set "intent" to "chat" and put a concise, friendly question in "response" that asks for the most important missing piece (one thing at a time — do not bombard the user). List all still-missing params in "missingParams".
4. Only when all essential parameters are clearly established, set "intent" to "create_goal", populate "goalTitle" with a short title (e.g. "Learn React in 14 days"), and put a confirmation sentence in "response" telling the user you have what you need and will generate the plan.
5. If the user is just chatting / asking a question / refining an existing plan (not stating a new goal), set "intent" to "chat" with an empty "missingParams" array and a helpful conversational "response".
6. Never invent values for "extractedParams"; use null when unknown. Dates must be ISO YYYY-MM-DD if you have them.

Output ONLY the JSON object.`;

        const messages = geminiContentsToOpenAIMessages(chatHistory);
        messages.push({ role: 'user', content: userMessage });

        try {
            const raw = await this._callGroq({ systemPrompt, messages, jsonMode: true, temperature: 0.3 });
            const parsed = JSON.parse(raw);
            return {
                intent: parsed.intent === 'create_goal' ? 'create_goal' : 'chat',
                goalTitle: parsed.goalTitle ?? null,
                response: parsed.response || "Could you tell me a bit more about what you'd like to learn?",
                extractedParams: parsed.extractedParams ?? null,
                missingParams: Array.isArray(parsed.missingParams) ? parsed.missingParams : [],
            };
        } catch (error) {
            console.error("Error parsing AI response for intent detection:", error);
            return { intent: "chat", goalTitle: null, response: "I had a little trouble understanding that. Could you please rephrase?" };
        }
    }

    async generateStructuredPlan({ goal, durationDays, startDateStr, ...otherParams }) {
        const currentDate = new Date().toISOString().split('T')[0];

        const systemPrompt = `You are an AI specialized in generating structured, realistic learning plans.

You always respond with a single JSON object — no prose outside it — matching this schema exactly:
{
  "human_readable_plan": string,
  "structured_tasks": [
    {
      "summary": string,
      "description": string | null,
      "startTime": string,
      "endTime": string
    }
  ]
}

Field rules:
- "human_readable_plan": a conversational, multi-paragraph narrative summarizing the plan, week by week or phase by phase.
- "structured_tasks": one entry per concrete calendar block. Each task must be schedulable as a single Google Calendar event.
- "startTime" / "endTime": ISO 8601 datetime WITHOUT a timezone offset (e.g. "2025-04-12T09:00:00"). They will be interpreted in the timezone '${DEFAULT_TIMEZONE}'.
- The current date is ${currentDate}. Never schedule tasks in the past — if the requested start date is in the past, shift the plan forward.
- Mix theory, practice, and review tasks. Build difficulty progressively. Keep individual task duration realistic (typically 30–180 minutes).
- Match the user's daily/weekly hour availability if it is specified.
- For refinement requests, preserve the spirit of the previous plan and apply only the requested adjustments.`;

        const userPromptParts = [];
        if (otherParams.refinementInstruction && otherParams.existingPlanTasksForRefinement) {
            userPromptParts.push(`***PLAN REFINEMENT REQUEST***`);
            userPromptParts.push(`Refine the existing plan for the goal '${goal}'. Existing tasks:`);
            otherParams.existingPlanTasksForRefinement.forEach((task, i) => {
                userPromptParts.push(`- Task ${i + 1}: '${task.summary}' from ${task.startTime} to ${task.endTime}.`);
            });
            userPromptParts.push(`\nRefinement instruction: '${otherParams.refinementInstruction}'`);
            userPromptParts.push(`The refined plan must cover ${durationDays} days, starting around ${startDateStr}.`);
        } else {
            userPromptParts.push(`***NEW PLAN GENERATION REQUEST***`);
            userPromptParts.push(`- Goal/Skill: ${goal}`);
            userPromptParts.push(`- Duration: ${durationDays} days`);
            userPromptParts.push(`- Desired Start Date: ${startDateStr}`);
            if (otherParams.dailyHours) userPromptParts.push(`- Daily Hours Available: ${otherParams.dailyHours}`);
            if (otherParams.learningStyle) userPromptParts.push(`- Preferred Learning Style: ${otherParams.learningStyle}`);
            if (otherParams.preferredTime) userPromptParts.push(`- Preferred Time of Day: ${otherParams.preferredTime}`);
            if (otherParams.currentSkillLevel) userPromptParts.push(`- Current Skill Level: ${otherParams.currentSkillLevel}`);
        }
        if (Array.isArray(otherParams.busySlots) && otherParams.busySlots.length > 0) {
            userPromptParts.push(`\n***BUSY SLOTS (the user already has these — do NOT schedule overlapping events; pick different times or different days)***`);
            otherParams.busySlots.slice(0, 50).forEach((s) => {
                userPromptParts.push(`- ${s.date} ${s.startTime}–${s.endTime}: ${s.title}`);
            });
        }
        if (otherParams.userProgress && typeof otherParams.userProgress === 'object') {
            const p = otherParams.userProgress;
            userPromptParts.push(`\n***USER PROGRESS SIGNAL (use this to calibrate difficulty/pace)***`);
            if (typeof p.completionRate === 'number') userPromptParts.push(`- Past completion rate: ${(p.completionRate * 100).toFixed(0)}% (${p.completedTasks ?? '?'} of ${p.totalTasks ?? '?'} previous tasks completed)`);
            if (typeof p.avgDelayDays === 'number') userPromptParts.push(`- Average task slippage: ${p.avgDelayDays.toFixed(1)} days late`);
            if (Array.isArray(p.recentlyCompleted) && p.recentlyCompleted.length) userPromptParts.push(`- Recently completed: ${p.recentlyCompleted.slice(0, 5).join('; ')}`);
            if (Array.isArray(p.recentlyMissed) && p.recentlyMissed.length) userPromptParts.push(`- Recently skipped/missed: ${p.recentlyMissed.slice(0, 5).join('; ')}`);
            userPromptParts.push(`If completion rate is below 50%, reduce daily intensity and prefer shorter sessions. If above 85%, push slightly harder.`);
        }
        userPromptParts.push(`\nReturn ONLY the JSON object described in the system prompt.`);
        const userPrompt = userPromptParts.join('\n');

        const messages = otherParams.chatHistoryForContext
            ? geminiContentsToOpenAIMessages(otherParams.chatHistoryForContext)
            : [];
        messages.push({ role: 'user', content: userPrompt });

        try {
            const raw = await this._callGroq({ systemPrompt, messages, jsonMode: true, temperature: 0.5 });
            const parsed = JSON.parse(raw);
            const rawTasks = Array.isArray(parsed.structured_tasks) ? parsed.structured_tasks : [];
            const sanitized = validateTaskBatch(rawTasks);
            const humanReadable = typeof parsed.human_readable_plan === 'string' ? parsed.human_readable_plan : '';
            if (sanitized.length === 0) {
                return [null, "AI did not return any valid scheduled tasks. Please try again."];
            }
            return [sanitized, humanReadable];
        } catch (error) {
            return [null, `An unexpected error occurred: ${error.message}`];
        }
    }

    // Returns one result object per input task so the frontend can update each
    // task's sync status independently. We continue past per-task errors so a
    // single bad event doesn't abort the whole batch — but auth errors (401)
    // still bubble up because they apply to every subsequent call.
    async addPlanToCalendar(skillName, structuredTasks, accessToken) {
        const results = [];
        for (let i = 0; i < structuredTasks.length; i++) {
            const taskData = structuredTasks[i];
            const eventBody = {
                summary: taskData.summary || `${skillName} Task`,
                description: taskData.description || '',
                start: { dateTime: taskData.startTime, timeZone: DEFAULT_TIMEZONE },
                end: { dateTime: taskData.endTime, timeZone: DEFAULT_TIMEZONE },
            };
            try {
                const response = await fetch(CALENDAR_API_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'User-Agent': 'TaskFlow/1.0',
                    },
                    body: JSON.stringify(eventBody),
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    if (response.status === 401) {
                        const err = new Error(errorData.error?.message || "Google Calendar access expired.");
                        err.name = 'PermissionError';
                        throw err;
                    }
                    results.push({ index: i, status: 'failed', error: errorData.error?.message || `HTTP ${response.status}` });
                    continue;
                }
                const eventData = await response.json();
                results.push({
                    index: i,
                    status: 'synced',
                    googleEventId: eventData.id,
                    googleEventLink: eventData.htmlLink,
                });
            } catch (e) {
                if (e.name === 'PermissionError') throw e;
                results.push({ index: i, status: 'failed', error: e.message });
            }
        }
        const okCount = results.filter(r => r.status === 'synced').length;
        return [`Synced ${okCount}/${structuredTasks.length} tasks to Google Calendar.`, results];
    }
}


// Hono app setup
const app = new Hono().basePath('/api');
app.use('*', trimTrailingSlash());

// CORS configuration
const appOrigins = [
    'http://localhost:3000',
    'https://cloudflare-planner-app.pages.dev' // Add your production URL here
];
app.use('*', cors({
    origin: (origin) => {
        // Allow requests from your specified origins
        if (appOrigins.includes(origin)) {
            return origin;
        }
        // You might want a default behavior for other origins,
        // for example, deny them by returning one of your allowed origins or null.
        return appOrigins[0];
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
 }));

const handleServiceError = (error, c) => {
    console.error(`Service error: ${error}`);
    if (error.name === 'PermissionError') return c.json({ detail: error.message }, 401);
    return c.json({ detail: error.message }, 500);
};

// API Routes
app.post('/chat-message', async (c) => {
    try {
        const planner = new LearningPlannerService(process.env.GROQ_API_KEY);
        const { userMessage, chatHistory = [] } = await c.req.json();
        const aiResponseObject = await planner.handleChatMessage(userMessage, chatHistory);
        return c.json(aiResponseObject);
    } catch (error) { return handleServiceError(error, c); }
});

app.post('/generate-plan', async (c) => {
    try {
        const planner = new LearningPlannerService(process.env.GROQ_API_KEY);
        const body = await c.req.json();
        const [tasks, plan] = await planner.generateStructuredPlan({ ...body, startDateStr: body.startDate });
        if (!tasks) return c.json({ detail: plan }, 422);
        return c.json({ humanReadablePlan: plan, structuredTasks: tasks });
    } catch (error) { return handleServiceError(error, c); }
});

app.post('/integrate-plan', async (c) => {
    try {
        // /integrate-plan doesn't actually need the LLM key — only the Google
        // access token — so don't gate on GROQ_API_KEY here.
        const planner = Object.create(LearningPlannerService.prototype);
        const authHeader = c.req.header('authorization');
        const accessToken = authHeader?.split(' ')[1];
        if (!accessToken) return c.json({ detail: "Authorization header is missing" }, 401);
        const { skillName, structuredTasks } = await c.req.json();
        const sanitized = validateTaskBatch(structuredTasks);
        if (sanitized.length === 0) {
            return c.json({ detail: "No valid tasks were provided to sync." }, 400);
        }
        const [message, results] = await planner.addPlanToCalendar(skillName, sanitized, accessToken);
        // Keep `calendarEventLinks` for back-compat with any older clients, but
        // the canonical response is now `results` — one entry per input task.
        const calendarEventLinks = results.filter(r => r.status === 'synced').map(r => r.googleEventLink);
        return c.json({ message, results, calendarEventLinks });
    } catch (error) { return handleServiceError(error, c); }
});

// PATCH a single Google Calendar event's start/end. Used by the drag-to-
// reschedule UI on /calendar. We deliberately do NOT take the event id from
// query params — the body is JSON so Hono+edge handles it consistently.
app.post('/reschedule-event', async (c) => {
    try {
        const authHeader = c.req.header('authorization');
        const accessToken = authHeader?.split(' ')[1];
        if (!accessToken) return c.json({ detail: "Authorization header is missing" }, 401);
        const { googleEventId, startTime, endTime } = await c.req.json();
        if (!googleEventId || !ISO_LOOSE.test(startTime || '') || !ISO_LOOSE.test(endTime || '')) {
            return c.json({ detail: "googleEventId, startTime and endTime (ISO) are required." }, 400);
        }
        if (new Date(endTime) <= new Date(startTime)) {
            return c.json({ detail: "endTime must be after startTime." }, 400);
        }
        const url = `${CALENDAR_API_URL}/${encodeURIComponent(googleEventId)}`;
        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                start: { dateTime: startTime, timeZone: DEFAULT_TIMEZONE },
                end: { dateTime: endTime, timeZone: DEFAULT_TIMEZONE },
            }),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 401) {
                const err = new Error(errorData.error?.message || "Google Calendar access expired.");
                err.name = 'PermissionError';
                throw err;
            }
            return c.json({ detail: errorData.error?.message || `HTTP ${response.status}` }, response.status);
        }
        const eventData = await response.json();
        return c.json({ googleEventId: eventData.id, googleEventLink: eventData.htmlLink });
    } catch (error) { return handleServiceError(error, c); }
});

app.get('/', (c) => c.json({ message: "API is running!" }));


// Export the handlers for GET, POST, etc.
export const GET = handle(app);
export const POST = handle(app);
