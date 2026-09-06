// components/goal-card.tsx
"use client";

import { UserGoal } from "@/lib/firestore-goals";
import { useCalendarStore } from "@/lib/calendar-store";
import { useGoalStore } from "@/lib/goal-store"; // <-- Import useGoalStore
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, Wand2, Share2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AddEditGoalDialog from "./add-edit-goal-dialog";
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context";
import { useProfileStore } from "@/lib/profile-store";
import { computeGoalHealth, HEALTH_STYLES } from "@/lib/plan-health";
import { Badge } from "@/components/ui/badge";
import { newShareSlug, publishPlan } from "@/lib/firestore-share";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface GoalCardProps {
  goal: UserGoal;
}

export default function GoalCard({ goal }: GoalCardProps) {
  const { tasks } = useCalendarStore();
  const { deleteGoal } = useGoalStore();
  const { userInfo } = useAuth();
  const { profile } = useProfileStore();
  const router = useRouter();
  const [sharing, setSharing] = useState(false);

  const relevantTasks = tasks.filter(task => task.goalId === goal.id);
  // "Am I on track to finish by the deadline?" — the number that actually
  // matters for a finite plan, as opposed to raw % complete.
  const health = computeGoalHealth({
    goal,
    tasks,
    dailyCapacityHours: profile?.defaultDailyHours ?? 2,
    timeZone: profile?.timezone,
  });
  const completedTasks = relevantTasks.filter(task => task.completed);
  const progress = relevantTasks.length > 0 ? (completedTasks.length / relevantTasks.length) * 100 : 0;

  const handleDelete = () => {
    deleteGoal(goal.id);
    toast({ title: "Goal Deleted", description: `"${goal.title}" has been removed.` });
  }

  // Navigate to the dashboard with a regen query so the chat-interface can
  // auto-kick a refinement conversation seeded with this goal's context.
  const handleRegenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const params = new URLSearchParams({
      regen: goal.id,
      goal: goal.title,
    });
    router.push(`/dashboard?${params.toString()}`);
  };

  // Publishes a read-only snapshot of this goal + its tasks under
  // /publicPlans/{slug} and copies the share URL to the clipboard. The slug
  // is high-entropy; treat it as a capability token, not a secret.
  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userInfo?.uid) return;
    setSharing(true);
    try {
      const slug = newShareSlug();
      await publishPlan({
        slug,
        ownerUid: userInfo.uid,
        ownerName: userInfo.name || "A learner",
        goalTitle: goal.title,
        goalDescription: goal.description || "",
        tasks: relevantTasks.map(t => ({
          title: t.title,
          description: t.description || "",
          date: t.date,
          startTime: t.startTime,
          endTime: t.endTime,
          completed: t.completed,
        })),
      });
      const url = `${window.location.origin}/plan/${slug}`;
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: "Share link copied", description: url });
      } catch {
        toast({ title: "Share link ready", description: url });
      }
    } catch (err) {
      toast({ title: "Couldn't share", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSharing(false);
    }
  };

  return (
    <Card className="flex flex-col h-full card-colorful card-hover">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-purple-700">{goal.title}</CardTitle>
          <Badge variant="outline" className={`flex-shrink-0 ${HEALTH_STYLES[health.status].className}`}>
            {HEALTH_STYLES[health.status].label}
          </Badge>
        </div>
        <CardDescription>{goal.description || "No description."}</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-slate-600">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="w-full" />
          <div className="text-xs text-slate-500">
            {completedTasks.length} of {relevantTasks.length} tasks completed
          </div>
          <p className="text-xs text-slate-600">{health.headline}</p>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleRegenerate} className="text-purple-700 border-purple-300 hover:bg-purple-50">
          <Wand2 className="h-4 w-4 mr-1" /> Regenerate
        </Button>
        <Button variant="outline" size="sm" onClick={handleShare} disabled={sharing || relevantTasks.length === 0}>
          {sharing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Share2 className="h-4 w-4 mr-1" />}
          Share
        </Button>
        <AddEditGoalDialog goal={goal}>
          <Button variant="outline" size="sm">
            <Edit className="h-4 w-4 mr-1" /> Edit
          </Button>
        </AddEditGoalDialog>

        {/* THIS IMPLEMENTS the "Delete" button with a confirmation */}
         <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-red-600 hover:text-red-600">
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will permanently delete the goal "{goal.title}". This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}