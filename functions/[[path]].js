// /functions/[[path]].js

// =================================================================
// SECTION 1: REQUIRED IMPORTS
// We now import Hono and its CORS middleware.
// =================================================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

// =================================================================
// SECTION 2: THE LEARNING PLANNER SERVICE CLASS
// All of your original business logic, including the prompt, is here.
// This code is copied directly from your planner_service.js.
// =================================================================
const GOOGLE_API_KEY_ENV_VAR = "GOOGLE_API_KEY";
const CALENDAR_API_VERSION = 'v3';
const CALENDAR_ID_PRIMARY = 'primary';
const DEFAULT_TIMEZONE = 'Asia/Dhaka';
const GEMINI_MODEL_NAME = 'gemini-1.5-flash';

class LearningPlannerService {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error(`${GOOGLE_API_KEY_ENV_VAR} not found in environment. Service cannot start.`);
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });

        this.lastGeneratedPlanTasks = null;
        this.lastGeneratedPlanSkillName = null;
        this.lastIntegratedCalendarLinks = null;
    }

    _parsePreferredTimeToDatetimeTime(preferredTimeStr) {
        let hours = 9;
        let minutes = 0;
        if (!preferredTimeStr) return { hours, minutes };
        try {
            const timeMatch = preferredTimeStr.match(/(\d{1,2})(?:[:.](\d{1,2}))?\s*(am|pm)?/i);
            if (timeMatch) {
                let hrPart = parseInt(timeMatch[1]);
                const minPartStr = timeMatch[2];
                minutes = minPartStr ? parseInt(minPartStr) : 0;
                const ampmPart = (timeMatch[3] || '').toLowerCase();
                if (ampmPart === 'pm' && hrPart >= 1 && hrPart < 12) hours = hrPart + 12;
                else if (ampmPart === 'am' && hrPart === 12) hours = 0;
                else hours = hrPart;
                if (!(hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59)) {
                    hours = 9;
                    minutes = 0;
                }
            } else if (preferredTimeStr.toLowerCase().includes('morning')) hours = 9;
            else if (preferredTimeStr.toLowerCase().includes('afternoon')) hours = 14;
            else if (preferredTimeStr.toLowerCase().includes('evening') || preferredTimeStr.toLowerCase().includes('night')) hours = 19;
        } catch (error) { /* Keep default */ }
        return { hours, minutes };
    }

    async handleChatMessage(userMessage, chatHistory) {
        const formattedHistory = [];
        for (const msg of chatHistory) {
            const role = msg.role === 'model' ? 'model' : 'user';
            const textParts = (msg.parts || []).filter(part => part.text).map(part => part.text);
            if (textParts.length > 0) {
                formattedHistory.push({ role, parts: [{ text: textParts.join('\n') }] });
            }
        }
        try {
            const chat = this.model.startChat({ history: formattedHistory });
            const result = await chat.sendMessage(userMessage);
            const response = await result.response;
            return response.text().trim();
        } catch (error) {
            console.error(`Error in handleChatMessage: ${error}`);
            return `Sorry, I encountered an error trying to process your message: ${error.message}`;
        }
    }

    async generateStructuredPlan({ goal, durationDays, startDateStr, learningStyle = null, preferredTimeStr = null, dailyHours = null, chatHistoryForContext = null, refinementInstruction = null, existingPlanTasksForRefinement = null }) {
        const currentDate = new Date().toISOString().split('T')[0];
        const promptParts = [
            "As an AI specialized in generating structured learning plans, provide two distinct outputs:",
            "1. A 'human_readable_plan' which is a conversational, detailed, multi-paragraph summary of the learning plan.",
            "2. A 'structured_tasks' component as a JSON array of objects. EACH object must represent a single task.",
            "Strictly adhere to the following JSON structure for each task object:",
            "   - `summary` (string): A concise title for the task (e.g., 'Learn FastAPI Basics', 'Build User Authentication').",
            "   - `description` (string, nullable): A more detailed explanation of what the task involves. Can be null if not applicable.",
            "   - `startTime` (string): ISO 8601 formatted datetime (YYYY-MM-DDTHH:MM:SS) for when the task starts. Ensure it includes time and is in the local timezone of '" + DEFAULT_TIMEZONE + "'.",
            "   - `endTime` (string): ISO 8601 formatted datetime (YYYY-MM-DDTHH:MM:SS) for when the task ends. Must be after startTime and in the local timezone of '" + DEFAULT_TIMEZONE + "'.",
            "\nPlace the JSON block **ONLY** after the human_readable_plan.",
            "Use the precise delimiters `---JSON_PLAN_START---` and `---JSON_PLAN_END---` to clearly mark the JSON block.",
            "Ensure the JSON is valid and can be directly parsed without issues.",
            `The current date is ${currentDate}. Adjust suggested start dates if they fall in the past to a sensible future date (e.g., next Monday).`
        ];

        if (refinementInstruction && existingPlanTasksForRefinement) {
            promptParts.push("\n\n***PLAN REFINEMENT REQUEST***");
            promptParts.push(`Refine the following existing plan for the goal '${goal}':`);
            existingPlanTasksForRefinement.forEach((task, i) => {
                promptParts.push(`- Task ${i + 1}: '${task.summary || 'N/A'}' from ${task.startTime || 'N/A'} to ${task.endTime || 'N/A'}. Desc: ${task.description || 'N/A'}`);
            });
            promptParts.push(`\nRefinement instruction: '${refinementInstruction}'`);
            promptParts.push(`The REFINED plan must now be for ${durationDays} days, starting around ${startDateStr}.`);
            if (dailyHours !== null) promptParts.push(`Maintain daily study hours around ${dailyHours} hours.`);
            if (preferredTimeStr) promptParts.push(`Consider the preferred time of day: ${preferredTimeStr}.`);
        } else {
            promptParts.push("\n\n***NEW PLAN GENERATION REQUEST***");
            promptParts.push("Generate a detailed learning plan with the following details:");
            promptParts.push(`- Goal/Skill: ${goal}`);
            promptParts.push(`- Duration: ${durationDays} days`);
            promptParts.push(`- Desired Start Date: ${startDateStr}`);
            if (learningStyle) promptParts.push(`- Learning Style: ${learningStyle}`);
            if (preferredTimeStr) promptParts.push(`- Preferred Study Time: ${preferredTimeStr}`);
            if (dailyHours !== null) promptParts.push(`- Daily Study Hours: ${dailyHours}`);
        }

        const fullPrompt = promptParts.join('\n');
        const geminiContentsForApiCall = [];
        if (chatHistoryForContext) {
            for (const msg of chatHistoryForContext) {
                const role = msg.role === 'model' ? 'model' : 'user';
                const textParts = (msg.parts || []).filter(part => part.text).map(part => part.text);
                if (textParts.length > 0) {
                    geminiContentsForApiCall.push({ role, parts: [{ text: textParts.join('\n') }] });
                }
            }
        }
        geminiContentsForApiCall.push({ role: 'user', parts: [{ text: fullPrompt }] });

        try {
            const result = await this.model.generateContent({ contents: geminiContentsForApiCall });
            const response = await result.response;
            if (response.promptFeedback && response.promptFeedback.blockReason) {
                return [null, `Plan generation failed due to content policy: ${response.promptFeedback.blockReason}. Please rephrase.`];
            }
            const aiResponseText = response.text().trim();
            const jsonStartTag = "---JSON_PLAN_START---";
            const jsonEndTag = "---JSON_PLAN_END---";
            if (!aiResponseText.includes(jsonStartTag) || !aiResponseText.includes(jsonEndTag)) {
                return [null, "AI did not provide a structured plan in the expected format (missing delimiters)."];
            }
            const humanReadablePlanContent = aiResponseText.split(jsonStartTag)[0].trim();
            const jsonBlockRaw = aiResponseText.split(jsonStartTag)[1].split(jsonEndTag)[0];
            const jsonBlockCleaned = jsonBlockRaw.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
            const parsedStructuredData = JSON.parse(jsonBlockCleaned);
            this.lastGeneratedPlanTasks = parsedStructuredData;
            this.lastGeneratedPlanSkillName = goal;
            return [parsedStructuredData, humanReadablePlanContent];
        } catch (error) {
            console.error(`Error during plan generation or parsing: ${error}`);
            if (error instanceof SyntaxError) {
                 return [null, `AI generated an invalid structured plan: ${error.message}.`];
            }
            return [null, `An unexpected error occurred while generating the plan: ${error.message}`];
        }
    }

    async addPlanToCalendar(skillName, structuredTasks, accessToken) {
        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const calendarService = google.calendar({ version: CALENDAR_API_VERSION, auth });
            const createdEventLinks = [];
            for (const taskData of structuredTasks) {
                const eventBody = {
                    summary: taskData.summary || `${skillName} Task`,
                    description: taskData.description || '',
                    start: { dateTime: taskData.startTime, timeZone: DEFAULT_TIMEZONE },
                    end: { dateTime: taskData.endTime, timeZone: DEFAULT_TIMEZONE },
                };
                const response = await calendarService.events.insert({ calendarId: CALENDAR_ID_PRIMARY, resource: eventBody });
                createdEventLinks.push(response.data.htmlLink);
            }
            this.lastIntegratedCalendarLinks = createdEventLinks;
            return [`Successfully added ${createdEventLinks.length} tasks to Google Calendar.`, createdEventLinks];
        } catch (error) {
            if (error.code === 401) {
                const permError = new Error("Google API token is invalid or expired. Please sign in again.");
                permError.name = 'PermissionError';
                throw permError;
            }
            console.error(`API error creating calendar event: ${error}`);
            throw new Error(`A Google Calendar API error occurred: ${error.message}`);
        }
    }
}


// =================================================================
// SECTION 3: THE HONO APP AND ROUTES
// This replaces the Express app.
// =================================================================
const app = new Hono();

// Middleware
const appOrigins = [
    "http://localhost:3000",
    "https://goal-planner.pages.dev" // Replace with your actual deployed URL
];
app.use('*', cors({ origin: appOrigins }));

const handleServiceError = (error, c) => {
    console.error(`Service error: ${error}`);
    if (error.name === 'PermissionError') {
        return c.json({ detail: error.message }, 401);
    }
    return c.json({ detail: error.message }, 500);
};

// API Routes rewritten for Hono
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

        const [structuredTasks, humanReadablePlan] = await planner.generateStructuredPlan({
            ...body,
            startDateStr: startDate,
        });
        
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

app.get('/api', (c) => {
    return c.json({ message: "Learning Planner API is running!" });
});


// =================================================================
// SECTION 4: THE CLOUDFLARE HANDLER
// Hono apps can be exported directly for serverless environments.
// =================================================================
export const onRequest = app.fetch;