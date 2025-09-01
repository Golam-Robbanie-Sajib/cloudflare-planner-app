//components/calendar.tsx

"use client"

import { useState, useEffect } from "react"
import { CalendarIcon, Plus, Sparkles, Edit2, Trash2, Loader2, RefreshCw } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { useCalendarStore } from "@/lib/calendar-store"
import { CalendarTask } from "@/lib/firestore-calendar"
import { useAuth } from "@/lib/auth-context"

type CalendarViewType = "daily" | "weekly" | "monthly"

interface CalendarProps {
  view: CalendarViewType
}

export default function Calendar({ view }: CalendarProps) {
  const [date, setDate] = useState<Date>(new Date())
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<CalendarTask | null>(null)
  const [isEditTaskOpen, setIsEditTaskOpen] = useState(false)
  const { tasks, addTask, updateTask, toggleTask, deleteTask, loading } = useCalendarStore()
  const { isAuthenticated, getAccessToken } = useAuth()
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
     date: format(date, "yyyy-MM-dd"),
    startTime: "09:00",
    endTime: "10:00",
    priority: "medium" as "high" | "medium" | "low",
    type: "task" as "task" | "event",
    location: ""
  })

  const resetForm = () => {
    setTaskForm({
      title: "",
      description: "",
       date: format(date, "yyyy-MM-dd"),
      startTime: "09:00",
      endTime: "10:00",
      priority: "medium",
      type: "task",
      location: ""
    })
  }

  useEffect(() => {
  if (isEditTaskOpen && editingTask) {
    setTaskForm({
      title: editingTask.title,
      description: editingTask.description,
      date: editingTask.date, // Use the task's own date
      startTime: editingTask.startTime,
      endTime: editingTask.endTime,
      priority: editingTask.priority,
      type: editingTask.type,
      location: editingTask.location || ""
    });
  }
}, [isEditTaskOpen, editingTask]);

// This useEffect resets and populates the form for the ADD dialog.
useEffect(() => {
  if (isAddTaskOpen) {
    resetForm(); // Use the corrected reset function
  }
}, [isAddTaskOpen, date]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskForm.title.trim()) return

    try {
      const taskPayload: Omit<CalendarTask, 'id' | 'createdAt' | 'updatedAt'> = {
        title: taskForm.title,
        description: taskForm.description,
        date: taskForm.date,
        startTime: taskForm.startTime,
        endTime: taskForm.endTime,
        priority: taskForm.priority,
        type: taskForm.type,
        completed: false,
        source: "user",
        synced: false,
      }

      if (taskForm.location) {
      taskPayload.location = taskForm.location;
      }

      await addTask(taskPayload);

      toast({
        title: "Task Created",
        description: `"${taskForm.title}" has been added to your calendar`,
      })
      
      
      setIsAddTaskOpen(false)
    } catch (error) {
      console.error("Error adding task:", error)
      toast({
        title: "Error",
        description: "Failed to create task. Please try again.",
        variant: "destructive"
      })
    }
  }

  const handleEditTask = (task: CalendarTask) => {
    setEditingTask(task)
    setIsEditTaskOpen(true)
  }

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTask || !taskForm.title.trim()) return

     try {
    // 1. Create the base update payload
    const updatePayload: Partial<CalendarTask> = {
      title: taskForm.title,
      description: taskForm.description,
      date: taskForm.date,
      startTime: taskForm.startTime,
      endTime: taskForm.endTime,
      priority: taskForm.priority,
      type: taskForm.type,
      // 2. Handle the location field safely. Send an empty string to clear it.
      location: taskForm.location || "" 
    };

      // 3. Send the clean payload to Firestore
      await updateTask(editingTask.id, updatePayload);

      toast({
        title: "Task Updated",
        description: `"${taskForm.title}" has been updated`,
      })
      
      resetForm()
      setIsEditTaskOpen(false)
      setEditingTask(null)
    } catch (error) {
      console.error("Error updating task:", error)
      toast({
        title: "Error",
        description: "Failed to update task. Please try again.",
        variant: "destructive"
      })
    }
  }

  
const [syncingTaskId, setSyncingTaskId] = useState<string | null>(null);

