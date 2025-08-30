// frontend/app/lib/calendar-actions.ts

"use server"

import { cookies } from "next/headers"
import { googleApiEndpoints, googleAuthConfig } from "./google-auth-config"

// Interface for Google Calendar
export interface GoogleCalendar {
  id: string
  summary: string
  description?: string
  primary?: boolean
  backgroundColor?: string
  foregroundColor?: string
}

// Interface for Google Calendar Event
export interface GoogleCalendarEvent {
  id: string
  summary: string
  description?: string
  start: {
    dateTime: string
    timeZone: string
  }
  end: {
    dateTime: string
    timeZone: string
  }
  colorId?: string
  status: string
  htmlLink: string
  created: string
  updated: string
}

// Simple in-memory store for app calendar events
let appCalendarEvents: any[] = []

// Function to check if the user is authenticated with Google
export async function isGoogleAuthenticated(): Promise<boolean> {
  const cookieStore = cookies()
  const accessToken = cookieStore.get("google_access_token")
  return !!accessToken
}

// Function to get the user's Google Calendar access token
export async function getGoogleAccessToken(): Promise<string | null> {
  const cookieStore = cookies()
  const accessToken = cookieStore.get("google_access_token")
  return accessToken?.value || null
}

// Function to refresh the access token if needed
export async function refreshGoogleAccessToken(): Promise<string | null> {
  const cookieStore = cookies()
  const refreshToken = cookieStore.get("google_refresh_token")?.value

  if (!refreshToken) {
    return null
  }

  try {
    const response = await fetch(googleApiEndpoints.token, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: googleAuthConfig.clientId,
        client_secret: googleAuthConfig.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()

    // Update the access token cookie
    cookieStore.set("google_access_token", data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: data.expires_in,
      path: "/",
    })

    return data.access_token
  } catch (error) {
    console.error("Error refreshing token:", error)
    return null
  }
}

// Function to get all calendars for the user
export async function getUserCalendars(): Promise<GoogleCalendar[]> {
  try {
    let accessToken = await getGoogleAccessToken()

    if (!accessToken) {
      accessToken = await refreshGoogleAccessToken()
      if (!accessToken) {
        throw new Error("No access token available")
      }
    }

    const response = await fetch(`${googleApiEndpoints.calendar}/users/me/calendarList`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired, try to refresh
        accessToken = await refreshGoogleAccessToken()
        if (accessToken) {
          // Retry with new token
          return getUserCalendars()
        }
      }
      throw new Error(`Failed to get calendars: ${await response.text()}`)
    }

    const data = await response.json()
    return data.items || []
  } catch (error) {
    console.error("Error getting user calendars:", error)
    return []
  }
}

