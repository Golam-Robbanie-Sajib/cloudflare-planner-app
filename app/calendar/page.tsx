//app/calendar/page.tsx

"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Clock, MapPin, Users, ArrowLeft, Plus, Check, Trash2, Info, MoreHorizontal } from "lucide-react"
import Link from "next/link"
import { format, addDays, isToday, isTomorrow, parseISO } from "date-fns"
import { useCalendarStore } from "@/lib/calendar-store"
import { useGoalStore } from "@/lib/goal-store"
import { useReschedule } from "@/hooks/use-reschedule"
import { useSyncRetry } from "@/hooks/use-sync-retry"
import { toast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AlertCircle, RefreshCw, ExternalLink, Target, Loader2, GripVertical } from "lucide-react"

export default function CalendarPage() {
  const { tasks, addTask, toggleTask, deleteTask, loading } = useCalendarStore();
  const { goals } = useGoalStore();
  const { moveTo, movingId } = useReschedule();
  const { retry, retryingId } = useSyncRetry();
  const goalNameById = (id?: string) => id ? goals.find(g => g.id === id)?.title : undefined;
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)
  const [showEventDialog, setShowEventDialog] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggingId(taskId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", taskId);
  };
  const handleDragOverDay = (e: React.DragEvent, dateStr: string) => {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverDate !== dateStr) setDragOverDate(dateStr);
  };
  const handleDropOnDay = async (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    setDragOverDate(null);
    if (!id) return;
    await moveTo(id, dateStr);
  };

  // Convert tasks to events format for display, preserving goal + sync metadata.
  const events = tasks.map((task) => ({
    ...task,
    date: new Date(task.date + "T00:00:00"),
    type: task.type === "event" ? "meeting" : task.priority === "high" ? "deadline" : "reminder",
    goalTitle: goalNameById(task.goalId),
  }))

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    const dateString = format(date, "yyyy-MM-dd")
    return events.filter((event) => format(event.date, "yyyy-MM-dd") === dateString)
  }

  // Get badge variant based on event type
  const getBadgeVariant = (type: string) => {
    switch (type) {
      case "meeting":
        return "default"
      case "deadline":
        return "destructive"
      case "reminder":
        return "secondary"
      case "personal":
        return "outline"
      default:
        return "default"
    }
  }

  // Get priority color
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "border-l-red-500"
      case "medium":
        return "border-l-yellow-500"
      case "low":
        return "border-l-green-500"
      default:
        return "border-l-gray-300"
    }
  }

  // Handle event actions
  const handleMarkDone = (eventId: string) => {
    toggleTask(eventId)
  }

  const handleDeleteEvent = (eventId: string) => {
    deleteTask(eventId)
    toast({
      title: "Event Deleted",
      description: "Event has been removed from your calendar",
    })
  }

  const handleShowDetails = (event: any) => {
    setSelectedEvent(event)
    setShowEventDialog(true)
  }

  const handleCreateEvent = async(formData: FormData) => {
    const title = formData.get("title") as string
    const description = formData.get("description") as string
    const date = formData.get("date") as string
    const startTime = formData.get("startTime") as string
    const endTime = formData.get("endTime") as string
    const priority = formData.get("priority") as "high" | "medium" | "low"
    const goalId = (formData.get("goalId") as string) || ""

    if (!title || !date || !startTime || !endTime) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      })
      return
    }

    await addTask({
      title,
      description,
      date,
      startTime,
      endTime,
      priority,
      type: "event",
      source: "user",
      completed: false,
      synced: false,
      ...(goalId && goalId !== "none" ? { goalId } : {}),
    })

    setShowCreateDialog(false)
    toast({
      title: "Event Created",
      description: `"${title}" has been added to your calendar`,
    })
  }

  // Format date display
  const formatDateDisplay = (date: Date) => {
    if (isToday(date)) {
      return "Today"
    } else if (isTomorrow(date)) {
      return "Tomorrow"
    } else {
      return format(date, "EEE")
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="flex h-14 items-center px-4">
          <Link href="/" className="flex items-center text-sm font-medium">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
          <div className="ml-auto flex items-center space-x-2">
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Event
              </Button>
              <DialogContent className="card-colorful">
                <DialogHeader>
                  <DialogTitle className="text-purple-600">Create New Event</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const formData = new FormData(e.currentTarget)
                    handleCreateEvent(formData)
                  }}
                  className="space-y-4 pt-4"
                >
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Title *</label>
                    <Input name="title" placeholder="Event title" required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Description</label>
                    <Textarea name="description" placeholder="Event description" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date *</label>
                    <Input name="date" type="date" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Start Time *</label>
                      <Input name="startTime" type="time" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">End Time *</label>
                      <Input name="endTime" type="time" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Priority</label>
                    <select
                      name="priority"
                      className="w-full p-2 rounded-md border border-slate-200 focus:border-purple-300 focus:ring-purple-200"
                    >
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                      <option value="low">Low Priority</option>
                    </select>
                  </div>
                  {goals.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Link to Goal (optional)</label>
                      <select
                        name="goalId"
                        defaultValue="none"
                        className="w-full p-2 rounded-md border border-slate-200 focus:border-purple-300 focus:ring-purple-200"
                      >
                        <option value="none">No goal</option>
                        {goals.map(g => (
                          <option key={g.id} value={g.id}>{g.title}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowCreateDialog(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" className="btn-purple flex-1">
                      Create Event
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-muted-foreground">View your events for the next 14 days. <span className="inline-flex items-center gap-1 text-xs"><GripVertical className="h-3 w-3" />drag a task to another day to reschedule</span></p>
        </div>

        {!loading && tasks.length === 0 && (
          <div className="mb-6 flex items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white py-10">
            <div className="text-center max-w-sm px-4">
              <p className="text-sm font-medium text-slate-700">No events scheduled yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tell the AI assistant what you want to learn — it'll generate a plan and the tasks will show up here.
              </p>
              <div className="mt-4 flex gap-2 justify-center">
                <Link href="/dashboard">
                  <Button className="btn-purple" size="sm">Open AI assistant</Button>
                </Link>
                <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="mr-1 h-4 w-4" />
                  New Event
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Calendar Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4">
          {Array.from({ length: 14 }, (_, i) => {
            const date = addDays(new Date(), i)
            const dayEvents = getEventsForDate(date)
            const isCurrentDay = isToday(date)
            const dateStr = format(date, "yyyy-MM-dd")
            const isDropTarget = dragOverDate === dateStr

            return (
              <Card
                key={i}
                className={`h-fit transition-all ${isCurrentDay ? "ring-2 ring-primary" : ""} ${isDropTarget ? "ring-2 ring-purple-400 bg-purple-50" : ""}`}
                onDragOver={(e) => handleDragOverDay(e, dateStr)}
                onDragLeave={() => { if (dragOverDate === dateStr) setDragOverDate(null) }}
                onDrop={(e) => handleDropOnDay(e, dateStr)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <div>
                      <div className={`font-medium ${isCurrentDay ? "text-primary" : ""}`}>
                        {formatDateDisplay(date)}
                      </div>
                      <div className="text-xs text-muted-foreground font-normal">{format(date, "MMM d")}</div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {dayEvents.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {dayEvents.length > 0 ? (
                      dayEvents.map((event) => (
                        <div
                          key={event.id}
                          className={`relative group ${draggingId === event.id ? "opacity-40" : ""}`}
                          draggable={!event.completed}
                          onDragStart={(e) => handleDragStart(e, event.id)}
                          onDragEnd={() => { setDraggingId(null); setDragOverDate(null) }}
                        >
                          <div
                            className={`p-2 rounded-md border-l-4 transition-all duration-200 ${getPriorityColor(event.priority)} ${
                              event.completed
                                ? "opacity-50 bg-muted/30 line-through"
                                : "hover:bg-muted/50 cursor-grab active:cursor-grabbing"
                            }`}
                            onMouseEnter={() => setHoveredEvent(event.id)}
                            onMouseLeave={() => setHoveredEvent(null)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${event.completed ? "line-through" : ""}`}>
                                  {event.title}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {event.startTime} - {event.endTime}
                                </p>
                                {event.location && (
                                  <p className="text-xs text-muted-foreground truncate mt-1">📍 {event.location}</p>
                                )}
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {event.goalTitle && (
                                    <Badge variant="outline" className="text-[10px] py-0 h-4 px-1 border-purple-300 text-purple-700">
                                      <Target className="h-2.5 w-2.5 mr-0.5" />{event.goalTitle}
                                    </Badge>
                                  )}
                                  {event.syncStatus === "failed" && (
                                    <Badge variant="outline" className="text-[10px] py-0 h-4 px-1 border-red-300 text-red-700">
                                      <AlertCircle className="h-2.5 w-2.5 mr-0.5" />sync failed
                                    </Badge>
                                  )}
                                  {event.syncStatus === "pending" && event.source === "ai" && (
                                    <Badge variant="outline" className="text-[10px] py-0 h-4 px-1 border-slate-300 text-slate-500">
                                      <RefreshCw className="h-2.5 w-2.5 mr-0.5" />syncing
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {event.completed && <Check className="h-3 w-3 text-green-600" />}
                                <Badge variant={getBadgeVariant(event.type)} className="text-xs ml-2 flex-shrink-0">
                                  {event.type}
                                </Badge>
                              </div>
                            </div>

                            {/* Action Popover */}
                            {hoveredEvent === event.id && (
                              <div className="absolute top-1 right-1 z-10">
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 bg-background/80 backdrop-blur-sm border shadow-sm hover:bg-background"
                                    >
                                      <MoreHorizontal className="h-3 w-3" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-32 p-1" align="end">
                                    <div className="space-y-1">
                                      {!event.completed ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="w-full justify-start h-8 px-2"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleMarkDone(event.id)
                                          }}
                                        >
                                          <Check className="h-3 w-3 mr-2" />
                                          Done
                                        </Button>
                                      ) : (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="w-full justify-start h-8 px-2"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleMarkDone(event.id)
                                          }}
                                        >
                                          <Check className="h-3 w-3 mr-2" />
                                          Undone
                                        </Button>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full justify-start h-8 px-2"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleShowDetails(event)
                                        }}
                                      >
                                        <Info className="h-3 w-3 mr-2" />
                                        Details
                                      </Button>
                                      {event.syncStatus === "failed" && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="w-full justify-start h-8 px-2 text-amber-700"
                                          onClick={(e) => { e.stopPropagation(); retry(event.id) }}
                                          disabled={retryingId === event.id}
                                        >
                                          {retryingId === event.id ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-2" />}
                                          Retry sync
                                        </Button>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full justify-start h-8 px-2 text-destructive hover:text-destructive"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleDeleteEvent(event.id)
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3 mr-2" />
                                        Delete
                                      </Button>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground">No events</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Event Detail Dialog */}
      <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Event Details
            </DialogTitle>
          </DialogHeader>

          {selectedEvent && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  {selectedEvent.title}
                  {selectedEvent.completed && <Check className="h-4 w-4 text-green-600" />}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">{selectedEvent.description}</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{format(selectedEvent.date, "EEEE, MMMM d, yyyy")}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {selectedEvent.startTime} - {selectedEvent.endTime}
                  </span>
                </div>

                {selectedEvent.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{selectedEvent.location}</span>
                  </div>
                )}

                {selectedEvent.attendees && (
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{selectedEvent.attendees} attendees</span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 flex items-center justify-center">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        selectedEvent.priority === "high"
                          ? "bg-red-500"
                          : selectedEvent.priority === "medium"
                            ? "bg-yellow-500"
                            : "bg-green-500"
                      }`}
                    />
                  </div>
                  <span className="text-sm capitalize">{selectedEvent.priority} priority</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={getBadgeVariant(selectedEvent.type)} className="capitalize">
                    {selectedEvent.type}
                  </Badge>
                  {selectedEvent.completed && (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      Completed
                    </Badge>
                  )}
                  {selectedEvent.goalTitle && (
                    <Badge variant="outline" className="border-purple-300 text-purple-700">
                      <Target className="h-3 w-3 mr-1" />{selectedEvent.goalTitle}
                    </Badge>
                  )}
                  {selectedEvent.syncStatus === "failed" && (
                    <Badge variant="outline" className="border-red-300 text-red-700">
                      <AlertCircle className="h-3 w-3 mr-1" />Google sync failed
                    </Badge>
                  )}
                  {selectedEvent.googleEventLink && (
                    <a
                      href={selectedEvent.googleEventLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline inline-flex items-center"
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />Open in Google Calendar
                    </a>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                {!selectedEvent.completed ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      handleMarkDone(selectedEvent.id)
                      setShowEventDialog(false)
                    }}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Mark Done
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      handleMarkDone(selectedEvent.id)
                      setShowEventDialog(false)
                    }}
                  >
                    Mark Undone
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-destructive hover:text-destructive"
                  onClick={() => {
                    handleDeleteEvent(selectedEvent.id)
                    setShowEventDialog(false)
                  }}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
