// hooks/use-reschedule.ts
//
// Move a task to a new date locally (Firestore) AND in Google Calendar when
// the task has been synced. "HH:MM" times are preserved — only the date
// changes — because the drag-to-reschedule UI is day-granular.
//
// Optimistic: Firestore is updated immediately (the calendar UI flips before
// the network round-trip). If Google rejects the PATCH, we flag the task as
// "failed" so the user can retry from the existing sync-failure surface.

"use client"

import { useCallback, useState } from "react"
import { useCalendarStore } from "@/lib/calendar-store"
import { useProfileStore } from "@/lib/profile-store"
import { useRescheduleEvent } from "@/hooks/use-api-mutations"
import { toast } from "@/components/ui/use-toast"

function toIso(date: string, time: string): string {
  const hhmm = time.length === 5 ? time + ":00" : time
  return `${date}T${hhmm}`
}

export function useReschedule() {
  const { updateTask, tasks } = useCalendarStore()
  const { profile } = useProfileStore()
  const reschedule = useRescheduleEvent()
  const [movingId, setMovingId] = useState<string | null>(null)

  const moveTo = useCallback(async (taskId: string, newDate: string) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.date === newDate) return
    setMovingId(taskId)

    // 1. Optimistically update Firestore so the UI flips immediately.
    await updateTask(taskId, {
      date: newDate,
      syncStatus: task.googleEventId ? "pending" : task.syncStatus,
    })

    // 2. Push to Google if this task was previously synced.
    if (task.googleEventId && task.syncStatus === "synced") {
      try {
        await reschedule.mutateAsync({
          googleEventId: task.googleEventId,
          startTime: toIso(newDate, task.startTime),
          endTime: toIso(newDate, task.endTime),
          timeZone: profile?.timezone,
        })
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
  }, [tasks, updateTask, reschedule, profile?.timezone])

  return { moveTo, movingId }
}