// Function to add an event to Google Calendar
export async function addEventToGoogleCalendar(task: any, calendarId = "primary"): Promise<GoogleCalendarEvent | null> {
  try {
    let accessToken = await getGoogleAccessToken()

    if (!accessToken) {
      accessToken = await refreshGoogleAccessToken()
      if (!accessToken) {
        throw new Error("No access token available")
      }
    }

    // Format the event for Google Calendar
    const event = {
      summary: task.title,
      description: task.description,
      start: {
        dateTime: `${task.date}T${task.startTime}:00`,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: `${task.date}T${task.endTime}:00`,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      // Set color based on priority
      colorId: task.priority === "high" ? "11" : task.priority === "medium" ? "5" : "9",
    }

    // Add the event to the specified calendar
    const response = await fetch(`${googleApiEndpoints.calendar}/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    })

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired, try to refresh
        accessToken = await refreshGoogleAccessToken()
        if (accessToken) {
          // Retry with new token
          return addEventToGoogleCalendar(task, calendarId)
        }
      }
      throw new Error(`Failed to add event: ${await response.text()}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error("Error adding event to Google Calendar:", error)
    return null
  }
}

// Function to add a plan to Google Calendar
export async function addPlanToGoogleCalendar(
  plan: any,
  calendarId = "primary",
): Promise<{ success: boolean; eventCount: number }> {
  try {
    // Add each task as an event
    const results = await Promise.all(plan.tasks.map((task) => addEventToGoogleCalendar(task, calendarId)))

    // Count successful events
    const successfulEvents = results.filter((result) => result !== null).length

    // Return success if at least one event was added
    return {
      success: successfulEvents > 0,
      eventCount: successfulEvents,
    }
  } catch (error) {
    console.error("Error adding plan to Google Calendar:", error)
    return { success: false, eventCount: 0 }
  }
}

// Function to get events from Google Calendar
export async function getEventsFromGoogleCalendar(
  calendarId = "primary",
  timeMin: string = new Date().toISOString(),
  timeMax: string = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
): Promise<GoogleCalendarEvent[]> {
  try {
    let accessToken = await getGoogleAccessToken()

    if (!accessToken) {
      accessToken = await refreshGoogleAccessToken()
      if (!accessToken) {
        throw new Error("No access token available")
      }
    }

    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
    })

    const response = await fetch(
      `${googleApiEndpoints.calendar}/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired, try to refresh
        accessToken = await refreshGoogleAccessToken()
        if (accessToken) {
          // Retry with new token
          return getEventsFromGoogleCalendar(calendarId, timeMin, timeMax)
        }
      }
      throw new Error(`Failed to get events: ${await response.text()}`)
    }

    const data = await response.json()
    return data.items || []
  } catch (error) {
    console.error("Error getting events from Google Calendar:", error)
    return []
  }
}

// Function to convert Google Calendar events to app tasks
export function convertGoogleEventsToTasks(events: GoogleCalendarEvent[]): any[] {
  return events.map((event) => {
    // Determine priority based on color
    let priority: "high" | "medium" | "low" = "medium"
    if (event.colorId === "11") priority = "high"
    else if (event.colorId === "9") priority = "low"

    // Parse start and end times
    const startDate = new Date(event.start.dateTime)
    const endDate = new Date(event.end.dateTime)

    return {
      id: event.id,
      title: event.summary,
      description: event.description || "",
      date: startDate.toISOString().split("T")[0],
      startTime: startDate.toTimeString().substring(0, 5),
      endTime: endDate.toTimeString().substring(0, 5),
      priority,
    }
  })
}

// Function to add a plan to the app's calendar
export async function addPlanToCalendar(plan: any): Promise<void> {
  console.log("Adding plan to app calendar:", plan)

  // Add tasks to the app calendar
  appCalendarEvents = [...appCalendarEvents, ...plan.tasks]

  return Promise.resolve()
}

// Function to add a plan to both app and Google calendars
export async function addPlanToCalendars(
  plan: any,
  calendarId = "primary",
): Promise<{ success: boolean; googleSuccess: boolean; appSuccess: boolean }> {
  try {
    // Add to app calendar
    await addPlanToCalendar(plan)
    const appSuccess = true

    // Check if Google Calendar integration is available
    const googleAuthAvailable = await isGoogleAuthenticated()
    let googleSuccess = false

    if (googleAuthAvailable) {
      // If authenticated with Google, also add to Google Calendar
      const result = await addPlanToGoogleCalendar(plan, calendarId)
      googleSuccess = result.success
    }

    return {
      success: appSuccess || googleSuccess,
      googleSuccess,
      appSuccess,
    }
  } catch (error) {
    console.error("Error adding plan to calendars:", error)
    return {
      success: false,
      googleSuccess: false,
      appSuccess: false,
    }
  }
}

// Function to get all events from the app calendar
export function getAppCalendarEvents(): any[] {
  return [...appCalendarEvents]
}

// Function to sync events from Google Calendar to the app
export async function syncGoogleEventsToApp(calendarId = "primary"): Promise<{ success: boolean; eventCount: number }> {
  try {
    // Check if Google Calendar integration is available
    const googleAuthAvailable = await isGoogleAuthenticated()

    if (!googleAuthAvailable) {
      return { success: false, eventCount: 0 }
    }

    // Get events from Google Calendar
    const googleEvents = await getEventsFromGoogleCalendar(calendarId)

    // Convert Google events to app tasks
    const tasks = convertGoogleEventsToTasks(googleEvents)

    // Add to app calendar (avoiding duplicates by ID)
    const existingIds = new Set(appCalendarEvents.map((event) => event.id))
    const newTasks = tasks.filter((task) => !existingIds.has(task.id))

    appCalendarEvents = [...appCalendarEvents, ...newTasks]

    return {
      success: true,
      eventCount: newTasks.length,
    }
  } catch (error) {
    console.error("Error syncing Google events to app:", error)
    return {
      success: false,
      eventCount: 0,
    }
  }
}

// Function to get all calendars (app + Google)
export async function getAllCalendars(): Promise<
  { id: string; name: string; source: "app" | "google"; primary?: boolean }[]
> {
  const calendars = [{ id: "app", name: "App Calendar", source: "app" as const, primary: true }]

  // Check if Google Calendar integration is available
  const googleAuthAvailable = await isGoogleAuthenticated()

  if (googleAuthAvailable) {
    // Get Google calendars
    const googleCalendars = await getUserCalendars()

    // Add Google calendars to the list
    calendars.push(
      ...googleCalendars.map((cal) => ({
        id: cal.id,
        name: cal.summary,
        source: "google" as const,
        primary: cal.primary,
      })),
    )
  }

  return calendars
}

// Function to check if user is authenticated (for client components)
export async function checkUserAuthentication(): Promise<{
  isAuthenticated: boolean
  userInfo: { name?: string; email?: string; picture?: string } | null
}> {
  const cookieStore = cookies()
  const userInfoCookie = cookieStore.get("user_info")

  if (userInfoCookie) {
    try {
      const userInfo = JSON.parse(userInfoCookie.value)
      return { isAuthenticated: true, userInfo }
    } catch (error) {
      console.error("Error parsing user info:", error)
    }
  }

  return { isAuthenticated: false, userInfo: null }
}
