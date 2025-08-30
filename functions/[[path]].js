// /functions/[[path]].js

// =================================================================
// SECTION 1: IMPORTS & SETUP
// =================================================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';

// =================================================================
// SECTION 2: THE LEARNING PLANNER SERVICE (REWRITTEN WITH FETCH)
// This version is fully compatible with Cloudflare's serverless environment.
// =================================================================
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
const CALENDAR_API_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const DEFAULT_TIMEZONE = 'Asia/Dhaka';

class LearningPlannerService {
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
        if (!data.candidates || data.candidates.length === 0) {
            console.error("No candidates returned from Gemini:", data);
            throw new Error("AI returned an empty response.");
        }
        return data.candidates[0].content.parts[0].text.trim();
    }

    async handleChatMessage(userMessage, chatHistory) {
        const contents = chatHistory.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: msg.parts,
        }));
        contents.push({ role: 'user', parts: [{ text: userMessage }] });

        try {
            return await this._callGemini(contents);
        } catch (error) {
            console.error(`Error in handleChatMessage: ${error}`);
            return `Sorry, I encountered an error: ${error.message}`;
        }
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
            promptParts.push("\n\n***PLAN REFINEMENT REQUEST***");
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
        
        let contents = [];
        if (otherParams.chatHistoryForContext) {
            contents = otherParams.chatHistoryForContext.map(msg => ({ 
                role: msg.role === 'ai' ? 'model' : 'user', 
                parts: msg.parts 
            }));
        }
        contents.push({ role: 'user', parts: [{ text: fullPrompt }] });

        try {
            const geminiResponseText = await this._callGemini(contents);

            const jsonStartTag = "---JSON_PLAN_START---";
            const jsonEndTag = "---JSON_PLAN_END---";
            if (!geminiResponseText.includes(jsonStartTag) || !geminiResponseText.includes(jsonEndTag)) {
                return [null, "AI did not provide a structured plan in the expected format."];
            }
            const humanReadablePlanContent = geminiResponseText.split(jsonStartTag)[0].trim();
            const jsonBlockRaw = geminiResponseText.split(jsonStartTag)[1].split(jsonEndTag)[0];
            const jsonBlockCleaned = jsonBlockRaw.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
            const parsedStructuredData = JSON.parse(jsonBlockCleaned);
            return [parsedStructuredData, humanReadablePlanContent];
        } catch (error) {
            console.error(`Error during plan generation: ${error}`);
            return [null, `An unexpected error occurred: ${error.message}`];
        }
    }

    async addPlanToCalendar(skillName, structuredTasks, accessToken) {
        const eventLinks = [];
        for (const taskData of structuredTasks) {
            const eventBody = {
                summary: taskData.summary || `${skillName} Task`,
                description: taskData.description || '',
                start: { dateTime: taskData.startTime, timeZone: DEFAULT_TIMEZONE },
                end: { dateTime: taskData.endTime, timeZone: DEFAULT_TIMEZONE },
            };

            const response = await fetch(CALENDAR_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(eventBody),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error(`API error creating calendar event:`, errorData);
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

// =================================================================
// SECTION 3: THE HONO APP AND ROUTES
// =================================================================
const app = new Hono();

const appOrigins = [ "http://localhost:3000", "https://goal-planner.pages.dev" ]; // <-- IMPORTANT: Change this to your real URL
app.use('*', cors({ origin: appOrigins }));

const handleServiceError = (error, c) => {
    console.error(`Service error: ${error}`);
    if (error.name === 'PermissionError') return c.json({ detail: error.message }, 401);
    return c.json({ detail: error.message }, 500);
};

// API Routes
app.post('/api/chat-message', async (c) => {
    try {
        const planner = new LearningPlannerService(c.env.GOOGLE_API_KEY);
        const { userMessage, chatHistory = [] } = await c.req.json();
        if (!userMessage) return c.json({ detail: "userMessage is required" }, 400);
        const aiResponseText = await planner.handleChatMessage(userMessage, chatHistory);
        return c.json({ aiResponse: aiResponseText });
    } catch (error) {
        return handleServiceError(error, c);
    }
});

app.post('/api/generate-plan', async (c) => {
    try {
        const planner = new LearningPlannerService(c.env.GOOGLE_API_KEY);
        const body = await c.req.json();
        const { goal, durationDays, startDate } = body;
        if (!goal || !durationDays || !startDate) {
            return c.json({ detail: "goal, durationDays, and startDate are required" }, 400);
        }
        const [structuredTasks, humanReadablePlan] = await planner.generateStructuredPlan({ ...body, startDateStr: startDate });
        if (!structuredTasks) return c.json({ detail: humanReadablePlan }, 422);
        return c.json({ humanReadablePlan, structuredTasks });
    } catch (error) {
        return handleServiceError(error, c);
    }
});

app.post('/api/integrate-plan', async (c) => {
    try {
        const planner = new LearningPlannerService(c.env.GOOGLE_API_KEY);
        const authHeader = c.req.header('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return c.json({ detail: "Authorization header is missing or invalid" }, 401);
        }
        const accessToken = authHeader.split(' ')[1];
        const { skillName, structuredTasks } = await c.req.json();
        if (!skillName || !structuredTasks) {
            return c.json({ detail: "skillName and structuredTasks are required" }, 400);
        }
        const [message, eventLinks] = await planner.addPlanToCalendar(skillName, structuredTasks, accessToken);
        if (!eventLinks) return c.json({ detail: message }, 400);
        return c.json({ message, calendarEventLinks: eventLinks });
    } catch (error) {
        return handleServiceError(error, c);
    }
});

app.get('/api', (c) => c.json({ message: "API is running!" }));

// =================================================================
// SECTION 4: THE CLOUDFLARE HANDLER
// =================================================================
export default {
    fetch: app.fetch,
};