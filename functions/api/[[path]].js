// functions/api/[[path]].js
// Cloudflare Pages Functions API handler

const GOOGLE_API_KEY_ENV_VAR = "GOOGLE_API_KEY";
const DEFAULT_TIMEZONE = 'Asia/Dhaka';
const GEMINI_MODEL_NAME = 'gemini-1.5-flash';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true'
};

// Helper function to create CORS response
function corsResponse(response) {
  Object.keys(corsHeaders).forEach(key => {
    response.headers.set(key, corsHeaders[key]);
  });
  return response;
}

// LearningPlannerService class
class LearningPlannerService {
    constructor(env) {
        const apiKey = env[GOOGLE_API_KEY_ENV_VAR];
        if (!apiKey) {
            throw new Error(`${GOOGLE_API_KEY_ENV_VAR} not found in environment.`);
        }
        this.apiKey = apiKey;
    }

    async handleChatMessage(userMessage, chatHistory = []) {
        const formattedHistory = [];
        
        for (const msg of chatHistory) {
            const role = msg.role === 'model' ? 'model' : 'user';
            const textParts = (msg.parts || [])
                .filter(part => part.text)
                .map(part => part.text);
            
            if (textParts.length > 0) {
                formattedHistory.push({
                    role,
                    parts: [{ text: textParts.join('\n') }]
                });
            }
        }

        try {
            const requestBody = {
                contents: [
                    ...formattedHistory,
                    {
                        role: 'user',
                        parts: [{ text: userMessage }]
                    }
                ]
            };

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_NAME}:generateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.promptFeedback && result.promptFeedback.blockReason) {
                return `Sorry, I cannot process this message due to content policy: ${result.promptFeedback.blockReason}`;
            }

