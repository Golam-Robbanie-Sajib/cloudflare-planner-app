// app/goals/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useGoalStore } from "@/lib/goal-store";
import { useCalendarStore } from "@/lib/calendar-store";
import { UserGoal } from "@/lib/firestore-goals";
import { ArrowLeft, Plus, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import GoalCard from "@/components/goal-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import AddEditGoalDialog from "@/components/add-edit-goal-dialog";
import dynamic from "next/dynamic";

// recharts adds ~100 kB to the bundle; load it lazily so the /goals route
// stays light when the user has no goal selected.
const GoalProgressChart = dynamic(() => import("@/components/goal-progress-chart"), {
  ssr: false,
  loading: () => <div className="h-44 flex items-center justify-center text-xs text-slate-400">Loading chart…</div>,
});

export default function GoalsPage() {
  const { goals, loading: goalsLoading } = useGoalStore();
  const { tasks, loading: tasksLoading } = useCalendarStore();
  const [selectedGoal, setSelectedGoal] = useState<UserGoal | null>(null);

  const goalTasks = selectedGoal ? tasks.filter(task => task.goalId === selectedGoal.id) : [];

  return (
    <div className="flex-1 p-6 bg-slate-50 h-[calc(100vh-4rem)]">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-slate-800">My Goals</h1>
        </div>
        
        {/* THIS IS THE IMPLEMENTATION of the "Add Goal" button */}
        <AddEditGoalDialog>
          <Button className="btn-purple">
            <Plus className="h-4 w-4 mr-2" />
            Add Goal
          </Button>
        </AddEditGoalDialog>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100%-6rem)]">
        <ScrollArea className="lg:col-span-1 h-full">
          <div className="space-y-4">
            {(goalsLoading || tasksLoading) ? (
              <p>Loading goals...</p>
            ) : goals.length === 0 ? (
              <Card className="card-colorful border-dashed">
                <CardContent className="py-8 text-center">
                  <p className="text-sm font-medium text-slate-700">No goals yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Goals are created automatically when you build a plan with the AI — or add one manually below.
                  </p>
                  <div className="mt-4 flex gap-2 justify-center">
                    <Link href="/dashboard">
                      <Button className="btn-purple" size="sm">Plan with AI</Button>
                    </Link>
                    <AddEditGoalDialog>
                      <Button variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-1" /> Manual
                      </Button>
                    </AddEditGoalDialog>
                  </div>
                </CardContent>
              </Card>
            ) : (
              goals.map(goal => (
                <div key={goal.id} onClick={() => setSelectedGoal(goal)} className="cursor-pointer">
                  <GoalCard goal={goal} />
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="lg:col-span-2 h-full">
          {/* ... (The right column code is unchanged) ... */}
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle>{selectedGoal ? selectedGoal.title : "Select a Goal"}</CardTitle>
              <CardDescription>{selectedGoal ? "Here is the plan for this goal." : "Select a goal from the left to view its associated tasks."}</CardDescription>
            </CardHeader>
            {selectedGoal && goalTasks.length > 0 && (
              <div className="px-6 pb-2">
                <GoalProgressChart tasks={goalTasks} />
              </div>
            )}
            <CardContent className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-3">
                  {goalTasks.length > 0 ? (
                    goalTasks.map(task => (
                      <div key={task.id} className={cn("p-3 rounded-lg border bg-white", task.completed && "opacity-60")}>
                        <div className="flex items-center">
                          <CheckSquare className={cn("h-4 w-4 mr-3", task.completed ? "text-green-500" : "text-slate-400")} />
                          <div>
                            <p className={cn("font-medium", task.completed && "line-through")}>{task.title}</p>
                            <p className="text-xs text-slate-500">{new Date(task.date + "T00:00:00").toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} • {task.startTime} - {task.endTime}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex h-full items-center justify-center text-center text-slate-500">
                      <p>{selectedGoal ? "No tasks have been assigned to this goal yet." : ""}</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}