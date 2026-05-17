// hooks/use-sync-retry.ts
//
// One-place retry path for tasks whose Google Calendar sync failed. Calls the
// existing /integrate-plan endpoint with a single-task batch, then writes the
// per-task result back to Firestore. Used from the calendar/events/today UIs
// so the user can recover from a transient Google failure without losing
// their plan.

"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { useCalendarStore } from "@/lib/calendar-store"
import { authedFetch } from "@/lib/api-client"
import { toast } from "@/components/ui/use-toast"
import type { CalendarTask } from "@/lib/firestore-calendar"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL

interface IntegrateResult {
  index: number
  status: "synced" | "failed"
  googleEventId?: string
  googleEventLink?: string
  error?: string
}

// "HH:MM" + "YYYY-MM-DD" → ISO datetime string (local, no offset). The backend
// then interprets it in DEFAULT_TIMEZONE — same contract as the AI's output.
function toIsoFromTask(t: CalendarTask, which: "start" | "end"): string {
  const time = which === "start" ? t.startTime : t.endTime
  return `${t.date}T${time.length === 5 ? time + ":00" : time}`
}

export function useSyncRetry() {
  const { getAccessToken, signInWithGoogle, signOut } = useAuth()
  const { applySyncResults, tasks } = useCalendarStore()
  const auth = { getAccessToken, signInWithGoogle, signOut }
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const retry = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    setRetryingId(taskId)
    try {
      const response = await authedFetch(
        `${API_BASE_URL}/integrate-plan`,
        {
          method: "POST",
          body: JSON.stringify({
            skillName: task.title,
            structuredTasks: [{
              summary: task.title,
              description: task.description || "",
              startTime: toIsoFromTask(task, "start"),
              endTime: toIsoFromTask(task, "end"),
            }],
          }),
        },
        auth,
      )
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail || "Retry failed.")
      }
      const data: { results: IntegrateResult[] } = await response.json()
      const r = data.results?.[0]
      if (!r) throw new Error("No result returned from sync.")
      await applySyncResults([{
        taskId,
        syncStatus: r.status,
        googleEventId: r.googleEventId,
        googleEventLink: r.googleEventLink,
      }])
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
  }

  return { retry, retryingId }
}