const handleSyncTask = async (task: CalendarTask) => {
  if (!isAuthenticated) {
    toast({ title: "Authentication Required", description: "Please sign in to sync.", variant: "destructive" });
    return;
  }
  const accessToken = getAccessToken();
  if (!accessToken) {
    toast({ title: "Error", description: "Could not get access token. Please sign in again.", variant: "destructive" });
    return;
  }

  setSyncingTaskId(task.id);
  try {
    const response = await fetch(`${API_BASE_URL}/integrate-plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        skillName: task.title, // Use the task title for the event
        structuredTasks: [{ // Send the task as an array with one item
          summary: task.title,
          description: task.description,
          startTime: new Date(`${task.date}T${task.startTime}`).toISOString(),
          endTime: new Date(`${task.date}T${task.endTime}`).toISOString(),
        }],
      }),
    });

    if (!response.ok) throw new Error("Failed to sync with Google Calendar.");

    // IMPORTANT: Update the task in Firestore to mark it as synced
    await updateTask(task.id, { synced: true });

    toast({ title: "Success", description: "Task synced to Google Calendar." });
  } catch (error) {
    toast({ title: "Sync Failed", description: (error as Error).message, variant: "destructive" });
  } finally {
    setSyncingTaskId(null);
  }
};

  const handleToggleTask = async (id: string) => {
    try {
      await toggleTask(id)
    } catch (error) {
      console.error("Error toggling task:", error)
      toast({
        title: "Error",
        description: "Failed to update task status.",
        variant: "destructive"
      })
    }
  }

  const handleDeleteTask = async (id: string) => {
    try {
      await deleteTask(id)
      toast({
        title: "Task Deleted",
        description: "Task has been removed from your calendar",
      })
    } catch (error) {
      console.error("Error deleting task:", error)
      toast({
        title: "Error",
        description: "Failed to delete task. Please try again.",
        variant: "destructive"
      })
    }
  }

  const getPriorityClass = (priority: "high" | "medium" | "low") => {
    switch (priority) {
      case "high":
        return "priority-high"
      case "medium":
        return "priority-medium"
      case "low":
        return "priority-low"
      default:
        return "priority-medium"
    }
  }

  const getPriorityBadgeVariant = (priority: "high" | "medium" | "low") => {
    switch (priority) {
      case "high":
        return "destructive"
      case "medium":
        return "default"
      case "low":
        return "secondary"
      default:
        return "default"
    }
  }

  // Get tasks for the selected date
  const getTasksForDate = (targetDate: Date) => {
    const dateString = format(targetDate, "yyyy-MM-dd")
    return tasks.filter((task) => task.date === dateString)
  }

  // Get tasks for a specific date string
  const getTasksForDateString = (dateString: string) => {
    return tasks.filter((task) => task.date === dateString)
  }

  // Show sign-in prompt if not authenticated
  if (!isAuthenticated) {
    return (
      <Card className="w-full mt-6 card-colorful card-hover shadow-lg">
        <CardContent className="flex h-[300px] items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-slate-500 mb-3">Please sign in to view your calendar</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Show loading state
  if (loading) {
    return (
      <Card className="w-full mt-6 card-colorful card-hover shadow-lg">
        <CardContent className="flex h-[300px] items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
            <p className="text-sm text-slate-500 mt-3">Loading your calendar...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const TaskForm = ({ onSubmit, submitText }: { onSubmit: (e: React.FormEvent) => void, submitText: string }) => (
    <form onSubmit={onSubmit} className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          placeholder="Task title"
          value={taskForm.title}
          onChange={(e) => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
          required
          className="bg-white border-slate-200 focus:border-purple-300 focus:ring-purple-200"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Description (optional)"
          value={taskForm.description}
          onChange={(e) => setTaskForm(prev => ({ ...prev, description: e.target.value }))}
          className="bg-white border-slate-200 focus:border-purple-300 focus:ring-purple-200"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="date">Date</Label>
        <Input
          id="date"
          type="date"
          value={taskForm.date}
          onChange={(e) => setTaskForm(prev => ({ ...prev, date: e.target.value }))}
          required
          className="bg-white border-slate-200 focus:border-purple-300 focus:ring-purple-200"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="startTime">Start Time</Label>
          <Input
            id="startTime"
            type="time"
            value={taskForm.startTime}
            onChange={(e) => setTaskForm(prev => ({ ...prev, startTime: e.target.value }))}
            className="bg-white border-slate-200 focus:border-purple-300 focus:ring-purple-200"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endTime">End Time</Label>
          <Input
            id="endTime"
            type="time"
            value={taskForm.endTime}
            onChange={(e) => setTaskForm(prev => ({ ...prev, endTime: e.target.value }))}
            className="bg-white border-slate-200 focus:border-purple-300 focus:ring-purple-200"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <Select value={taskForm.priority} onValueChange={(value) => setTaskForm(prev => ({ ...prev, priority: value as "high" | "medium" | "low" }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High Priority</SelectItem>
              <SelectItem value="medium">Medium Priority</SelectItem>
              <SelectItem value="low">Low Priority</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <Select value={taskForm.type} onValueChange={(value) => setTaskForm(prev => ({ ...prev, type: value as "task" | "event" }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="task">Task</SelectItem>
              <SelectItem value="event">Event</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {taskForm.type === "event" && (
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            placeholder="Event location (optional)"
            value={taskForm.location}
            onChange={(e) => setTaskForm(prev => ({ ...prev, location: e.target.value }))}
            className="bg-white border-slate-200 focus:border-purple-300 focus:ring-purple-200"
          />
        </div>
      )}
      <Button type="submit" className="w-full btn-purple shadow-lg">
        {submitText}
      </Button>
    </form>
  )

  return (
    <>
      <Card className="w-full mt-6 card-colorful card-hover shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-2xl font-bold flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="text-purple-600">
              {view === "daily" && "Daily Tasks"}
              {view === "weekly" && "Weekly Schedule"}
              {view === "monthly" && "Monthly Overview"}
            </span>
          </CardTitle>
          <div className="flex items-center space-x-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "justify-start text-left font-normal bg-white border-slate-200 hover:bg-purple-50 hover:border-purple-300 transition-all duration-200",
                    !date && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 card-colorful">
                <CalendarComponent
                  mode="single"
                  selected={date}
                  onSelect={(date) => date && setDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Dialog open={isAddTaskOpen} onOpenChange={setIsAddTaskOpen}>
              <DialogTrigger asChild>
                <Button size="icon" className="btn-purple shadow-lg">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="card-colorful">
                <DialogHeader>
                  <DialogTitle className="text-purple-600 text-xl">Add New Task</DialogTitle>
                </DialogHeader>
                <TaskForm onSubmit={handleAddTask} submitText="Add Task" />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {view === "daily" && (
            <div className="space-y-4">
              {getTasksForDate(date).length > 0 ? (
                getTasksForDate(date).map((task) => (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-start space-x-4 rounded-xl p-5 transition-all duration-300 hover:shadow-md border border-white/50",
                      getPriorityClass(task.priority),
                      task.completed ? "opacity-60" : "",
                    )}
                  >
                    <Checkbox
                      checked={task.completed}
                      onCheckedChange={() => handleToggleTask(task.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center justify-between">
                        <p
                          className={cn("font-semibold text-lg", task.completed && "line-through text-muted-foreground")}
                        >
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge variant={getPriorityBadgeVariant(task.priority)} className="capitalize font-medium">
                            {task.priority}
                          </Badge>
                          <Badge variant="outline" className="bg-white/80">
                            {task.startTime} - {task.endTime}
                          </Badge>
                          {task.source === "ai" && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
                              AI
                            </Badge>
                          )}
                        </div>
                      </div>
                      {task.description && <p className="text-sm text-slate-600">{task.description}</p>}
                      {task.location && <p className="text-sm text-slate-500">📍 {task.location}</p>}
                      <div className="flex gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-white hover:bg-purple-50 hover:border-purple-300 transition-all duration-200"
                          onClick={() => handleEditTask(task)}
                        >
                          <Edit2 className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:border-red-300 transition-all duration-200"
                          onClick={() => handleDeleteTask(task.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                         {task.source === 'user' && ( // Only show sync UI for user-created tasks
                           <>
                             {task.synced ? (
                               // STATE 1: If the task is synced, show a green "Synced" badge.
                               <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 cursor-default">
                                 <RefreshCw className="h-4 w-4 mr-1" />
                                 Synced
                               </Badge>
                              ) : syncingTaskId === task.id ? (
                                // STATE 2: If this task is currently being synced, show a disabled loading button.
                                <Button variant="outline" size="sm" disabled className="bg-blue-50 text-blue-600">
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  Syncing...
                                </Button>
                              ) : (
                                // STATE 3: If not synced and not syncing, show the clickable "Sync" button.
                                <Button
                                variant="outline"
                                size="sm"
                                className="bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300"
                                onClick={() => handleSyncTask(task)}
                              >
                                <RefreshCw className="h-4 w-4 mr-1" />
                                Sync
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex h-[300px] items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white">
                  <div className="text-center">
                    <p className="text-sm text-slate-500 mb-3">No tasks for this day</p>
                    <Button
                      variant="outline"
                      className="bg-white hover:bg-purple-50 hover:border-purple-300"
                      onClick={() => setIsAddTaskOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Task
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {view === "weekly" && (
            <div className="grid grid-cols-1 grid-cols-7 gap-4">
              {Array.from({ length: 7 }).map((_, i) => {
                const dayDate = new Date(date.getTime())
                dayDate.setDate(date.getDate() - date.getDay() + i)
                const dayDateString = dayDate.toISOString().split("T")[0]
                const dayTasks = getTasksForDateString(dayDateString)

                return (
                  <div key={i} className="min-h-[180px] rounded-xl border border-slate-200 p-4 card-colorful card-hover">
                    <div className="text-sm font-semibold mb-3 text-blue-600">{format(dayDate, "EEE d")}</div>
                    <div className="space-y-2">
                      {dayTasks.map((task) => (
                        <div
                          key={task.id}
                          className={cn(
                            "text-sm p-3 rounded-lg transition-all duration-200 border border-white/50 cursor-pointer",
                            getPriorityClass(task.priority),
                            task.completed ? "opacity-60 line-through" : "",
                          )}
                          onClick={() => handleEditTask(task)}
                        >
                          <div className="font-medium">{task.title}</div>
                          <div className="text-xs text-slate-600 mt-1">
                            {task.startTime} - {task.endTime}
                          </div>
                          {task.source === "ai" && (
                            <div className="text-xs text-blue-600 mt-1">AI Generated</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {view === "monthly" && (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-7 gap-2 min-w-[500px]">
                {Array.from({ length: 42 }).map((_, i) => {
                  const currentDate = new Date(date.getFullYear(), date.getMonth(), 1)
                  const firstDay = currentDate.getDay()
                  const day = i - firstDay + 1
                currentDate.setDate(day)

                const isCurrentMonth = currentDate.getMonth() === date.getMonth()
                const isToday = format(currentDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")

                const dayDateString = format(currentDate, "yyyy-MM-dd")
                const dayTasks = getTasksForDateString(dayDateString)

                return (
                  <div
                    key={i}
                    className={cn(
                      "h-24 p-2 border rounded-lg overflow-hidden transition-all duration-200 card-hover cursor-pointer",
                      !isCurrentMonth && "opacity-40 bg-slate-100/50",
                      isToday && "ring-2 ring-purple-400 bg-purple-50",
                      "card-colorful",
                    )}
                    onClick={() => setDate(currentDate)}
                  >
                    <div className={cn("text-sm font-medium mb-1", isToday && "text-purple-600 font-bold")}>
                      {format(currentDate, "d")}
                    </div>
                    <div className="space-y-1">
                      {dayTasks.slice(0, 2).map((task) => (
                        <div
                          key={task.id}
                          className={cn("text-xs p-1 rounded truncate", getPriorityClass(task.priority))}
                        >
                          {task.title}
                        </div>
                      ))}
                      {dayTasks.length > 2 && (
                        <div className="text-xs text-slate-500 font-medium">+{dayTasks.length - 2} more</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Task Dialog */}
      <Dialog open={isEditTaskOpen} onOpenChange={setIsEditTaskOpen}>
        <DialogContent className="card-colorful">
          <DialogHeader>
            <DialogTitle className="text-purple-600 text-xl">Edit Task</DialogTitle>
          </DialogHeader>
          <TaskForm onSubmit={handleUpdateTask} submitText="Update Task" />
        </DialogContent>
      </Dialog>
    </>
  )
}