// components/goal-card.tsx
"use client";

import { UserGoal } from "@/lib/firestore-goals";
import { useCalendarStore } from "@/lib/calendar-store";
import { useGoalStore } from "@/lib/goal-store"; // <-- Import useGoalStore
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Edit, Trash2 } from "lucide-react";
import AddEditGoalDialog from "./add-edit-goal-dialog";
import { toast } from "@/components/ui/use-toast" // <-- Import the dialog
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
  const { deleteGoal } = useGoalStore(); // <-- Get deleteGoal function

  const relevantTasks = tasks.filter(task => task.goalId === goal.id);
  const completedTasks = relevantTasks.filter(task => task.completed);
  const progress = relevantTasks.length > 0 ? (completedTasks.length / relevantTasks.length) * 100 : 0;

  const handleDelete = () => {
    deleteGoal(goal.id);
    toast({ title: "Goal Deleted", description: `"${goal.title}" has been removed.` });
  }

  return (
    <Card className="flex flex-col h-full card-colorful card-hover">
      <CardHeader>
        <CardTitle className="text-purple-700">{goal.title}</CardTitle>
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
        </div>
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        {/* THIS IMPLEMENTS the "Edit" button */}
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