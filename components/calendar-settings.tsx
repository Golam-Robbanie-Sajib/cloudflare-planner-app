//components/calendar-settings.tsx

"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { Loader2, RefreshCw } from "lucide-react"

// Define the calendar type
interface Calendar {
  id: string
  name: string
  source: "app" | "google"
  primary?: boolean
}

export default function CalendarSettings() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [defaultCalendar, setDefaultCalendar] = useState<string>("app")
  const [autoSync, setAutoSync] = useState(false)
  const [syncFrequency, setSyncFrequency] = useState("daily")
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  // Load calendars and settings
  useEffect(() => {
    if (!authLoading) {
      loadCalendars()
      loadSettings()
    }
  }, [authLoading, isAuthenticated])

  // Function to load available calendars
  const loadCalendars = async () => {
    try {
      const response = await fetch("/api/calendars")
      if (!response.ok) {
        throw new Error(`Failed to load calendars: ${response.statusText}`)
      }

      const availableCalendars: Calendar[] = await response.json()
      setCalendars(availableCalendars)

      // If no calendars or default calendar not in list, set to app
      if (availableCalendars.length === 0 || !availableCalendars.some((cal: Calendar) => cal.id === defaultCalendar)) {
        setDefaultCalendar("app")
      }
    } catch (error) {
      console.error("Error loading calendars:", error)
      toast({
        title: "Error",
        description: "Failed to load calendars",
        variant: "destructive",
      })
    }
  }

  // Function to load user settings
  const loadSettings = () => {
    // In a real app, these would be loaded from a database or API
    // For now, we'll use localStorage
    try {
      const savedDefaultCalendar = localStorage.getItem("defaultCalendar")
      const savedAutoSync = localStorage.getItem("autoSync")
      const savedSyncFrequency = localStorage.getItem("syncFrequency")

      if (savedDefaultCalendar) setDefaultCalendar(savedDefaultCalendar)
      if (savedAutoSync) setAutoSync(savedAutoSync === "true")
      if (savedSyncFrequency) setSyncFrequency(savedSyncFrequency)
    } catch (error) {
      console.error("Error loading settings:", error)
    }
  }

  // Function to save settings
  const saveSettings = async () => {
    setIsLoading(true)
    try {
      // In a real app, these would be saved to a database or API
      // For now, we'll use localStorage
      localStorage.setItem("defaultCalendar", defaultCalendar)
      localStorage.setItem("autoSync", autoSync.toString())
      localStorage.setItem("syncFrequency", syncFrequency)

      toast({
        title: "Settings Saved",
        description: "Your calendar settings have been saved successfully.",
      })
    } catch (error) {
      console.error("Error saving settings:", error)
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Function to manually sync calendars
  const handleSync = async () => {
    if (!isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please sign in with Google to sync calendars",
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
        body: JSON.stringify({ calendarId: "primary" }),
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
      } else {
        toast({
          title: "Sync Failed",
          description: "Failed to sync events from Google Calendar",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error syncing calendars:", error)
      toast({
        title: "Sync Error",
        description: "An error occurred while syncing calendars",
        variant: "destructive",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendar Settings</CardTitle>
        <CardDescription>Configure your calendar preferences and integrations</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Default Calendar</h3>
          <div className="space-y-2">
            <Label htmlFor="default-calendar">Select the default calendar for new events</Label>
            <Select value={defaultCalendar} onValueChange={setDefaultCalendar}>
              <SelectTrigger id="default-calendar">
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
            <p className="text-sm text-muted-foreground">This calendar will be used when adding new events and plans</p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-medium">Google Calendar Sync</h3>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-sync">Auto-sync with Google Calendar</Label>
              <p className="text-sm text-muted-foreground">
                Automatically sync events between this app and Google Calendar
              </p>
            </div>
            <Switch id="auto-sync" checked={autoSync} onCheckedChange={setAutoSync} disabled={!isAuthenticated} />
          </div>

          {autoSync && (
            <div className="space-y-2">
              <Label htmlFor="sync-frequency">Sync Frequency</Label>
              <Select value={syncFrequency} onValueChange={setSyncFrequency}>
                <SelectTrigger id="sync-frequency">
                  <SelectValue placeholder="Select Frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="manual">Manual Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <Button variant="outline" onClick={handleSync} disabled={isSyncing || !isAuthenticated} className="w-full">
            {isSyncing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Now
              </>
            )}
          </Button>

          {!isAuthenticated && (
            <p className="text-sm text-muted-foreground">Sign in with Google to enable calendar synchronization</p>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={saveSettings} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Settings"
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}