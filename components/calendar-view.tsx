// frontend/components/calendar-view.tsx

"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { CalendarTask } from "@/lib/firestore-calendar"

interface CalendarViewProps {
  initialView?: "day" | "week" | "month"
}

export default function CalendarView({ initialView = "week" }: CalendarViewProps) {
  const { isAuthenticated } = useAuth()
  const [view, setView] = useState<"day" | "week" | "month">(initialView)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedCalendar, setSelectedCalendar] = useState<string>("all")
  const [calendars, setCalendars] = useState<
    { id: string; name: string; source: "app" | "google"; primary?: boolean }[]
  >([])
  const [events, setEvents] = useState<CalendarTask[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  // Load calendars and events
  useEffect(() => {
    loadCalendars()
  }, [isAuthenticated])

  // Load events when calendar selection or date range changes
  useEffect(() => {
    loadEvents()
  }, [selectedCalendar, currentDate, view])

  // Function to load available calendars
  const loadCalendars = async () => {
    try {
      const response = await fetch("/api/calendars")
      if (!response.ok) {
        throw new Error(`Failed to load calendars: ${response.statusText}`)
      }

      const availableCalendars = await response.json()
      setCalendars([{ id: "all", name: "All Calendars", source: "app" }, ...availableCalendars])
    } catch (error) {
      console.error("Error loading calendars:", error)
      toast({
        title: "Error",
        description: "Failed to load calendars",
        variant: "destructive",
      })
    }
  }

  // Function to load events
  const loadEvents = async () => {
    setIsLoading(true)
    try {
      const startDate = getStartDate().toISOString()
      const endDate = getEndDate().toISOString()

      const response = await fetch(
        `/api/events?calendarId=${selectedCalendar}&startDate=${startDate}&endDate=${endDate}`,
      )

      if (!response.ok) {
        throw new Error(`Failed to load events: ${response.statusText}`)
      }

      const allEvents = await response.json()
      setEvents(allEvents)
    } catch (error) {
      console.error("Error loading events:", error)
      toast({
        title: "Error",
        description: "Failed to load events",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Function to sync Google events to app
  const handleSync = async () => {
    if (!isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please sign in with Google to sync events",
      })
      return
    }

    setIsSyncing(true)
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ calendarId: selectedCalendar === "all" ? "primary" : selectedCalendar }),
      })

      if (!response.ok) {
        throw new Error(`Failed to sync events: ${response.statusText}`)
      }

      const result = await response.json()

      if (result.success) {
        toast({
          title: "Sync Successful",
          description: `Synced ${result.eventCount} events from Google Calendar`,
        })

        // Reload events
        loadEvents()
      } else {
        toast({
          title: "Sync Failed",
          description: "Failed to sync events from Google Calendar",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error syncing events:", error)
      toast({
        title: "Sync Error",
        description: "An error occurred while syncing events",
        variant: "destructive",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  // Helper functions for date manipulation
  const getStartDate = () => {
    const date = new Date(currentDate)
    if (view === "day") {
      date.setHours(0, 0, 0, 0)
    } else if (view === "week") {
      const day = date.getDay()
      date.setDate(date.getDate() - day)
      date.setHours(0, 0, 0, 0)
    } else if (view === "month") {
      date.setDate(1)
      date.setHours(0, 0, 0, 0)
    }
    return date
  }

  const getEndDate = () => {
    const date = new Date(getStartDate())
    if (view === "day") {
      date.setHours(23, 59, 59, 999)
    } else if (view === "week") {
      date.setDate(date.getDate() + 6)
      date.setHours(23, 59, 59, 999)
    } else if (view === "month") {
      date.setMonth(date.getMonth() + 1)
      date.setDate(0)
      date.setHours(23, 59, 59, 999)
    }
    return date
  }

  // Navigation functions
  const goToPrevious = () => {
    const newDate = new Date(currentDate)
    if (view === "day") {
      newDate.setDate(newDate.getDate() - 1)
    } else if (view === "week") {
      newDate.setDate(newDate.getDate() - 7)
    } else if (view === "month") {
      newDate.setMonth(newDate.getMonth() - 1)
    }
    setCurrentDate(newDate)
  }

  const goToNext = () => {
    const newDate = new Date(currentDate)
    if (view === "day") {
      newDate.setDate(newDate.getDate() + 1)
    } else if (view === "week") {
      newDate.setDate(newDate.getDate() + 7)
    } else if (view === "month") {
      newDate.setMonth(newDate.getMonth() + 1)
    }
    setCurrentDate(newDate)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Format date range for display
  const formatDateRange = () => {
    const startDate = getStartDate()
    const endDate = getEndDate()

    if (view === "day") {
      return startDate.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    } else if (view === "week") {
      return `${startDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${endDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
    } else if (view === "month") {
      return startDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    }
    return ""
  }

  // Render day cells for week and month views
  const renderDayCells = () => {
    if (view === "day") {
      return renderDayView()
    }

    const startDate = getStartDate()
    const cells = []
    const daysToRender = view === "week" ? 7 : getDaysInMonth(currentDate)

    for (let i = 0; i < daysToRender; i++) {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + i)

      const isToday = isSameDay(date, new Date())
      const dayEvents = events.filter((event) => isSameDay(new Date(event.date), date))

      cells.push(
        <div
          key={i}
          className={`border rounded-md p-2 ${isToday ? "bg-primary/10 border-primary" : ""} ${
            view === "week" ? "h-[300px]" : "h-24"
          } overflow-auto`}
        >
          <div className="font-medium text-sm mb-1">
            {date.toLocaleDateString(undefined, { weekday: view === "week" ? "short" : undefined, day: "numeric" })}
          </div>
          <div className="space-y-1">
            {dayEvents.map((event) => (
              <div
                key={event.id}
                className={`text-xs p-1 rounded truncate ${
                  event.priority === "high"
                    ? "bg-destructive/20 border-l-2 border-destructive"
                    : event.priority === "medium"
                      ? "bg-primary/20 border-l-2 border-primary"
                      : "bg-secondary/20 border-l-2 border-secondary"
                }`}
              >
                <div className="font-medium">{event.title}</div>
                {view === "week" && <div className="text-xs opacity-70">{`${event.startTime} - ${event.endTime}`}</div>}
              </div>
            ))}
          </div>
        </div>,
      )
    }

    return <div className={`grid gap-1 ${view === "week" ? "grid-cols-7" : "grid-cols-7"}`}>{cells}</div>
  }

  // Render day view
  const renderDayView = () => {
    const dayEvents = events
      .filter((event) => isSameDay(new Date(event.date), currentDate))
      .sort((a, b) => a.startTime.localeCompare(b.startTime))

    return (
      <div className="space-y-2">
        {dayEvents.length > 0 ? (
          dayEvents.map((event) => (
            <Card key={event.id} className="p-3">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-medium">{event.title}</h4>
                  <p className="text-sm text-muted-foreground">{event.description}</p>
                  <div className="text-xs text-muted-foreground mt-1">{`${event.startTime} - ${event.endTime}`}</div>
                </div>
                <Badge
                  variant={
                    event.priority === "high" ? "destructive" : event.priority === "medium" ? "default" : "outline"
                  }
                >
                  {event.priority}
                </Badge>
              </div>
            </Card>
          ))
        ) : (
          <div className="flex h-[200px] items-center justify-center rounded-md border border-dashed">
            <p className="text-sm text-muted-foreground">No events for this day</p>
          </div>
        )}
      </div>
    )
  }

  // Helper functions
  const isSameDay = (date1: Date, date2: Date) => {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    )
  }

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xl font-medium">Calendar</CardTitle>
        <div className="flex items-center space-x-2">
          <Select value={selectedCalendar} onValueChange={setSelectedCalendar}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Calendar" />
            </SelectTrigger>
            <SelectContent>
              {calendars.map((calendar) => (
                <SelectItem key={calendar.id} value={calendar.id}>
                  {calendar.name} {calendar.primary && "(Primary)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing || !isAuthenticated}>
            {isSyncing ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Sync
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={goToPrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={goToNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium">{formatDateRange()}</div>
          </div>
          <div className="flex items-center space-x-1">
            <Button variant={view === "day" ? "default" : "outline"} size="sm" onClick={() => setView("day")}>
              Day
            </Button>
            <Button variant={view === "week" ? "default" : "outline"} size="sm" onClick={() => setView("week")}>
              Week
            </Button>
            <Button variant={view === "month" ? "default" : "outline"} size="sm" onClick={() => setView("month")}>
              Month
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-[300px] items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          renderDayCells()
        )}
      </CardContent>
    </Card>
  )
}
