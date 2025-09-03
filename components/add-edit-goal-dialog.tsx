// components/add-edit-goal-dialog.tsx

"use client";

import { useState, useEffect, type ReactNode } from "react";
import { UserGoal } from "@/lib/firestore-goals";
import { useGoalStore } from "@/lib/goal-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

interface AddEditGoalDialogProps {
  goal?: UserGoal; // If a goal is passed, we're in "Edit" mode
  children: ReactNode; // This will be the trigger button
}

export default function AddEditGoalDialog({ goal, children }: AddEditGoalDialogProps) {
  const { addGoal, updateGoal } = useGoalStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [goalForm, setGoalForm] = useState({
    title: "",
    description: "",
    status: "not_started" as "not_started" | "in_progress" | "completed",
  });

  const isEditMode = goal !== undefined;

  // Pre-fill the form when the dialog opens in edit mode
  useEffect(() => {
    if (isEditMode && isOpen) {
      setGoalForm({
        title: goal.title,
        description: goal.description,
        status: goal.status,
      });
    } else if (!isEditMode && isOpen) {
      // Reset form for "Add" mode
      setGoalForm({
        title: "",
        description: "",
        status: "not_started",
      });
    }
  }, [goal, isEditMode, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalForm.title) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setIsLoading(true);

    try {
      if (isEditMode) {
        // Update existing goal
        await updateGoal(goal.id, {
          title: goalForm.title,
          description: goalForm.description,
          status: goalForm.status,
        });
        toast({ title: "Goal Updated", description: `"${goalForm.title}" has been saved.` });
      } else {
        // Add new goal
        await addGoal({
          title: goalForm.title,
          description: goalForm.description,
          status: goalForm.status,
        });
        toast({ title: "Goal Created", description: `"${goalForm.title}" has been added.` });
      }
      setIsOpen(false);
    } catch (error) {
      toast({ title: "Error", description: "Something went wrong.", variant: "destructive" });
      console.error("Failed to save goal:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="card-colorful">
        <DialogHeader>
          <DialogTitle className="text-purple-600">{isEditMode ? "Edit Goal" : "Add a New Goal"}</DialogTitle>
          <DialogDescription>
            {isEditMode ? "Make changes to your goal here." : "Define a new goal you want to achieve."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="title">Goal Title</Label>
            <Input
              id="title"
              value={goalForm.title}
              onChange={(e) => setGoalForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., Learn to Play Guitar"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={goalForm.description}
              onChange={(e) => setGoalForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="(Optional) A brief description of your goal."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={goalForm.status}
              onValueChange={(value) => setGoalForm(prev => ({ ...prev, status: value as any }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="not_started">Not Started</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" className="w-full btn-purple" disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEditMode ? "Save Changes" : "Create Goal")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}