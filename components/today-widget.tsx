// components/today-widget.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, Flame, BellRing, Bell, AlarmClock, CheckCheck, Target, Timer } from "lucide-react"
import { useCalendarStore } from "@/lib/calendar-store"
import { useGoalStore } from "@/lib/goal-store"
import FocusTimer from "@/components/focus-timer"
import type { CalendarTask } from "@/lib/firestore-calendar"
import { computeProgress, tomorrowDateString } from "@/lib/progress"
import {
  checkAndFireNotifications,
  getPermissionState,
  requestPermission,
  type PermissionState,
} from "@/lib/notifications"
import { toast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"

export default function TodayWidget() {
  const { tasks, toggleTask, updateTask } = useCalendarStore()
  const { goals } = useGoalStore()
  const goalNameById = (id?: string) => (id ? goals.find((g) => g.id === id)?.title : undefined)

  // Memoize derived stats so we don't recompute on every keystroke elsewhere.
  const stats = useMemo(() => computeProgress(tasks), [tasks])
  const { todayTasks, todayCompleted, todayTotal, overdueTasks, currentStreak, bestStreak } = stats

  const [perm, setPerm] = useState<PermissionState>("default")
  const [focusTask, setFocusTask] = useState<CalendarTask | null>(null)

  useEffect(() => {
    setPerm(getPermissionState())
  }, [])

  // Poll once a minute for tasks-starting-soon and fire native notifications.
  // We also re-check immediately when the task list changes (e.g. user just
  // completed something — that task should disappear from the queue).
  useEffect(() => {
    if (perm !== "granted") return
    checkAndFireNotifications(tasks)
    const interval = window.setInterval(() => checkAndFireNotifications(tasks), 60_000)
    return () => window.clearInterval(interval)
  }, [tasks, perm])

  const enableNotifications = async () => {
    const result = await requestPermission()
    setPerm(result)
    if (result === "granted") {
      toast({ title: "Reminders enabled", description: "You'll get a heads-up 5 minutes before each task." })
    } else if (result === "denied") {
      toast({
        title: "Reminders blocked",
        description: "Your browser blocked notifications. Re-enable in site settings to turn them on.",
        variant: "destructive",
      })
    } else if (result === "unsupported") {
      toast({ title: "Not supported", description: "Your browser doesn't support reminders.", variant: "destructive" })
    }
  }

  const markAllDone = async () => {
    const pending = todayTasks.filter((t) => !t.completed)
    if (pending.length === 0) return
    await Promise.all(pending.map((t) => toggleTask(t.id)))
    toast({ title: `${pending.length} tasks completed`, description: "Nice — your streak just grew." })
  }

  const snooze = async (taskId: string) => {
    await updateTask(taskId, { date: tomorrowDateString() })
    toast({ title: "Snoozed to tomorrow" })
  }

  return (
    <Card className="card-colorful card-hover shadow-lg mb-6">
      <CardHeader className="px-4 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-lg font-bold flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
              <AlarmClock className="h-4 w-4 text-white" />
            </div>
            <span className="text-purple-600">Today</span>
            <span className="text-sm font-normal text-slate-500">
              {todayCompleted}/{todayTotal} done
            </span>
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={cn(
                "border-orange-300 text-orange-700",
                currentStreak === 0 && "opacity-60",
              )}
              title={`Best streak: ${bestStreak} day${bestStreak === 1 ? "" : "s"}`}
            >
              <Flame className="h-3.5 w-3.5 mr-1" />
              {currentStreak}-day streak
            </Badge>
            {overdueTasks.length > 0 && (
              <Badge variant="outline" className="border-red-300 text-red-700">
                {overdueTasks.length} overdue
              </Badge>
            )}
            {perm === "default" && (
              <Button variant="outline" size="sm" onClick={enableNotifications}>
                <Bell className="h-3.5 w-3.5 mr-1" /> Enable reminders
              </Button>
            )}
            {perm === "granted" && (
              <Badge variant="outline" className="border-green-300 text-green-700">
                <BellRing className="h-3.5 w-3.5 mr-1" />reminders on
              </Badge>
            )}
            {todayTasks.some((t) => !t.completed) && (
              <Button variant="outline" size="sm" onClick={markAllDone}>
                <CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark all done
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {todayTasks.length === 0 ? (
          <div className="text-center py-6 text-sm text-slate-500">
            Nothing scheduled for today. Use the chat to plan a goal, or
            <span className="text-purple-600 font-medium"> snooze something forward</span>.
          </div>
        ) : (
          <div className="space-y-2">
            {todayTasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  "flex items-center justify-between gap-3 p-3 rounded-lg border bg-white",
                  task.completed && "opacity-60",
                )}
              >
                <button
                  onClick={() => toggleTask(task.id)}
                  className={cn(
                    "h-5 w-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors",
                    task.completed ? "bg-green-500 border-green-500" : "border-slate-300 hover:border-purple-400",
                  )}
                  aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
                >
                  {task.completed && <Check className="h-3 w-3 text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium truncate", task.completed && "line-through")}>{task.title}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="text-xs text-slate-500">
                      {task.startTime} – {task.endTime}
                    </span>
                    {goalNameById(task.goalId) && (
                      <Badge variant="outline" className="text-[10px] py-0 h-4 px-1 border-purple-300 text-purple-700">
                        <Target className="h-2.5 w-2.5 mr-0.5" />
                        {goalNameById(task.goalId)}
                      </Badge>
                    )}
                  </div>
                </div>
                {!task.completed && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setFocusTask(task)} title="Start focus timer">
                      <Timer className="h-3.5 w-3.5 mr-1" />Focus
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => snooze(task.id)} title="Move to tomorrow">
                      <AlarmClock className="h-3.5 w-3.5 mr-1" />Tomorrow
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <FocusTimer task={focusTask} open={!!focusTask} onOpenChange={(o) => { if (!o) setFocusTask(null) }} />
    </Card>
  )
}
