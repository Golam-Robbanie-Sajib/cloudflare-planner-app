// hooks/use-reschedule.ts
//
// One-place reschedule path that moves a task to a new date locally
// (Firestore) AND in Google Calendar when the task has been synced. The
// "HH:MM" times are preserved — only the date changes — because the
// drag-to-reschedule UI is day-granular.

"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { useCalendarStore } from "@/lib/calendar-store"
import { authedFetch } from "@/lib/api-client"
import { toast } from "@/components/ui/use-toast"
import type { CalendarTask } from "@/lib/firestore-calendar"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL

function toIso(date: string, time: string): string {
  const hhmm = time.length === 5 ? time + ":00" : time
  return `${date}T${hhmm}`
}

export function useReschedule() {
  const { getAccessToken, signInWithGoogle, signOut } = useAuth()
  const { updateTask, tasks } = useCalendarStore()
  const auth = { getAccessToken, signInWithGoogle, signOut }
  const [movingId, setMovingId] = useState<string | null>(null)

  const moveTo = async (taskId: string, newDate: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task || task.date === newDate) return
    setMovingId(taskId)

    // 1. Update Firestore first so the move is instant in the UI even if
    //    Google takes a moment / fails. If GCal sync later fails we'll flag
    //    the task and the user can retry.
    await updateTask(taskId, { date: newDate, syncStatus: task.googleEventId ? "pending" : task.syncStatus })

    // 2. If the task was previously synced to Google, push the new times.
    if (task.googleEventId && task.syncStatus === "synced") {
      try {
        const response = await authedFetch(
          `${API_BASE_URL}/reschedule-event`,
          {
            method: "POST",
            body: JSON.stringify({
              googleEventId: task.googleEventId,
              startTime: toIso(newDate, task.startTime),
              endTime: toIso(newDate, task.endTime),
            }),
          },
          auth,
        )
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err.detail || "Google rejected the reschedule.")
        }
        await updateTask(taskId, { syncStatus: "synced" })
      } catch (e) {
        await updateTask(taskId, { syncStatus: "failed" })
        toast({
          title: "Google sync failed",
          description: `Moved in the app, but couldn't update Google Calendar: ${(e as Error).message}. Use "Retry sync".`,
          variant: "destructive",
        })
        setMovingId(null)
        return
      }
    }

    toast({ title: "Rescheduled", description: `"${task.title}" moved to ${newDate}.` })
    setMovingId(null)
  }

  return { moveTo, movingId }
}
