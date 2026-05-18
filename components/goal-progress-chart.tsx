// components/goal-progress-chart.tsx
"use client"

import { useMemo } from "react"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts"
import type { CalendarTask } from "@/lib/firestore-calendar"

interface Props {
  tasks: CalendarTask[]
  // optional: clamp the x-axis to this many trailing days (default 30)
  windowDays?: number
}

const dayKey = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// Builds a per-day series of {scheduled, completedCumulative, scheduledCumulative}.
// "Cumulative" so the curve always trends up — easier to read than a noisy
// per-day bar chart, especially for goals that have only a handful of tasks.
function buildSeries(tasks: CalendarTask[], windowDays: number) {
  if (tasks.length === 0) return []
  const allDates = tasks.map(t => t.date).sort()
  const firstDate = new Date(allDates[0] + "T00:00:00")
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const lastTaskDate = new Date(allDates[allDates.length - 1] + "T00:00:00")
  // End the chart at whichever is later: today, or the last scheduled task
  // (so future scheduled work is still visible).
  const end = lastTaskDate > today ? lastTaskDate : today
  // Start at whichever is later: first task day, or windowDays before end.
  const earliestWindow = new Date(end)
  earliestWindow.setDate(end.getDate() - (windowDays - 1))
  const start = firstDate > earliestWindow ? firstDate : earliestWindow

  const tasksByDate = new Map<string, CalendarTask[]>()
  for (const t of tasks) {
    if (!tasksByDate.has(t.date)) tasksByDate.set(t.date, [])
    tasksByDate.get(t.date)!.push(t)
  }

  const points: { date: string; label: string; scheduled: number; completed: number }[] = []
  let scheduledCum = 0
  let completedCum = 0
  const cursor = new Date(start)
  while (cursor.getTime() <= end.getTime()) {
    const key = dayKey(cursor)
    const dayTasks = tasksByDate.get(key) ?? []
    scheduledCum += dayTasks.length
    completedCum += dayTasks.filter(t => t.completed).length
    points.push({
      date: key,
      label: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
      scheduled: scheduledCum,
      completed: completedCum,
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return points
}

export default function GoalProgressChart({ tasks, windowDays = 30 }: Props) {
  const data = useMemo(() => buildSeries(tasks, windowDays), [tasks, windowDays])
  const todayKey = dayKey(new Date())

  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-slate-500">
        No data yet — completed tasks will show up here.
      </div>
    )
  }

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--purple))" stopOpacity={0.45} />
              <stop offset="100%" stopColor="hsl(var(--purple))" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="scheduledGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--blue))" stopOpacity={0.18} />
              <stop offset="100%" stopColor="hsl(var(--blue))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
            formatter={(value: any, name: any) =>
              [value, name === "completed" ? "Completed" : "Scheduled"] as [any, string]
            }
            labelFormatter={(label: any, payload: any) => {
              const p = payload?.[0]?.payload
              return p ? p.date : label
            }}
          />
          <ReferenceLine x={data.find(p => p.date === todayKey)?.label} stroke="hsl(var(--purple))" strokeDasharray="3 3" />
          <Area type="monotone" dataKey="scheduled" stroke="hsl(var(--blue))" fill="url(#scheduledGrad)" strokeWidth={1.5} />
          <Area type="monotone" dataKey="completed" stroke="hsl(var(--purple))" fill="url(#completedGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
