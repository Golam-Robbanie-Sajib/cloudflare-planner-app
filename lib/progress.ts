// lib/progress.ts
//
// Pure helpers for computing user-progress signals from the Firestore tasks
// the CalendarStore already maintains. Used by the dashboard "Today" widget,
// by the streak badge, and as input for the AI's userProgress signal.
//
// Kept side-effect free so it's easy to test and so React can call it in
// render without re-subscribing to anything.

import type { CalendarTask } from "./firestore-calendar"

const parseLocalDate = (yyyyMmDd: string): Date => new Date(yyyyMmDd + "T00:00:00")

const dayKey = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export interface ProgressStats {
  todayTasks: CalendarTask[]
  todayCompleted: number
  todayTotal: number
  overdueTasks: CalendarTask[]
  currentStreak: number
  bestStreak: number
  totalCompleted: number
  totalTasks: number
  // 0-1; undefined when there's not enough data (<3 historical tasks) so the
  // UI can show a "build some history" state instead of a misleading 0%.
  completionRate?: number
}

export function computeProgress(tasks: CalendarTask[]): ProgressStats {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = dayKey(today)

  const todayTasks = tasks
    .filter(t => t.date === todayStr)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
  const todayCompleted = todayTasks.filter(t => t.completed).length

  const overdueTasks = tasks.filter(t => {
    if (t.completed) return false
    const taskDate = parseLocalDate(t.date)
    taskDate.setHours(0, 0, 0, 0)
    return taskDate.getTime() < today.getTime()
  })

  // Streak: consecutive days ending today (or yesterday, if today is empty so
  // far) in which at least one task was completed.
  const completedDays = new Set<string>()
  for (const t of tasks) {
    if (!t.completed) continue
    completedDays.add(t.date)
  }
  let currentStreak = 0
  let bestStreak = 0
  let cursor = new Date(today)
  // Allow today to be "in progress" — if today has no completion yet, start
  // counting from yesterday so we don't reset the streak before the user
  // finishes their first task of the day.
  if (!completedDays.has(todayStr)) {
    cursor.setDate(cursor.getDate() - 1)
  }
  while (completedDays.has(dayKey(cursor))) {
    currentStreak++
    cursor.setDate(cursor.getDate() - 1)
  }
  // Best streak: scan all completed days in chronological order.
  const sortedDays = [...completedDays].sort()
  let run = 0
  let prev: Date | null = null
  for (const k of sortedDays) {
    const d = parseLocalDate(k)
    if (prev) {
      const diffDays = Math.round((d.getTime() - prev.getTime()) / 86400000)
      run = diffDays === 1 ? run + 1 : 1
    } else {
      run = 1
    }
    if (run > bestStreak) bestStreak = run
    prev = d
  }
  bestStreak = Math.max(bestStreak, currentStreak)

  const totalCompleted = tasks.filter(t => t.completed).length
  const totalTasks = tasks.length
  const completionRate = totalTasks >= 3 ? totalCompleted / totalTasks : undefined

  return {
    todayTasks,
    todayCompleted,
    todayTotal: todayTasks.length,
    overdueTasks,
    currentStreak,
    bestStreak,
    totalCompleted,
    totalTasks,
    completionRate,
  }
}

export function todayDateString(): string {
  return dayKey(new Date())
}

export function tomorrowDateString(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return dayKey(d)
}
