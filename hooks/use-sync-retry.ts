// hooks/use-sync-retry.ts
//
// One-place retry path for tasks whose Google Calendar sync failed. Now built
// on top of useIntegratePlan so we share retry policy + auth handling with
// every other LLM call.

"use client"

import { useCallback, useState } from "react"
import { useCalendarStore } from "@/lib/calendar-store"
import { useProfileStore } from "@/lib/profile-store"
import { useIntegratePlan } from "@/hooks/use-api-mutations"
import { toast } from "@/components/ui/use-toast"
import type { CalendarTask } from "@/lib/firestore-calendar"

function toIsoFromTask(t: CalendarTask, which: "start" | "end"): string {
  const time = which === "start" ? t.startTime : t.endTime
  const padded = time.length === 5 ? time + ":00" : time
  return `${t.date}T${padded}`
}

export function useSyncRetry() {
  const { applySyncResults, tasks } = useCalendarStore()
  const { profile } = useProfileStore()
  const integrate = useIntegratePlan()
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const retry = useCallback(async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    setRetryingId(taskId)
    try {
      const data = await integrate.mutateAsync({
        skillName: task.title,
        structuredTasks: [
          {
            summary: task.title,
            description: task.description || "",
            startTime: toIsoFromTask(task, "start"),
            endTime: toIsoFromTask(task, "end"),
            resources: [],
          },
        ],
        timeZone: profile?.timezone,
      })
      const r = data.results?.[0]
      if (!r) throw new Error("No result returned from sync.")
      await applySyncResults([
        {
          taskId,
          syncStatus: r.status,
          googleEventId: r.googleEventId,
          googleEventLink: r.googleEventLink,
        },
      ])
      if (r.status === "synced") {
        toast({ title: "Synced", description: `"${task.title}" added to Google Calendar.` })
      } else {
        toast({ title: "Still failing", description: r.error || "Google rejected the event.", variant: "destructive" })
      }
    } catch (e) {
      toast({ title: "Retry failed", description: (e as Error).message, variant: "destructive" })
    } finally {
      setRetryingId(null)
    }
  }, [tasks, integrate, applySyncResults, profile?.timezone])

  return { retry, retryingId }
}
