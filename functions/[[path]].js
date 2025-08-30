// /functions/[[path]].js

// =================================================================
// SECTION 1: REQUIRED IMPORTS
// All backend dependencies are here.
// =================================================================
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// =================================================================
// SECTION 2: THE LEARNING PLANNER SERVICE CLASS
// All the logic from your planner_service.js is now inside this file.
// =================================================================
const GOOGLE_API_KEY_ENV_VAR = "GOOGLE_API_KEY";
const CALENDAR_API_VERSION = 'v3';
const CALENDAR_ID_PRIMARY = 'primary';
const DEFAULT_TIMEZONE = 'Asia/Dhaka'; // Hardcoded for serverless environment
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
            `   - "summary" (string): A concise title for the task (e.g., 'Learn FastAPI Basics').`,
            `   - "description" (string, nullable): A more detailed explanation of what the task involves.`,
            `   - "startTime" (string): ISO 8601 formatted datetime (YYYY-MM-DDTHH:MM:SS) in the local timezone of '${DEFAULT_TIMEZONE}'.`,
            `   - "endTime" (string): ISO 8601 formatted datetime (YYYY-MM-DDTHH:MM:SS) in the local timezone of '${DEFAULT_TIMEZONE}'.`,
            "\nPlace the JSON block **ONLY** after the human_readable_plan.",
            "Use the precise delimiters `---JSON_PLAN_START---` and `---JSON_PLAN_END---` to clearly mark the JSON block.",
            `The current date is ${currentDate}. Adjust suggested start dates if they fall in the past to a sensible future date.`,
        ];

        if (refinementInstruction && existingPlanTasksForRefinement) {
            promptParts.push("\n\n***PLAN REFINEMENT REQUEST***");
            promptParts.push(`Refine the following existing plan for the goal '${goal}':`);
            existingPlanTasksForRefinement.forEach((task, i) => {
                promptParts.push(`- Task ${i + 1}: '${task.summary || 'N/A'}' from ${task.startTime || 'N/A'} to ${task.endTime || 'N/A'}.`);
            });
            promptParts.push(`\nRefinement instruction: '${refinementInstruction}'`);
            promptParts.push(`The REFINED plan must now be for ${durationDays} days, starting around ${startDateStr}.`);
            if (dailyHours !== null) promptParts.push(`Maintain daily study hours around ${dailyHours} hours.`);
            if (preferredTimeStr) promptParts.push(`Consider the preferred time of day: ${preferredTimeStr}.`);
        } else {
            promptParts.push("\n\n***NEW PLAN GENERATION REQUEST***");
            promptParts.push(`- Goal/Skill: ${goal}`);
            promptParts.push(`- Duration: ${durationDays} days`);
            promptParts.push(`- Desired Start Date: ${startDateStr}`);
            if (learningStyle) promptParts.push(`- Learning Style: ${learningStyle}`);
            if (preferredTimeStr) promptParts.push(`- Preferred Study Time: ${preferredTimeStr}`);
            if (dailyHours !== null) promptParts.push(`- Daily Study Hours: ${dailyHours}`);
        }

        const fullPrompt = promptParts.join('\n');
        const geminiContentsForApiCall = chatHistoryForContext ? chatHistoryForContext.map(msg => ({ role: msg.role, parts: msg.parts })) : [];
        geminiContentsForApiCall.push({ role: 'user', parts: [{ text: fullPrompt }] });

        try {
            const result = await this.model.generateContent({ contents: geminiContentsForApiCall });
            const response = await result.response;
            if (response.promptFeedback && response.promptFeedback.blockReason) {
                return [null, `Plan generation failed due to content policy: ${response.promptFeedback.blockReason}.`];
            }
            const aiResponseText = response.text().trim();
            const jsonStartTag = "---JSON_PLAN_START---";
            const jsonEndTag = "---JSON_PLAN_END---";
            if (!aiResponseText.includes(jsonStartTag) || !aiResponseText.includes(jsonEndTag)) {
                return [null, "AI did not provide a structured plan in the expected format."];
            }
            const humanReadablePlanContent = aiResponseText.split(jsonStartTag)[0].trim();
            const jsonBlockRaw = aiResponseText.split(jsonStartTag)[1].split(jsonEndTag)[0];
            const jsonBlockCleaned = jsonBlockRaw.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
            const parsedStructuredData = JSON.parse(jsonBlockCleaned);
            this.lastGeneratedPlanTasks = parsedStructuredData;
            this.lastGeneratedPlanSkillName = goal;
            return [parsedStructuredData, humanReadablePlanContent];
        } catch (error) {
            console.error(`Error during plan generation: ${error}`);
            if (error instanceof SyntaxError) {
                 return [null, `AI generated an invalid structured plan: ${error.message}.`];
            }
            return [null, `An unexpected error occurred: ${error.message}`];
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
// SECTION 3: THE EXPRESS APP AND ROUTES
// All the logic from your main_api.js is now here.
// =================================================================
const app = express();

const appOrigins = [
    "http://localhost:3000",
    "https://goal-planner.pages.dev" // Example production URL
];
app.use(cors({ origin: appOrigins, credentials: true }));
app.use(express.json());

// Middleware
const validateChatMessageRequest = (req, res, next) => { req.body.userMessage ? next() : res.status(400).json({ detail: "userMessage is required" }); };
const validateGeneratePlanRequest = (req, res, next) => { (req.body.goal && req.body.durationDays && req.body.startDate) ? next() : res.status(400).json({ detail: "goal, durationDays, and startDate are required" }); };
const validateIntegratePlanRequest = (req, res, next) => { (req.body.skillName && req.body.structuredTasks) ? next() : res.status(400).json({ detail: "skillName and structuredTasks are required" }); };
const handleServiceError = (error, res) => {
    console.error(`Service error: ${error}`);
    if (error.name === 'PermissionError') return res.status(401).json({ detail: error.message });
    return res.status(500).json({ detail: error.message });
};

// API Routes
app.post('/api/chat-message', validateChatMessageRequest, async (req, res) => {
    try {
        const planner = new LearningPlannerService(req.env.GOOGLE_API_KEY);
        const { userMessage, chatHistory = [] } = req.body;
        const aiResponseText = await planner.handleChatMessage(userMessage, chatHistory);
        res.json({ aiResponse: aiResponseText });
    } catch (error) {
        handleServiceError(error, res);
    }
});

app.post('/api/generate-plan', validateGeneratePlanRequest, async (req, res) => {
    try {
        const planner = new LearningPlannerService(req.env.GOOGLE_API_KEY);
        const [structuredTasks, humanReadablePlan] = await planner.generateStructuredPlan({
            ...req.body,
            startDateStr: req.body.startDate,
        });
        if (!structuredTasks) return res.status(422).json({ detail: humanReadablePlan });
        res.json({ humanReadablePlan, structuredTasks });
    } catch (error) {
        handleServiceError(error, res);
    }
});

app.post('/api/integrate-plan', validateIntegratePlanRequest, async (req, res) => {
    try {
        const planner = new LearningPlannerService(req.env.GOOGLE_API_KEY);
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ detail: "Authorization header is missing or invalid" });
        }
        const accessToken = authHeader.split(' ')[1];
        const { skillName, structuredTasks } = req.body;
        const [message, eventLinks] = await planner.addPlanToCalendar(skillName, structuredTasks, accessToken);
        if (!eventLinks) return res.status(400).json({ detail: message });
        res.json({ message, calendarEventLinks: eventLinks });
    } catch (error) {
        handleServiceError(error, res);
    }
});

app.get('/api', (req, res) => {
    res.json({ message: "Learning Planner API is running!" });
});

// =================================================================
// SECTION 4: THE CLOUDFLARE HANDLER
// This is the entry point that connects Cloudflare to your Express app.
// =================================================================
export const onRequest = (context) => {
    // Inject environment variables from Cloudflare into the request object
    // so our Express handlers can access them.
    context.request.env = context.env;
    return app(context.request);
};