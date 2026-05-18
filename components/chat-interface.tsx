// components/chat-interface.tsx

"use client"

import type React from "react"
import { useIsMobile } from "@/hooks/use-mobile";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react"
import { Send, CalendarIcon, Bot, User, Plus, Loader2, RefreshCw, Edit, Mic, MicOff } from "lucide-react"
import { useSpeechInput } from "@/hooks/use-speech-input"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/use-toast"
import { useCalendarStore } from "@/lib/calendar-store"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth-context"
import { useGoalStore } from "@/lib/goal-store";
import { useProfileStore } from "@/lib/profile-store";
import GoogleAuthButton from "@/components/google-auth-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchGoogleBusySlots } from "@/lib/gcal-busy";
import { useChatMessage, useIntegratePlan } from "@/hooks/use-api-mutations";
import { useStreamingPlan } from "@/hooks/use-streaming-plan";



// --- Type Definitions for API Interaction ---
// BackendTask, BackendGeminiContent, UserProgress, BusySlot etc. now live in
// lib/schemas.ts as Zod-derived types and are the single source of truth for
// what crosses the wire. Anything imported below is just a re-alias for code
// clarity at the call sites.

import type {
  BackendTask,
  GeminiContent as BackendGeminiContent,
  UserProgress as UserProgressSignal,
  GeneratePlanRequest as GeneratePlanRequestPayload,
} from "@/lib/schemas";

export interface UITask {
  id: string;
  title: string;
  description: string | null;
  date: string;
  startTime: string;
  endTime: string;
  priority: "high" | "medium" | "low";
  backendTask?: BackendTask;
}

export interface UIPlan {
  title: string;
  description?: string;
  tasks: UITask[];
  humanReadablePlan?: string;
  originalBackendTasks?: BackendTask[];
  originalRequestParams?: Partial<GeneratePlanRequestPayload>;
}

interface FrontendMessage {
  id: string;
  text: string;
  role: "user" | "ai";
  timestamp: Date;
}

