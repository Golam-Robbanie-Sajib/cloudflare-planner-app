const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import your service (you'll need to convert this to JS as well)
const { LearningPlannerService } = require('./planner_service');

// Configuration
const origins = [
    "http://localhost:3000",
    "https://goal-planner-app.vercel.app"
    // Add your production frontend URL here as well
];

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors({
    origin: origins,
    credentials: true,
    methods: ["*"],
    allowedHeaders: ["*"]
}));

app.use(express.json());

// Global service instance
let plannerServiceInstance = null;

// Dependency injection function
function getPlannerServiceInstance() {
    if (plannerServiceInstance === null) {
        try {
            plannerServiceInstance = new LearningPlannerService();
            console.log("LearningPlannerService instance created.");
        } catch (error) {
            console.error(`Failed to initialize LearningPlannerService: ${error}`);
            throw new Error(`Backend service initialization failed: ${error}`);
        }
    }
    return plannerServiceInstance;
}

// Validation middleware for request bodies
const validateChatMessageRequest = (req, res, next) => {
    const { userMessage, chatHistory = [] } = req.body;
    
    if (!userMessage || typeof userMessage !== 'string') {
        return res.status(400).json({ detail: "userMessage is required and must be a string" });
    }
    
    if (!Array.isArray(chatHistory)) {
        return res.status(400).json({ detail: "chatHistory must be an array" });
    }
    
    next();
};

const validateGeneratePlanRequest = (req, res, next) => {
    const { goal, durationDays, startDate } = req.body;
    
    if (!goal || typeof goal !== 'string') {
        return res.status(400).json({ detail: "goal is required and must be a string" });
    }
    
    if (!durationDays || typeof durationDays !== 'number') {
        return res.status(400).json({ detail: "durationDays is required and must be a number" });
    }
    
    if (!startDate || typeof startDate !== 'string') {
        return res.status(400).json({ detail: "startDate is required and must be a string" });
    }
    
    next();
};

const validateIntegratePlanRequest = (req, res, next) => {
    const { skillName, structuredTasks } = req.body;
    
    if (!skillName || typeof skillName !== 'string') {
        return res.status(400).json({ detail: "skillName is required and must be a string" });
    }
    
    if (!Array.isArray(structuredTasks)) {
        return res.status(400).json({ detail: "structuredTasks must be an array" });
    }
    
    next();
};

// Error handling middleware
const handleServiceError = (error, res) => {
    console.error(`Service error: ${error}`);
    
    if (error.message.includes('Backend service initialization failed')) {
        return res.status(503).json({ detail: error.message });
    }
    
    if (error.name === 'PermissionError' || error.name === 'ValueError') {
        return res.status(401).json({ detail: error.message });
    }
    
    return res.status(500).json({ detail: error.message });
};

// API Endpoints

// Chat message endpoint
app.post('/chat-message', validateChatMessageRequest, async (req, res) => {
    try {
        const planner = getPlannerServiceInstance();
        const { userMessage, chatHistory = [] } = req.body;
        
        const aiResponseText = await planner.handleChatMessage(userMessage, chatHistory);
        
        res.json({ aiResponse: aiResponseText });
    } catch (error) {
        console.error(`Error in /chat-message: ${error}`);
        handleServiceError(error, res);
    }
});

// Generate plan endpoint
app.post('/generate-plan', validateGeneratePlanRequest, async (req, res) => {
    try {
        const planner = getPlannerServiceInstance();
        const {
            goal,
            durationDays,
            startDate,
            learningStyle = null,
            preferredTime = null,
            dailyHours = null,
            chatHistoryForContext = [],
            refinementInstruction = null,
            existingPlanTasksForRefinement = null
        } = req.body;
        
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
            return res.status(422).json({ detail: humanReadablePlan });
        }
        
        res.json({
            humanReadablePlan,
            structuredTasks
        });
    } catch (error) {
        console.error(`Error in /generate-plan: ${error}`);
        handleServiceError(error, res);
    }
});

// Integrate plan endpoint
app.post('/integrate-plan', validateIntegratePlanRequest, async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({ detail: "Authorization header is missing" });
        }
        
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
            return res.status(401).json({ 
                detail: "Invalid authorization header format. Must be 'Bearer <token>'." 
            });
        }
        
        const accessToken = parts[1];
        const planner = getPlannerServiceInstance();
        const { skillName, structuredTasks } = req.body;
        
        const [message, eventLinks] = await planner.addPlanToCalendar(
            skillName,
            structuredTasks,
            accessToken
        );
        
        if (eventLinks === null) {
            return res.status(400).json({ detail: message });
        }
        
        res.json({
            message,
            calendarEventLinks: eventLinks
        });
    } catch (error) {
        console.error(`Error in /integrate-plan: ${error}`);
        
        if (error.name === 'PermissionError' || error.name === 'ValueError') {
            return res.status(401).json({ detail: error.message });
        }
        
        res.status(500).json({ 
            detail: `An internal error occurred during calendar integration: ${error.message}` 
        });
    }
});

// Get integrated plan endpoint
app.get('/integrated-plan', async (req, res) => {
    try {
        const planner = getPlannerServiceInstance();
        
        const [structuredTasks, skillName] = await planner.getLastIntegratedPlanForDisplay();
        const calendarLinks = await planner.getLastIntegratedPlanCalendarLinks();
        
        if (!structuredTasks) {
            return res.json({
                skillName: null,
                structuredTasks: [],
                calendarEventLinks: []
            });
        }
        
        res.json({
            skillName,
            structuredTasks,
            calendarEventLinks: calendarLinks
        });
    } catch (error) {
        console.error(`Error in /integrated-plan: ${error}`);
        handleServiceError(error, res);
    }
});

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ message: "Learning Planner API is running!" });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ detail: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ detail: 'Not found' });
});

// Start server
//app.listen(PORT, () => {
    //console.log(`Learning Planner API is running on port ${PORT}!`);
    //console.log(`Title: Learning Planner API`);
    //console.log(`Description: API for AI-powered learning plan generation and Google Calendar integration.`);
    //console.log(`Version: 0.1.0`);
//});

module.exports = app;