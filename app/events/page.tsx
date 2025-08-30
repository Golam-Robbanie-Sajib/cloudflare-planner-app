//app/events/page.tsx

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge, badgeVariants } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import Link from "next/link"
import { ArrowLeft, Plus, Search, MapPin, Users, Filter, MoreHorizontal, CalendarIcon, Clock, Tag } from "lucide-react"
import { format, isBefore, isToday, parseISO } from "date-fns"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { useCalendarStore } from "@/lib/calendar-store"
import { type VariantProps } from "class-variance-authority"

export default function EventsPage() {
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false)
  const { tasks, addTask } = useCalendarStore()

  // ADDED: State management for the details dialog
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)
  const [isDetailViewOpen, setIsDetailViewOpen] = useState(false)

  // Convert calendar tasks to events format
  const allEvents = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    // Ensure date is treated as a Date object for sorting and filtering
    date: new Date(task.date + "T00:00:00"),
    location: task.location,
    attendees: task.attendees,
    type: task.type === "event" ? "meeting" : task.priority === "high" ? "deadline" : "reminder",
    startTime: task.startTime,
    endTime: task.endTime,
    priority: task.priority,
    completed: task.completed,
  }))

  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")

  // ADDED: Handler to open the details dialog
  const handleShowDetails = (event: any) => {
    setSelectedEvent(event)
    setIsDetailViewOpen(true)
  }

  // Filter events based on search query and type filter
  const filterEvents = (events: any[]) => {
    return events.filter((event) => {
      const matchesSearch =
        event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (event.location && event.location.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesType = typeFilter === "all" || event.type === typeFilter

      return matchesSearch && matchesType
    })
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to the beginning of today for accurate comparison

  const pastEvents = filterEvents(
    allEvents.filter((event) => isBefore(event.date, today)),
  ).sort((a, b) => b.date.getTime() - a.date.getTime())

  const upcomingEvents = filterEvents(
    allEvents.filter((event) => !isBefore(event.date, today)),
  ).sort((a, b) => a.date.getTime() - b.date.getTime())

  // Function to get badge variant based on event type
  const getBadgeVariant = (type: string) => {
    switch (type) {
      case "meeting": return "default"
      case "deadline": return "destructive"
      case "reminder": return "secondary"
      case "personal": return "outline"
      default: return "default"
    }
  }

  const handleCreateEvent = (formData: FormData) => {
    const title = formData.get("title") as string
    const description = formData.get("description") as string
    const date = formData.get("date") as string
    const time = formData.get("time") as string
    const location = formData.get("location") as string
    const type = formData.get("type") as string

    if (!title || !date || !time) {
      toast({ title: "Error", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    const startTime = time
    const [hours, minutes] = time.split(":").map(Number)
    const endHours = hours + 1
    const endTime = `${endHours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`

    addTask({
      title, description, date, startTime, endTime,
      priority: type === "deadline" ? "high" : "medium",
      type: "event", location: location || undefined,
      source: "user", completed: false, synced: false,
    });

    setIsCreateEventOpen(false)
    toast({ title: "Event Created", description: `"${title}" has been added to your calendar and events` });
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center px-6">
          <Link href="/" className="flex items-center text-sm font-medium hover:text-purple-600">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
          <div className="ml-auto flex items-center space-x-2">
            <Dialog open={isCreateEventOpen} onOpenChange={setIsCreateEventOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="btn-purple">
                  <Plus className="mr-2 h-4 w-4" />
                  New Event
                </Button>
              </DialogTrigger>
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Date *</label>
                      <Input name="date" type="date" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Time *</label>
                      <Input name="time" type="time" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Location</label>
                    <Input name="location" placeholder="Event location" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Type</label>
                    <select
                      name="type"
                      className="w-full p-2 rounded-md border border-slate-200 focus:border-purple-300 focus:ring-purple-200"
                    >
                      <option value="meeting">Meeting</option>
                      <option value="deadline">Deadline</option>
                      <option value="reminder">Reminder</option>
                      <option value="personal">Personal</option>
                    </select>
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateEventOpen(false)}
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
      <div className="flex-1 space-y-6 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-purple-600">Events</h1>
            <p className="text-muted-foreground">View and manage all your events in one place.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                className="pl-8 w-full sm:w-[250px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <div className="flex items-center">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Filter by type" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="meeting">Meetings</SelectItem>
                <SelectItem value="deadline">Deadlines</SelectItem>
                <SelectItem value="reminder">Reminders</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-slate-100">
            <TabsTrigger value="upcoming" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
              Upcoming ({upcomingEvents.length})
            </TabsTrigger>
            <TabsTrigger value="past" className="data-[state=active]:bg-green-500 data-[state=active]:text-white">
              Past ({pastEvents.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-4">
            {upcomingEvents.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {upcomingEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    badgeVariant={getBadgeVariant(event.type)}
                    handleShowDetails={handleShowDetails}
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">No upcoming events found</p>
                  <Button variant="outline" className="mt-2" onClick={() => setIsCreateEventOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Event
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="past" className="mt-4">
            {pastEvents.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {pastEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    badgeVariant={getBadgeVariant(event.type)}
                    isPast
                    handleShowDetails={handleShowDetails}
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white">
                <p className="text-sm text-muted-foreground">No past events found</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* CORRECTLY PLACED DIALOG */}
      <Dialog open={isDetailViewOpen} onOpenChange={setIsDetailViewOpen}>
        <DialogContent className="card-colorful">
          <DialogHeader>
            <DialogTitle className="text-purple-600">Event Details</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4 pt-4">
              <h3 className="font-semibold text-lg">{selectedEvent.title}</h3>
              <p className="text-sm text-muted-foreground">{selectedEvent.description}</p>
              <div className="flex items-center text-sm">
                <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                {format(selectedEvent.date, "EEEE, MMMM d, yyyy")}
              </div>
              <div className="flex items-center text-sm">
                <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                {selectedEvent.startTime} - {selectedEvent.endTime}
              </div>
              {selectedEvent.location && (
                <div className="flex items-center text-sm">
                  <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                  {selectedEvent.location}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EventCard({
  event,
  badgeVariant,
  isPast = false,
  handleShowDetails, // MODIFIED: Accept handler
}: {
  event: any
  badgeVariant: VariantProps<typeof badgeVariants>["variant"]
  isPast?: boolean
  handleShowDetails: (event: any) => void // MODIFIED: Define handler type
}) {
  return (
    <Card className={`card-colorful card-hover ${isPast ? "opacity-75" : ""} ${event.completed ? "opacity-60" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <CardTitle className={`text-base ${event.completed ? "line-through" : ""}`}>{event.title}</CardTitle>
            <CardDescription className="line-clamp-2">{event.description}</CardDescription>
          </div>
          <div className="flex flex-col gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* MODIFIED: Add onClick */}
                <DropdownMenuItem onClick={() => handleShowDetails(event)}>View details</DropdownMenuItem>
                <DropdownMenuItem>Edit event</DropdownMenuItem>
                {!isPast && <DropdownMenuItem>Set reminder</DropdownMenuItem>}
                <DropdownMenuItem className="text-destructive">Delete event</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {event.completed && (
              <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                Done
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="space-y-2 text-sm">
          <div className="flex items-center">
            <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>{format(event.date, "EEEE, MMMM d, yyyy")}</span>
          </div>
          <div className="flex items-center">
            <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>
              {event.startTime} - {event.endTime}
            </span>
          </div>
          {event.location && (
            <div className="flex items-center">
              <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>{event.location}</span>
            </div>
          )}
          {event.attendees && (
            <div className="flex items-center">
              <Users className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>{event.attendees} attendees</span>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="pt-2">
        <div className="flex items-center justify-between w-full">
          <Badge variant={badgeVariant} className="capitalize">
            <Tag className="mr-1 h-3 w-3" />
            {event.type}
          </Badge>
          {!isPast && (
            // MODIFIED: Add onClick
            <Button variant="outline" size="sm" className="hover:bg-purple-50 hover:border-purple-300" onClick={() => handleShowDetails(event)}>
              View
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}