export default function ChatInterface() {
  const { tasks: allTasks, addAIGeneratedTasks, applySyncResults } = useCalendarStore();
  const { isAuthenticated, getAccessToken } = useAuth();
  const { goals, addGoal } = useGoalStore();
  const { profile } = useProfileStore();
  const isMobile = useIsMobile();

  // Apply profile defaults (daily hours, preferred time) once they load, but
  // don't overwrite anything the user has already provided this session.
  useEffect(() => {
    if (!profile) return;
    setPlanRequestParams(prev => ({
      ...(profile.defaultDailyHours && !prev.dailyHours ? { dailyHours: profile.defaultDailyHours } : {}),
      ...(profile.defaultPreferredTime && profile.defaultPreferredTime !== "any" && !prev.preferredTime
        ? { preferredTime: profile.defaultPreferredTime }
        : {}),
      ...prev,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.defaultDailyHours, profile?.defaultPreferredTime]);

  // Build a UserProgressSignal from the user's Firestore tasks. Sent with every
  // /generate-plan call so the AI tunes the new plan to actual completion rate.
  const computeProgressSignal = (): UserProgressSignal | undefined => {
    if (!allTasks || allTasks.length === 0) return undefined;
    const total = allTasks.length;
    const completed = allTasks.filter(t => t.completed).length;
    if (total < 3) return undefined; // not enough signal yet
    const completedTitles = allTasks
      .filter(t => t.completed)
      .sort((a, b) => {
        const ad = (a as any).completedAt?.seconds ?? 0;
        const bd = (b as any).completedAt?.seconds ?? 0;
        return bd - ad;
      })
      .slice(0, 5)
      .map(t => t.title);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const missed = allTasks
      .filter(t => !t.completed && new Date(t.date + "T00:00:00") < today)
      .slice(-5)
      .map(t => t.title);
    // Multi-goal load summary. Estimate hours by parsing "HH:MM" task ranges.
    const goalsLoad = goals
      .filter(g => g.status !== "completed")
      .map(g => {
        const goalTasks = allTasks.filter(t => t.goalId === g.id && !t.completed);
        const hours = goalTasks.reduce((acc, t) => {
          const [sh, sm] = t.startTime.split(":").map(n => parseInt(n, 10));
          const [eh, em] = t.endTime.split(":").map(n => parseInt(n, 10));
          if ([sh, sm, eh, em].some(Number.isNaN)) return acc;
          return acc + ((eh * 60 + em) - (sh * 60 + sm)) / 60;
        }, 0);
        return { title: g.title, tasksRemaining: goalTasks.length, estimatedHoursRemaining: Math.round(hours * 10) / 10 };
      })
      .filter(g => g.tasksRemaining > 0)
      .slice(0, 10);
    return {
      completionRate: completed / total,
      completedTasks: completed,
      totalTasks: total,
      recentlyCompleted: completedTitles,
      recentlyMissed: missed,
      ...(goalsLoad.length ? { activeGoals: goalsLoad } : {}),
    };
  };

  // Active, future (or today's) tasks that aren't yet completed — sent to the
  // AI as busy slots so the generated plan doesn't collide with the user's
  // existing commitments. Capped at 50 entries to keep prompts compact.
  const computeBusySlots = () => {
    if (!allTasks || allTasks.length === 0) return undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const future = allTasks
      .filter(t => !t.completed && new Date(t.date + "T00:00:00") >= today)
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
      .slice(0, 50)
      .map(t => ({ date: t.date, startTime: t.startTime, endTime: t.endTime, title: t.title }));
    return future.length ? future : undefined;
  };
 
  const [messages, setMessages] = useState<FrontendMessage[]>([
    {
      id: "1",
      text: "👋 Hello! I'm your AI assistant. Tell me about a skill you'd like to learn, for how long, and when you'd like to start. For example: 'I want to learn FastAPI in 2 days, starting tomorrow'.",
      role: "ai",
      timestamp: new Date(),
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [editedGoalTitle, setEditedGoalTitle] = useState("");
  const [suggestedGoalTitle, setSuggestedGoalTitle] = useState("");
  const [goalInputForDialog, setGoalInputForDialog] = useState("");
  const [currentGeneratedPlan, setCurrentGeneratedPlan] = useState<UIPlan | null>(null);
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
  const [refinementInput, setRefinementInput] = useState("");

  // TanStack Query mutations replace the ad-hoc isChatting/isGeneratingPlan/
  // isIntegratingPlan flags. The aliases below preserve the rest of the
  // component's call sites (`isChatting`, etc.) without renaming.
  const chatMutation = useChatMessage();
  const streamingPlan = useStreamingPlan();
  const integratePlanMutation = useIntegratePlan();
  const isChatting = chatMutation.isPending;
  const isGeneratingPlan = streamingPlan.isPending;
  const isIntegratingPlan = integratePlanMutation.isPending;

  const [planRequestParams, setPlanRequestParams] = useState<Partial<GeneratePlanRequestPayload>>({});
  const [selectedGoalId, setSelectedGoalId] = useState("none");

  const speech = useSpeechInput();
  useEffect(() => {
    if (speech.transcript) {
      setChatInput(prev => (prev ? prev + " " : "") + speech.transcript);
      speech.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.transcript]);

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const searchParams = useSearchParams();
  const router = useRouter();

  // When the user clicks "Regenerate" on a goal card, the dashboard URL gets
  // ?regen=<goalId>&goal=<title>. On mount we drop a prefilled refinement
  // prompt into the chat so the AI knows which goal to re-plan, then strip
  // the query so a refresh doesn't re-trigger it.
  useEffect(() => {
    const regenId = searchParams.get("regen");
    const goalTitle = searchParams.get("goal");
    if (!regenId || !goalTitle) return;
    setChatInput(`I'd like to regenerate or adjust the plan for my goal: "${goalTitle}". Please consider my progress so far and propose what to do next.`);
    setSuggestedGoalTitle(goalTitle);
    setPlanRequestParams(prev => ({ ...prev, goal: goalTitle }));
    // Strip the query params without adding a history entry.
    router.replace("/dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  useEffect(() => {
    if (isPlanDialogOpen) {
      setGoalInputForDialog(suggestedGoalTitle);
    }

  }, [isPlanDialogOpen, suggestedGoalTitle]);


  const mapMessagesToBackendHistory = (msgs: FrontendMessage[]): BackendGeminiContent[] => {
    return msgs.map(m => ({
      role: m.role === "ai" ? "model" : "user",
      parts: [{ text: m.text }],
    }));
  };

  const mapBackendTaskToUITask = (task: BackendTask, index: number): UITask => {
    const startDate = new Date(task.startTime);
    return {
      id: `task-${index}-${Date.now()}`,
      title: task.summary,
      description: task.description || null,
      date: task.startTime.split('T')[0],
      startTime: startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      endTime: new Date(task.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      priority: "medium",
      backendTask: task,
    };
  };

  const parsePlanParamsFromMessage = (message: string): Partial<GeneratePlanRequestPayload> => {
  const params: Partial<GeneratePlanRequestPayload> = {};

  const goalMatch = message.match(/(learn|master|understand)\s+([a-zA-Z0-9\s]+?)(?:\s+in\s+(\d+)\s+days|\s+starting|\s*$)/i);
  if (goalMatch && goalMatch[2]) {
      params.goal = goalMatch[2].trim();
    }

  const durationMatch = message.match(/(\d+)\s+(day|week|month)s?/i);
    if (durationMatch && durationMatch[1] && durationMatch[2]) {
      let duration = parseInt(durationMatch[1], 10);
      if (durationMatch[2].toLowerCase().startsWith("week")) {
        duration *= 7;
      } else if (durationMatch[2].toLowerCase().startsWith("month")) {
        duration *= 30;
      }
      params.durationDays = duration;
    }

  const today = new Date();
  const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

  const startDateMatch = message.match(/(starting|start)\s+(tomorrow|today|next week|next monday|(\d{4}-\d{2}-\d{2}))/i);
    if (startDateMatch) {
      const dateStr = startDateMatch[2].toLowerCase();
      if (dateStr === "tomorrow") {
        params.startDate = tomorrow.toISOString().split("T")[0];
      } else if (dateStr === "today") {
        params.startDate = today.toISOString().split("T")[0];
      } else if (dateStr === "next week" || dateStr === "next monday") {
        const nextMonday = new Date(today);
        nextMonday.setDate(today.getDate() + (1 + 7 - today.getDay()) % 7);
        params.startDate = nextMonday.toISOString().split("T")[0];
      } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        params.startDate = dateStr;
      }
    } else if (!params.startDate) {
        params.startDate = tomorrow.toISOString().split("T")[0];
    }
    
  const dailyHoursMatch = message.match(/(\d+(\.\d+)?)\s+hours?\s+daily/i);
    if (dailyHoursMatch && dailyHoursMatch[1]) {
      params.dailyHours = parseFloat(dailyHoursMatch[1]);
    }

    if (!message.startsWith("make it for")) {
        setPlanRequestParams(prev => ({ ...prev, ...params }));
    }
    
    return params;
  };


  

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatting) return;

    const newUserMessage: FrontendMessage = { id: Date.now().toString(), text: chatInput, role: "user", timestamp: new Date() };
    setMessages(prev => [...prev, newUserMessage]);
    const currentInput = chatInput;
    setChatInput("");

    parsePlanParamsFromMessage(currentInput);
    const backendChatHistory = mapMessagesToBackendHistory([...messages, newUserMessage]);

    try {
      const data = await chatMutation.mutateAsync({
        userMessage: currentInput,
        chatHistory: backendChatHistory.slice(0, -1),
      });

      const aiResponseMessage: FrontendMessage = { id: (Date.now() + 1).toString(), text: data.response, role: "ai", timestamp: new Date() };

      // Promote AI-extracted params into local state. This is what lets the
      // "Generate Plan" button enable reliably without depending on the brittle
      // frontend regex parser.
      if (data.extractedParams) {
        const ep = data.extractedParams;
        setPlanRequestParams(prev => ({
          ...prev,
          ...(ep.goal ? { goal: ep.goal } : {}),
          ...(typeof ep.durationDays === "number" && ep.durationDays > 0 ? { durationDays: ep.durationDays } : {}),
          ...(typeof ep.dailyHours === "number" && ep.dailyHours > 0 ? { dailyHours: ep.dailyHours } : {}),
          ...(ep.startDate ? { startDate: ep.startDate } : {}),
          ...(ep.currentSkillLevel ? { currentSkillLevel: ep.currentSkillLevel } : {}),
        }));
      }

      if (data.intent === "create_goal" && data.goalTitle) {
        setSuggestedGoalTitle(data.goalTitle);
      }
      setMessages(prev => [...prev, aiResponseMessage]);
    } catch (error) {
      console.error("Chat API error:", error);
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
      const errorResponseMessage: FrontendMessage = { id: (Date.now() + 1).toString(), text: `Sorry, I encountered an error: ${(error as Error).message}`, role: "ai", timestamp: new Date() };
      setMessages(prev => [...prev, errorResponseMessage]);
    }
  };



  const handleRequestPlanGeneration = async (directPayload?: GeneratePlanRequestPayload) => {
    // Merge in-app future tasks + external Google Calendar events so the AI
    // sees the user's true schedule, not just the app-managed bits.
    let mergedBusy = computeBusySlots() ?? [];
    const tokenForBusy = getAccessToken();
    if (tokenForBusy) {
      try {
        const startDate = planRequestParams.startDate
          ? new Date(planRequestParams.startDate + "T00:00:00")
          : new Date();
        const external = await fetchGoogleBusySlots(
          tokenForBusy,
          startDate,
          planRequestParams.durationDays || 14,
          80,
        );
        mergedBusy = [...mergedBusy, ...external].slice(0, 80);
      } catch {
        // Non-fatal: planning still works without external busy data.
      }
    }

    const payload: GeneratePlanRequestPayload = directPayload || {
      goal: planRequestParams.goal || "Learning Goal",
      durationDays: planRequestParams.durationDays || 7,
      startDate: planRequestParams.startDate || new Date(Date.now() + 86400000).toISOString().split("T")[0],
      dailyHours: planRequestParams.dailyHours || 2,
      learningStyle: planRequestParams.learningStyle,
      preferredTime: planRequestParams.preferredTime,
      currentSkillLevel: planRequestParams.currentSkillLevel,
      chatHistoryForContext: mapMessagesToBackendHistory(messages),
      userProgress: computeProgressSignal(),
      busySlots: mergedBusy.length ? mergedBusy : undefined,
    };

    if (!payload.goal || !payload.durationDays || !payload.startDate) {
      toast({ title: "Missing Details", description: "Please specify a goal, duration (in days), and start date for the plan.", variant: "destructive" });
      return;
    }

    // Snapshot the prior plan so a refinement / regenerate can still show
    // the old tasks (and keep "Add to Calendar" enabled) while the new
    // stream is in flight.
    const priorTasks = currentGeneratedPlan?.tasks ?? [];
    const priorBackendTasks = currentGeneratedPlan?.originalBackendTasks ?? [];

    // Open the dialog immediately — narrative will fill in as it streams.
    // Keep prior tasks visible during refinement so the UI doesn't blink to
    // "no tasks" between the old and new plan.
    setCurrentGeneratedPlan({
      title: payload.goal,
      description: `A plan to ${payload.goal} over ${payload.durationDays} days starting ${payload.startDate}.`,
      tasks: directPayload ? priorTasks : [],
      humanReadablePlan: "",
      originalBackendTasks: directPayload ? priorBackendTasks : [],
      originalRequestParams: payload,
    });
    setTimeout(() => setIsPlanDialogOpen(true), 100);

    try {
      const result = await streamingPlan.start(payload);
      if (!result) {
        // Streaming failed or was aborted — error toast comes from below.
        throw new Error(streamingPlan.error || "Failed to generate plan");
      }

      const finalUIPlan: UIPlan = {
        title: payload.goal,
        description: `A plan to ${payload.goal} over ${payload.durationDays} days starting ${payload.startDate}.`,
        tasks: result.tasks.map(mapBackendTaskToUITask),
        humanReadablePlan: result.narrative,
        originalBackendTasks: result.tasks,
        originalRequestParams: payload,
      };
      setCurrentGeneratedPlan(finalUIPlan);

      const planIntroMessage: FrontendMessage = { id: (Date.now() + 10).toString(), text: `Okay, I've ${directPayload ? 'refined the' : 'generated a'} plan for you to "${payload.goal}". You can review it now!`, role: "ai", timestamp: new Date() };
      setMessages(prev => [...prev, planIntroMessage]);

      toast({ title: `Plan ${directPayload ? 'Refined' : 'Generated'}!`, description: "Your new learning plan is ready." });
    } catch (error) {
      console.error("Generate Plan API error:", error);
      toast({ title: "Error Generating Plan", description: (error as Error).message, variant: "destructive" });
      // Roll the empty placeholder back so the user doesn't see a half-open
      // dialog with no content.
      setCurrentGeneratedPlan(null);
      setIsPlanDialogOpen(false);
    } finally {
      setRefinementInput("");
    }
  };


// Integration is intentionally two-phase to avoid the "Google succeeded,
// Firestore failed → phantom events" data loss path:
//
//   Phase 1: write all tasks to Firestore first, with syncStatus='pending'.
//            (Goal doc is created first so tasks can link to it.) If this
//            fails, nothing landed anywhere — clean rollback.
//   Phase 2: call /integrate-plan; for each per-task result, update that
//            Firestore task with syncStatus='synced' + googleEventId, or
//            syncStatus='failed' with an error. Failed tasks remain visible
//            in-app with a "Sync failed — retry" affordance.
const handleIntegratePlanToCalendar = async () => {
  // The button's disabled prop should prevent this case, but if state got
  // wedged (e.g. the stream emitted `tasks` after we cleared
  // currentGeneratedPlan), fall back to the streaming hook's task buffer.
  const tasksForSync =
    currentGeneratedPlan?.originalBackendTasks && currentGeneratedPlan.originalBackendTasks.length > 0
      ? currentGeneratedPlan.originalBackendTasks
      : streamingPlan.tasks ?? null;

  if (!currentGeneratedPlan || !tasksForSync || tasksForSync.length === 0) {
    toast({ title: "No Plan", description: "No plan to integrate — try regenerating.", variant: "destructive" });
    return;
  }
  if (!isAuthenticated) {
    toast({ title: "Authentication Required", description: "Please sign in first.", variant: "destructive" });
    return;
  }

  // Phase 1a: create the goal (if requested) so tasks can carry goalId.
  let finalGoalId: string | undefined = undefined;
  let taskIds: string[] = [];
  try {
    if (goalInputForDialog.trim() !== "") {
      const newGoalId = await addGoal({
        title: goalInputForDialog.trim(),
        description: `Goal for the plan: ${currentGeneratedPlan.title}`,
        status: "in_progress",
      });
      if (newGoalId) finalGoalId = newGoalId;
    }

    // Phase 1b: write tasks to Firestore. Each task starts as syncStatus='pending'.
    taskIds = await addAIGeneratedTasks(tasksForSync, finalGoalId);
    if (taskIds.length === 0) {
      throw new Error("None of the tasks were valid. Try regenerating the plan.");
    }

    // Phase 2: push to Google Calendar via the integrate mutation.
    const data = await integratePlanMutation.mutateAsync({
      skillName: currentGeneratedPlan.title,
      structuredTasks: tasksForSync,
    });

    // Map per-task Google results back onto the Firestore task IDs by index.
    const syncUpdates = (data.results || []).map((r) => ({
      taskId: taskIds[r.index],
      googleEventId: r.googleEventId,
      googleEventLink: r.googleEventLink,
      syncStatus: r.status,
    })).filter((u) => !!u.taskId);
    await applySyncResults(syncUpdates);

    const failedCount = syncUpdates.filter((u) => u.syncStatus === "failed").length;
    if (failedCount > 0) {
      toast({
        title: "Plan saved — partial Google sync",
        description: `${syncUpdates.length - failedCount} synced, ${failedCount} failed. The failed events stay in the app and can be retried.`,
      });
    } else {
      toast({ title: "Plan Integrated Successfully!", description: data.message || "Tasks saved and synced to Google Calendar." });
    }

    setIsPlanDialogOpen(false);
    setCurrentGeneratedPlan(null);
    setSuggestedGoalTitle("");
    setGoalInputForDialog("");
  } catch (error) {
    console.error("Integrate Plan API error:", error);
    // If we already wrote tasks to Firestore but the Google sync threw,
    // flag every just-written task so the user can retry per-task. No data
    // loss either way.
    if (taskIds.length > 0) {
      await applySyncResults(taskIds.map((id) => ({ taskId: id, syncStatus: "failed" as const })));
    }
    toast({
      title: "Error Integrating Plan",
      description: (error as Error).message,
      variant: "destructive",
    });
  }
};
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleRefinePlan = () => {
    if (!refinementInput.trim()) {
      toast({ title: "Refinement Empty", description: "Please type your refinement instructions.", variant: "destructive" });
      return;
    }

    if (!currentGeneratedPlan?.originalRequestParams) {
      toast({ title: "Cannot Refine Plan", description: "The original plan parameters are missing.", variant: "destructive" });
      return;
    }
    
    const originalParams = currentGeneratedPlan.originalRequestParams;
    const refinementParams = parsePlanParamsFromMessage(refinementInput);

    const refinementPayload: GeneratePlanRequestPayload = {
      goal: originalParams.goal!,
      durationDays: refinementParams.durationDays || originalParams.durationDays!,
      startDate: refinementParams.startDate || originalParams.startDate!,
      dailyHours: refinementParams.dailyHours || originalParams.dailyHours,
      learningStyle: originalParams.learningStyle,
      preferredTime: originalParams.preferredTime,
      currentSkillLevel: originalParams.currentSkillLevel,
      chatHistoryForContext: mapMessagesToBackendHistory(messages),
      refinementInstruction: refinementInput,
      existingPlanTasksForRefinement: currentGeneratedPlan.originalBackendTasks,
      userProgress: computeProgressSignal(),
      busySlots: computeBusySlots(),
    };
    
    handleRequestPlanGeneration(refinementPayload);
    setIsPlanDialogOpen(false);
  };

  const renderPlanGenerationButton = () => {
    const isReadyForInitialPlan = planRequestParams.goal && planRequestParams.durationDays && planRequestParams.startDate;
    const buttonText = currentGeneratedPlan ? "Refine Current Plan" : (isReadyForInitialPlan ? "Generate Plan" : "Generate Plan (needs details)");

    return (
      <Button
        onClick={() => {
          if (currentGeneratedPlan) {
            setIsPlanDialogOpen(true);
          } else {
            handleRequestPlanGeneration();
          }
        }}
        disabled={isGeneratingPlan || isChatting || (!currentGeneratedPlan && !isReadyForInitialPlan)}
        variant="outline"
        size="sm"
        className="m-2 flex items-center"
      >
        {isGeneratingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (currentGeneratedPlan ? <RefreshCw className="h-4 w-4" /> : <Plus className="h-4 w-4" />)}
        <span className="hidden sm:inline ml-2">{buttonText}</span>
      </Button>
    );
  };

  // If the user is not logged in, show a prompt.
  if (!isAuthenticated) {
    return (
      <Card className="h-full flex flex-col items-center justify-center card-colorful card-hover shadow-lg text-center p-4">
        <div className="w-12 h-12 rounded-lg bg-green-500 flex items-center justify-center mb-4">
          <Bot className="h-6 w-6 text-white" />
        </div>
        <h3 className="text-lg font-semibold text-slate-700">AI Assistant</h3>
        <p className="text-sm text-slate-500 mt-1">
          Please sign in to start a conversation and generate your personalized learning plans.
        </p>
        <GoogleAuthButton className="mt-6" />
      </Card>
    );
  }
  
  // The main component return for authenticated users
  return (
    <>
      <Card className="h-full flex flex-col card-colorful card-hover shadow-lg">
        <CardHeader className="px-4 py-3 border-b border-slate-200 flex justify-between items-center">
          <CardTitle className="text-lg font-bold flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <span className="text-green-600">AI Assistant</span>
          </CardTitle>
          {renderPlanGenerationButton()}
        </CardHeader>
        <ScrollArea ref={scrollAreaRef} className="flex-1">
          <CardContent className="p-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
              >
                <div
                  className={`flex items-start gap-3 max-w-[90%] ${message.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <Avatar className="h-8 w-8 flex-shrink-0 shadow-md">
                    <AvatarFallback
                      className={`text-xs font-semibold ${message.role === "ai" ? "bg-green-500 text-white" : "bg-purple-500 text-white"
                        }`}
                    >
                      {message.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm transition-all duration-200 shadow-sm ${message.role === "user" ? "bg-purple-500 text-white" : "bg-white border border-slate-200"
                      }`}
                  >
                    <div className="whitespace-pre-wrap">{message.text}</div>
                    {message.role === "ai" && currentGeneratedPlan && message.text.includes(currentGeneratedPlan.title) && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs bg-white/90 hover:bg-white border-slate-200 hover:border-blue-300"
                          onClick={() => setIsPlanDialogOpen(true)}
                        >
                          <CalendarIcon className="h-3 w-3 mr-1" /> View Plan
                        </Button>
                      </div>
                    )}
                    <div className="text-xs opacity-70 mt-2">
                      {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {(isChatting || isGeneratingPlan) && (
              <div className="flex justify-center items-center p-2">
                <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
                <span className="ml-2 text-sm text-slate-500">
                  {isChatting ? "AI is thinking..." : isGeneratingPlan ? "Generating plan..." : ""}
                </span>
              </div>
            )}
          </CardContent>
        </ScrollArea>
        <CardFooter className="p-3 border-t border-slate-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex w-full items-center space-x-2"
          >
            <Input
              placeholder={speech.listening ? "Listening…" : "Type your message, or ask to generate a plan..."}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 h-10 text-sm bg-white border-slate-200 focus:border-purple-300 focus:ring-purple-200 rounded-xl"
              disabled={isChatting || isGeneratingPlan}
            />
            {speech.supported && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={`rounded-xl px-3 ${speech.listening ? "bg-red-50 border-red-300 text-red-700" : ""}`}
                onClick={() => (speech.listening ? speech.stop() : speech.start())}
                aria-label={speech.listening ? "Stop voice input" : "Start voice input"}
              >
                {speech.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}
            <Button type="submit" size="sm" disabled={!chatInput.trim() || isChatting || isGeneratingPlan} className="btn-purple shadow-lg rounded-xl px-4">
              {isChatting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="sr-only">Send message</span>
            </Button>
          </form>
        </CardFooter>
      </Card>

      <Dialog open={isPlanDialogOpen} onOpenChange={setIsPlanDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto card-colorful">
          <DialogHeader>
            <DialogTitle className="text-purple-600 text-xl">{currentGeneratedPlan?.title || "Plan Details"}</DialogTitle>
            <DialogDescription className="text-slate-600">
              {currentGeneratedPlan?.description || "Review the tasks for your plan."}
            </DialogDescription>
            {(currentGeneratedPlan?.humanReadablePlan || streamingPlan.narrative) && (
              <ScrollArea className="mt-2 p-2 border rounded-md max-h-40 bg-slate-50 text-sm text-slate-700">
                <h4 className="font-semibold mb-1 flex items-center gap-2">
                  AI's Full Plan Outline:
                  {isGeneratingPlan && <Loader2 className="h-3 w-3 animate-spin text-purple-500" />}
                </h4>
                <pre className="whitespace-pre-wrap font-sans text-xs">{currentGeneratedPlan?.humanReadablePlan || streamingPlan.narrative}</pre>
              </ScrollArea>
            )}
            {isGeneratingPlan && (!currentGeneratedPlan?.tasks || currentGeneratedPlan.tasks.length === 0) && (
              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Building your task schedule…
              </p>
            )}
          </DialogHeader>

          <div className="space-y-4 my-4">
            <h3 className="text-lg font-semibold text-slate-700">Tasks</h3>
            <div className="space-y-3">
              {currentGeneratedPlan?.tasks.map((task) => (
                <Card key={task.id} className="p-4 card-colorful card-hover border border-slate-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-slate-800">{task.title}</h4>
                      {task.description && <p className="text-sm text-slate-600 mt-1">{task.description}</p>}
                    </div>
                    <Badge
                      variant={
                        task.priority === "high" ? "destructive" : task.priority === "medium" ? "default" : "secondary"
                      }
                      className="font-medium"
                    >
                      {task.priority}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center text-sm text-slate-500">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    <span>
                      {new Date(task.date + "T00:00:00").toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })} • {task.startTime} - {task.endTime}
                    </span>
                  </div>
                  {task.backendTask?.resources && task.backendTask.resources.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {task.backendTask.resources.map((r, i) =>
                        r.url ? (
                          <a
                            key={i}
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs px-2 py-1 rounded-md border border-slate-200 hover:border-purple-300 hover:bg-purple-50 text-slate-700"
                          >
                            <span className="text-[10px] uppercase text-purple-600 mr-1">{r.type}</span>
                            {r.title}
                          </a>
                        ) : (
                          <span key={i} className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600">
                            <span className="text-[10px] uppercase text-slate-400 mr-1">{r.type}</span>
                            {r.title}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                </Card>
              ))}
              {(!currentGeneratedPlan || currentGeneratedPlan.tasks.length === 0) && (
                <p className="text-slate-500">No tasks in this plan yet.</p>
              )}
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-slate-200">
            <label htmlFor="goalName" className="text-md font-semibold text-slate-700">Goal Name</label>
            <p className="text-sm text-slate-500 mb-2">
              A new goal will be created with this name when you add the plan. Leave it blank to not create a goal.
            </p>
            <Input
              id="goalName"
              placeholder="e.g., Learn React"
              value={goalInputForDialog}
              onChange={(e) => setGoalInputForDialog(e.target.value)}
            />
          </div>

          {currentGeneratedPlan && (
            <div className="mt-6 pt-4 border-t border-slate-100">
              <h3 className="text-md font-semibold text-slate-700 mb-2">Refine Plan:</h3>
              <Textarea
                placeholder="e.g., 'Make day 3 focus more on project work', 'Increase daily hours to 3', 'Shift all tasks to evening'"
                value={refinementInput}
                onChange={(e) => setRefinementInput(e.target.value)}
                rows={3}
                className="mb-3"
              />
              <Button
                onClick={handleRefinePlan}
                disabled={isGeneratingPlan || !refinementInput.trim()}
                className="btn-purple"
              >
                {isGeneratingPlan ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Regenerate with Refinement
              </Button>
            </div>
          )}

          <DialogFooter className="flex gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setIsPlanDialogOpen(false)}
              className="bg-white hover:bg-slate-50 border-slate-200"
            >
              Close
            </Button>
            <Button
              onClick={handleIntegratePlanToCalendar}
              className="btn-blue"
              // Enable as soon as EITHER source has tasks. With streaming,
              // currentGeneratedPlan.tasks is replaced after the stream
              // closes; if that swap is interrupted (e.g. user clicked
              // regenerate, or the tasks event arrived but the post-await
              // setState hasn't committed yet), the streamingPlan buffer is
              // the source of truth.
              disabled={
                isIntegratingPlan ||
                !currentGeneratedPlan ||
                (currentGeneratedPlan.tasks.length === 0 && (streamingPlan.tasks?.length ?? 0) === 0)
              }
            >
              {isIntegratingPlan ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Add to Calendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}