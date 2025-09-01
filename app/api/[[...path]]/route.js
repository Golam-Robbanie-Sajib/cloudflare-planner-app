// app/api/[[...path]]/route.js

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { cors } from 'hono/cors';
import { trimTrailingSlash } from 'hono/trailing-slash';

// This makes Vercel Edge Functions work, which is the same environment Cloudflare uses.
export const runtime = 'edge';

// --- Your existing LearningPlannerService class (unchanged) ---
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
const CALENDAR_API_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const DEFAULT_TIMEZONE = 'Asia/Dhaka';

class LearningPlannerService {
    // IMPORTANT: Access environment variables via process.env
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error("GOOGLE_API_KEY environment variable not found.");
        }
        this.apiKey = apiKey;
    }

    async _callGemini(contents) {
        const response = await fetch(`${GEMINI_API_URL}?key=${this.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            console.error("Gemini API Error:", errorData);
            throw new Error(errorData.error?.message || 'Gemini API request failed');
        }
        const data = await response.json();
        if (!data.candidates || !data.candidates[0]?.content?.parts) {
            console.error("No candidates or content parts returned from Gemini:", data);
            throw new Error("AI returned an empty or malformed response.");
        }
        return data.candidates[0].content.parts[0].text.trim();
    }

    // ... (the rest of your LearningPlannerService methods are unchanged) ...
    async handleChatMessage(userMessage, chatHistory) {
        const contents = (chatHistory || []).map(msg => ({ role: msg.role === 'user' ? 'user' : 'model', parts: msg.parts }));
        contents.push({ role: 'user', parts: [{ text: userMessage }] });
        try { return await this._callGemini(contents); }
        catch (error) { return `Sorry, I encountered an error: ${error.message}`; }
    }

    async generateStructuredPlan({ goal, durationDays, startDateStr, ...otherParams }) {
        const currentDate = new Date().toISOString().split('T')[0];
        const promptParts = [
            "As an AI specialized in generating structured learning plans, provide two distinct outputs:",
            "1. A 'human_readable_plan' which is a conversational, detailed, multi-paragraph summary of the learning plan.",
            "2. A 'structured_tasks' component as a JSON array of objects. EACH object must represent a single task.",
            "Strictly adhere to the following JSON structure for each task object:",
            "   - `summary` (string): A concise title for the task.",
            "   - `description` (string, nullable): A more detailed explanation of the task.",
            `   - "startTime" (string): ISO 8601 formatted datetime (YYYY-MM-DDTHH:MM:SS) in the timezone '${DEFAULT_TIMEZONE}'.`,
            `   - "endTime" (string): ISO 8601 formatted datetime (YYYY-MM-DDTHH:MM:SS) in the timezone '${DEFAULT_TIMEZONE}'.`,
            "\nPlace the JSON block **ONLY** after the human_readable_plan.",
            "Use the precise delimiters `---JSON_PLAN_START---` and `---JSON_PLAN_END---`.",
            `The current date is ${currentDate}. Adjust start dates if they are in the past.`,
        ];
        if (otherParams.refinementInstruction && otherParams.existingPlanTasksForRefinement) {
            promptParts.push(`\n\n***PLAN REFINEMENT REQUEST***`);
            promptParts.push(`Refine the existing plan for the goal '${goal}':`);
            otherParams.existingPlanTasksForRefinement.forEach((task, i) => {
                promptParts.push(`- Task ${i + 1}: '${task.summary}' from ${task.startTime} to ${task.endTime}.`);
            });
            promptParts.push(`\nRefinement instruction: '${otherParams.refinementInstruction}'`);
            promptParts.push(`The REFINED plan must now be for ${durationDays} days, starting around ${startDateStr}.`);
        } else {
            promptParts.push("\n\n***NEW PLAN GENERATION REQUEST***");
            promptParts.push(`- Goal/Skill: ${goal}`);
            promptParts.push(`- Duration: ${durationDays} days`);
            promptParts.push(`- Desired Start Date: ${startDateStr}`);
        }
        const fullPrompt = promptParts.join('\n');
        let contents = otherParams.chatHistoryForContext ? otherParams.chatHistoryForContext.map(msg => ({ role: msg.role === 'ai' ? 'model' : 'user', parts: msg.parts })) : [];
        contents.push({ role: 'user', parts: [{ text: fullPrompt }] });
        try {
            const geminiResponseText = await this._callGemini(contents);
            const jsonStartTag = "---JSON_PLAN_START---";
            const jsonEndTag = "---JSON_PLAN_END---";
            if (!geminiResponseText.includes(jsonStartTag) || !geminiResponseText.includes(jsonEndTag)) return [null, "AI did not provide a structured plan in the expected format."];
            const humanReadablePlanContent = geminiResponseText.split(jsonStartTag)[0].trim();
            const jsonBlockRaw = geminiResponseText.split(jsonStartTag)[1].split(jsonEndTag)[0];
            const jsonBlockCleaned = jsonBlockRaw.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
            const parsedStructuredData = JSON.parse(jsonBlockCleaned);
            return [parsedStructuredData, humanReadablePlanContent];
        } catch (error) { return [null, `An unexpected error occurred: ${error.message}`]; }
    }
    
    async addPlanToCalendar(skillName, structuredTasks, accessToken) {
        const eventLinks = [];
        for (const taskData of structuredTasks) {
            const eventBody = { summary: taskData.summary || `${skillName} Task`, description: taskData.description || '', start: { dateTime: taskData.startTime, timeZone: DEFAULT_TIMEZONE }, end: { dateTime: taskData.endTime, timeZone: DEFAULT_TIMEZONE }, };
            const response = await fetch(CALENDAR_API_URL, { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', }, body: JSON.stringify(eventBody), });
            if (!response.ok) {
                const errorData = await response.json();
                const error = new Error(errorData.error?.message || "A Google Calendar API error occurred.");
                if (response.status === 401) error.name = 'PermissionError';
                throw error;
            }
            const eventData = await response.json();
            eventLinks.push(eventData.htmlLink);
        }
        return [`Successfully added ${eventLinks.length} tasks to Google Calendar.`, eventLinks];
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
        const planner = new LearningPlannerService(process.env.GOOGLE_API_KEY);
        const { userMessage, chatHistory = [] } = await c.req.json();
        const aiResponseText = await planner.handleChatMessage(userMessage, chatHistory);
        return c.json({ aiResponse: aiResponseText });
    } catch (error) { return handleServiceError(error, c); }
});

app.post('/generate-plan', async (c) => {
    try {
        const planner = new LearningPlannerService(process.env.GOOGLE_API_KEY);
        const body = await c.req.json();
        const [tasks, plan] = await planner.generateStructuredPlan({ ...body, startDateStr: body.startDate });
        if (!tasks) return c.json({ detail: plan }, 422);
        return c.json({ humanReadablePlan: plan, structuredTasks: tasks });
    } catch (error) { return handleServiceError(error, c); }
});

app.post('/integrate-plan', async (c) => {
    try {
        const planner = new LearningPlannerService(process.env.GOOGLE_API_KEY);
        const authHeader = c.req.header('authorization');
        const accessToken = authHeader?.split(' ')[1];
        if (!accessToken) return c.json({ detail: "Authorization header is missing" }, 401);
        const { skillName, structuredTasks } = await c.req.json();
        const [message, links] = await planner.addPlanToCalendar(skillName, structuredTasks, accessToken);
        if (!links) return c.json({ detail: message }, 400);
        return c.json({ message, calendarEventLinks: links });
    } catch (error) { return handleServiceError(error, c); }
});

app.get('/', (c) => c.json({ message: "API is running!" }));


// Export the handlers for GET, POST, etc.
export const GET = handle(app);
export const POST = handle(app);