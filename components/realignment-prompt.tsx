// components/realignment-prompt.tsx
//
// The "you've fallen behind — here's the way back" surface.
//
// Modelled on Runna's Plan Realignment: after a run of missed sessions it
// offers an explicit choice between skipping forward and rebuilding from
// current fitness, rather than silently letting the backlog snowball.
//
// Timing follows the fresh start effect (Dai, Milkman & Riis 2014): people
// act on aspirational behaviour at temporal landmarks, so we surface this on
// Mondays and month starts rather than the moment a task goes red.
//
// Deliberately NOT a guilt surface. The what-the-hell effect says abandonment
// is triggered by the *belief* the goal is blown — so the copy names a
// recovery path first and never counts the user's failures back at them.

"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, Wand2, CalendarClock } from "lucide-react"
import { useCalendarStore } from "@/lib/calendar-store"
import { useGoalStore } from "@/lib/goal-store"
import { useProfileStore } from "@/lib/profile-store"
import { computeGoalHealth } from "@/lib/plan-health"
import { computeProgressionLevel } from "@/lib/progression"
import { dayKeyInTz, todayDateString } from "@/lib/progress"

// Suppress for the rest of the week once dismissed, keyed by the landmark
// so the next Monday surfaces it again.
const DISMISS_KEY = "tf:realign-dismissed"

function isFreshStartLandmark(timeZone?: string, now = new Date()): boolean {
  const key = dayKeyInTz(now, timeZone)
  const day = new Date(key + "T00:00:00").getDay()
  const dayOfMonth = Number(key.split("-")[2])
  return day === 1 || dayOfMonth <= 2 // Monday, or the first couple of a month
}

export default function RealignmentPrompt() {
  const { tasks } = useCalendarStore()
  const { goals } = useGoalStore()
  const { profile } = useProfileStore()
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)

  const candidate = useMemo(() => {
    if (!goals.length || !tasks.length) return null
    const timeZone = profile?.timezone

    // Find the goal in the most trouble that still has a way back.
    const scored = goals
      .filter(g => g.status !== "completed")
      .map(g => ({
        goal: g,
        health: computeGoalHealth({
          goal: g,
          tasks,
          dailyCapacityHours: profile?.defaultDailyHours ?? 2,
          timeZone,
        }),
        progression: computeProgressionLevel({ tasks, goalId: g.id, timeZone }),
      }))
      .filter(x => x.health.status === "behind" || x.health.status === "not_feasible")
      .sort((a, b) => b.health.overdueTasks - a.health.overdueTasks)

    const worst = scored[0]
    if (!worst) return null
    // Runna's threshold: more than a handful of missed sessions, not one bad day.
    if (worst.health.overdueTasks < 3) return null
    return worst
  }, [goals, tasks, profile?.timezone, profile?.defaultDailyHours])

  const landmarkKey = todayDateString(profile?.timezone)
  const alreadyDismissed = (() => {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === landmarkKey
    } catch {
      return false
    }
  })()

  if (!candidate || dismissed || alreadyDismissed) return null
  if (!isFreshStartLandmark(profile?.timezone)) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISS_KEY, landmarkKey)
    } catch {
      /* private mode — in-memory dismissal is enough */
    }
  }

  const rebuild = () => {
    // Hands off to the existing regenerate flow, which already carries
    // progression level + busy slots into the prompt.
    const params = new URLSearchParams({ regen: candidate.goal.id, goal: candidate.goal.title })
    router.push(`/dashboard?${params.toString()}`)
  }

  const { goal, health } = candidate

  return (
    <Card className="mb-6 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Fresh week — want to reset &ldquo;{goal.title}&rdquo;?
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
              {health.overdueTasks} session{health.overdueTasks === 1 ? "" : "s"} slipped past. Rather than
              stacking them on top of this week, I can rebuild the rest of the plan around the time you
              actually have — lighter sessions, same goal.
            </p>
            <div className="flex gap-2 mt-3 flex-wrap">
              <Button size="sm" className="btn-purple" onClick={rebuild}>
                <Wand2 className="h-3.5 w-3.5 mr-1" /> Rebuild from here
              </Button>
              <Button size="sm" variant="outline" onClick={dismiss}>
                <CalendarClock className="h-3.5 w-3.5 mr-1" /> Keep the current plan
              </Button>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={dismiss} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
