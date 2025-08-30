const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Constants
const GOOGLE_API_KEY_ENV_VAR = "GOOGLE_API_KEY";
const CALENDAR_API_VERSION = 'v3';
const CALENDAR_ID_PRIMARY = 'primary';
const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || 'Asia/Dhaka';
const GEMINI_MODEL_NAME = 'gemini-1.5-flash';

class LearningPlannerService {
    constructor() {
        /**
         * Initializes the service. Note that Google Calendar credentials are no longer
         * managed here. They are created on-demand in the calendar integration method.
         */
        const apiKey = process.env[GOOGLE_API_KEY_ENV_VAR];
        if (!apiKey) {
            throw new Error(`${GOOGLE_API_KEY_ENV_VAR} not found in environment. Service cannot start.`);
        }

        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });

        // In-memory storage for the last plan details
        this.lastGeneratedPlanTasks = null;
        this.lastGeneratedPlanSkillName = null;
        this.lastIntegratedCalendarLinks = null;
    }

    /**
     * Parse preferred time string to time object
     */
    _parsePreferredTimeToDatetimeTime(preferredTimeStr) {
        let hours = 9;
        let minutes = 0; // Default

        if (!preferredTimeStr) {
            return { hours, minutes };
        }

        try {
            const timeMatch = preferredTimeStr.match(/(\d{1,2})(?:[:.](\d{1,2}))?\s*(am|pm)?/i);
            if (timeMatch) {
                let hrPart = parseInt(timeMatch[1]);
                const minPartStr = timeMatch[2];
                minutes = minPartStr ? parseInt(minPartStr) : 0;
                const ampmPart = (timeMatch[3] || '').toLowerCase();

                if (ampmPart === 'pm' && hrPart >= 1 && hrPart < 12) {
                    hours = hrPart + 12;
                } else if (ampmPart === 'am' && hrPart === 12) {
                    hours = 0;
                } else {
                    hours = hrPart;
                }

                if (!(hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59)) {
                    hours = 9;
                    minutes = 0;
                }
            } else if (preferredTimeStr.toLowerCase().includes('morning')) {
                hours = 9;
            } else if (preferredTimeStr.toLowerCase().includes('afternoon')) {
                hours = 14;
            } else if (preferredTimeStr.toLowerCase().includes('evening') || 
                      preferredTimeStr.toLowerCase().includes('night')) {
                hours = 19;
            }
        } catch (error) {
            // Keep default values
        }

        return { hours, minutes };
    }

    /**
     * Handle chat message with Gemini AI
     */
    async handleChatMessage(userMessage, chatHistory) {
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
            const chat = this.model.startChat({ history: formattedHistory });
            const result = await chat.sendMessage(userMessage);
            const response = await result.response;
            return response.text().trim();
        } catch (error) {
            console.error(`Error in handleChatMessage: ${error}`);
            return `Sorry, I encountered an error trying to process your message: ${error.message}`;
        }
    }

    /**
     * Generate structured learning plan
     */
    async generateStructuredPlan({
         goal,
        durationDays,
        startDateStr,
        learningStyle = null,
        preferredTimeStr = null,
        dailyHours = null,
        chatHistoryForContext = null,
        refinementInstruction = null,
        existingPlanTasksForRefinement = null
    }) {
        const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        
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

            this.lastGeneratedPlanTasks = structuredApiTasks;
            this.lastGeneratedPlanSkillName = goal;
            
            return [structuredApiTasks, humanReadablePlanContent];
        } catch (error) {
            console.error(`Error during plan generation or parsing: ${error}`);
            if (error instanceof SyntaxError) {
                 return [null, `AI generated an invalid structured plan: ${error.message}.`];
            }
            return [null, `An unexpected error occurred while generating the plan: ${error.message}`];
        }
    }
    /**
     * Add plan to Google Calendar using access token
     */
    async addPlanToCalendar(skillName, structuredTasks, accessToken) {
        let calendarService;
        
        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            calendarService = google.calendar({ version: CALENDAR_API_VERSION, auth });
        } catch (error) {
            console.error(`Failed to build calendar service with provided token: ${error}`);
            const authError = new Error("Invalid access token provided.");
            authError.name = 'ValueError';
            throw authError;
        }

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

                const response = await calendarService.events.insert({
                    calendarId: CALENDAR_ID_PRIMARY,
                    resource: eventBody
                });

                createdEventLinks.push(response.data.htmlLink);
                eventsCreatedCount++;
            } catch (error) {
                if (error.code === 401) {
                    console.error(`Google API authorization error for task '${taskData.summary}': ${error}`);
                    const permError = new Error("Google API token is invalid or expired. Please sign in again.");
                    permError.name = 'PermissionError';
                    throw permError;
                } else {
                    console.error(`API error creating calendar event for task '${taskData.summary}': ${error}`);
                    throw new Error(`A Google Calendar API error occurred: ${error.message}`);
                }
            }
        }

        this.lastIntegratedCalendarLinks = createdEventLinks;

        if (eventsCreatedCount > 0) {
            return [`Successfully added ${eventsCreatedCount} tasks to Google Calendar.`, createdEventLinks];
        } else {
            return ["No events were added to Google Calendar. Check server logs for details.", null];
        }
    }

    /**
     * Get last integrated plan for display
     */
    async getLastIntegratedPlanForDisplay() {
        return [this.lastGeneratedPlanTasks, this.lastGeneratedPlanSkillName];
    }

    /**
     * Get last integrated plan calendar links
     */
    async getLastIntegratedPlanCalendarLinks() {
        return this.lastIntegratedCalendarLinks;
    }
}

module.exports = { LearningPlannerService };