            const text = result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts[0] ? result.candidates[0].content.parts[0].text : null;
            return text ? text.trim() : "Sorry, I couldn't generate a response.";
        } catch (error) {
            console.error(`Error in handleChatMessage: ${error}`);
            return `Sorry, I encountered an error: ${error.message}`;
        }
    }

    async generateStructuredPlan(params) {
        const {
            goal,
            durationDays,
            startDateStr,
            learningStyle = null,
            preferredTimeStr = null,
            dailyHours = null,
            chatHistoryForContext = null,
            refinementInstruction = null,
            existingPlanTasksForRefinement = null
        } = params;

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
            
            if (dailyHours !== null) {
                promptParts.push(`Maintain daily study hours around ${dailyHours} hours.`);
            }
            if (preferredTimeStr) {
                promptParts.push(`Consider the preferred time of day: ${preferredTimeStr}.`);
            }
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
                const textParts = (msg.parts || [])
                    .filter(part => part.text)
                    .map(part => part.text);
                
                if (textParts.length > 0) {
                    geminiContentsForApiCall.push({
                        role,
                        parts: [{ text: textParts.join('\n') }]
                    });
                }
            }
        }
        geminiContentsForApiCall.push({
            role: 'user',
            parts: [{ text: fullPrompt }]
        });

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_NAME}:generateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ contents: geminiContentsForApiCall })
            });

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.promptFeedback && result.promptFeedback.blockReason) {
                return [null, `Plan generation failed due to content policy: ${result.promptFeedback.blockReason}. Please rephrase.`];
            }

            const aiResponseText = result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts[0] ? result.candidates[0].content.parts[0].text.trim() : null;
            if (!aiResponseText) {
                return [null, "AI did not generate a response."];
            }

            const jsonStartTag = "---JSON_PLAN_START---";
            const jsonEndTag = "---JSON_PLAN_END---";
            
            if (!aiResponseText.includes(jsonStartTag) || !aiResponseText.includes(jsonEndTag)) {
                return [null, "AI did not provide a structured plan in the expected format (missing delimiters)."];
            }

            const humanReadablePlanContent = aiResponseText.split(jsonStartTag)[0].trim();
            const jsonBlockRaw = aiResponseText.split(jsonStartTag)[1].split(jsonEndTag)[0];
            const jsonBlockCleaned = jsonBlockRaw.trim()
                .replace(/^```json\s*/, '')
                .replace(/\s*```$/, '')
                .trim();
            
            const parsedStructuredData = JSON.parse(jsonBlockCleaned);
            
            let structuredApiTasks;
            if (Array.isArray(parsedStructuredData)) {
                structuredApiTasks = parsedStructuredData;
            } else {
                return [null, "AI generated JSON, but it was not a list of tasks as expected."];
            }

            if (!structuredApiTasks || structuredApiTasks.length === 0) {
                return [null, "AI generated an empty or malformed structured task list."];
            }
            
            return [structuredApiTasks, humanReadablePlanContent];
        } catch (error) {
            console.error(`Error during plan generation or parsing: ${error}`);
            if (error instanceof SyntaxError) {
                 return [null, `AI generated an invalid structured plan: ${error.message}.`];
            }
            return [null, `An unexpected error occurred while generating the plan: ${error.message}`];
        }
    }

    async addPlanToCalendar(skillName, structuredTasks, accessToken) {
        const createdEventLinks = [];
        let eventsCreatedCount = 0;

        for (const taskData of structuredTasks) {
            try {
                const eventBody = {
                    summary: taskData.summary || `${skillName} Task`,
                    description: taskData.description || '',
                    start: {
                        dateTime: taskData.startTime,
                        timeZone: DEFAULT_TIMEZONE
                    },
                    end: {
                        dateTime: taskData.endTime,
                        timeZone: DEFAULT_TIMEZONE
                    }
                };

                const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(eventBody)
                });

                if (response.status === 401) {
                    const permError = new Error("Google API token is invalid or expired. Please sign in again.");
                    permError.name = 'PermissionError';
                    throw permError;
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Google Calendar API error: ${response.status} ${errorText}`);
                }

                const eventData = await response.json();
                createdEventLinks.push(eventData.htmlLink);
                eventsCreatedCount++;
            } catch (error) {
                if (error.name === 'PermissionError') {
                    throw error;
                }
                console.error(`API error creating calendar event for task '${taskData.summary}': ${error}`);
                throw new Error(`A Google Calendar API error occurred: ${error.message}`);
            }
        }

        if (eventsCreatedCount > 0) {
            return [`Successfully added ${eventsCreatedCount} tasks to Google Calendar.`, createdEventLinks];
        } else {
            return ["No events were added to Google Calendar. Check server logs for details.", null];
        }
    }
}

// Export the handler for Cloudflare Pages Functions
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
        return corsResponse(new Response(null, { status: 200 }));
    }

    try {
        // Health check endpoint
        if (path === '/api' && request.method === 'GET') {
            const response = new Response(JSON.stringify({ 
                message: "Learning Planner API is running!" 
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
            return corsResponse(response);
        }

        // Chat message endpoint
        if (path === '/api/chat-message' && request.method === 'POST') {
            const body = await request.json();
            const { userMessage, chatHistory = [] } = body;
            
            if (!userMessage || typeof userMessage !== 'string') {
                const response = new Response(JSON.stringify({ 
                    detail: "userMessage is required and must be a string" 
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
                return corsResponse(response);
            }

            const planner = new LearningPlannerService(env);
            const aiResponseText = await planner.handleChatMessage(userMessage, chatHistory);
            
            const response = new Response(JSON.stringify({ aiResponse: aiResponseText }), {
                headers: { 'Content-Type': 'application/json' }
            });
            return corsResponse(response);
        }

        // Generate plan endpoint
        if (path === '/api/generate-plan' && request.method === 'POST') {
            const body = await request.json();
            const { goal, durationDays, startDate } = body;
            
            if (!goal || typeof goal !== 'string') {
                const response = new Response(JSON.stringify({ 
                    detail: "goal is required and must be a string" 
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
                return corsResponse(response);
            }
            
            if (!durationDays || typeof durationDays !== 'number') {
                const response = new Response(JSON.stringify({ 
                    detail: "durationDays is required and must be a number" 
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
                return corsResponse(response);
            }
            
            if (!startDate || typeof startDate !== 'string') {
                const response = new Response(JSON.stringify({ 
                    detail: "startDate is required and must be a string" 
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
                return corsResponse(response);
            }

            const planner = new LearningPlannerService(env);
            const {
                learningStyle = null,
                preferredTime = null,
                dailyHours = null,
                chatHistoryForContext = [],
                refinementInstruction = null,
                existingPlanTasksForRefinement = null
            } = body;
            
            const [structuredTasks, humanReadablePlan] = await planner.generateStructuredPlan({
                goal,
                durationDays,
                startDateStr: startDate,
                learningStyle,
                preferredTimeStr: preferredTime,
                dailyHours,
                chatHistoryForContext,
                refinementInstruction,
                existingPlanTasksForRefinement
            });
            
            if (structuredTasks === null) {
                const response = new Response(JSON.stringify({ detail: humanReadablePlan }), {
                    status: 422,
                    headers: { 'Content-Type': 'application/json' }
                });
                return corsResponse(response);
            }
            
            const response = new Response(JSON.stringify({
                humanReadablePlan,
                structuredTasks
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
            return corsResponse(response);
        }

        // Integrate plan endpoint
        if (path === '/api/integrate-plan' && request.method === 'POST') {
            const authHeader = request.headers.get('authorization');
            
            if (!authHeader) {
                const response = new Response(JSON.stringify({ 
                    detail: "Authorization header is missing" 
                }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' }
                });
                return corsResponse(response);
            }
            
            const parts = authHeader.split(' ');
            if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
                const response = new Response(JSON.stringify({ 
                    detail: "Invalid authorization header format. Must be 'Bearer <token>'." 
                }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' }
                });
                return corsResponse(response);
            }
            
            const body = await request.json();
            const { skillName, structuredTasks } = body;
            
            if (!skillName || typeof skillName !== 'string') {
                const response = new Response(JSON.stringify({ 
                    detail: "skillName is required and must be a string" 
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
                return corsResponse(response);
            }
            
            if (!Array.isArray(structuredTasks)) {
                const response = new Response(JSON.stringify({ 
                    detail: "structuredTasks must be an array" 
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
                return corsResponse(response);
            }

            const accessToken = parts[1];
            const planner = new LearningPlannerService(env);
            
            const [message, eventLinks] = await planner.addPlanToCalendar(
                skillName,
                structuredTasks,
                accessToken
            );
            
            if (eventLinks === null) {
                const response = new Response(JSON.stringify({ detail: message }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
                return corsResponse(response);
            }
            
            const response = new Response(JSON.stringify({
                message,
                calendarEventLinks: eventLinks
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
            return corsResponse(response);
        }

        // 404 handler
        const response = new Response(JSON.stringify({ detail: 'Not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
        return corsResponse(response);

    } catch (error) {
        console.error('Unhandled error:', error);
        
        let status = 500;
        if (error.message && error.message.includes('Backend service initialization failed')) {
            status = 503;
        } else if (error.name === 'PermissionError' || error.name === 'ValueError') {
            status = 401;
        }
        
        const response = new Response(JSON.stringify({ detail: error.message }), {
            status,
            headers: { 'Content-Type': 'application/json' }
        });
        return corsResponse(response);
    }
}