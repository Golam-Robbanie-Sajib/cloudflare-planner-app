// lib/plan-health.ts
//
// Answers the question the app previously couldn't: "am I on track to finish
// this goal by its deadline?"
//
// Two industry models informed this:
//
//   * Sunsama's daily workload capacity — warn PROSPECTIVELY, while planning,
//     when the requested work doesn't fit the days available. Far better than
//     letting the user discover it five days in.
//   * Motion's Green/Yellow/Red project ETA rollup, and its "Can't Fit" task
//     state for work with no feasible slot.
//
// Everything here is pure so it can be called in render and unit-tested.

import type { CalendarTask } from "./firestore-calendar"
import type { UserGoal } from "./firestore-goals"
import { addDaysToKey, dayKeyInTz, daysBetweenKeys } from "./progress"

// Hours we consider schedulable in a day. Outside this the user is presumed
// asleep. Deliberately generous — we're testing feasibility, not prescribing
// a routine.
const AWAKE_START_HOUR = 7
const AWAKE_END_HOUR = 23

export interface BusySlot {
  date: string
  startTime: string
  endTime: string
  title?: string
}

const hhmmToHours = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number)
  if (Number.isNaN(h)) return 0
  return h + (Number.isNaN(m) ? 0 : m) / 60
}

/** Duration of a task in hours, from its "HH:MM" range. */
export function taskHours(t: Pick<CalendarTask, "startTime" | "endTime">): number {
  const start = hhmmToHours(t.startTime)
  const end = hhmmToHours(t.endTime)
  const diff = end - start
  return diff > 0 ? diff : 0
}

/**
 * Free hours on one day, inside the awake window, after removing busy slots.
 * Overlapping busy slots are merged so double-booked meetings don't
 * double-subtract.
 */
export function freeHoursOnDay(busy: BusySlot[], dayKey: string): number {
  const windowStart = AWAKE_START_HOUR
  const windowEnd = AWAKE_END_HOUR
  const intervals = busy
    .filter(b => b.date === dayKey)
    .map(b => [hhmmToHours(b.startTime), hhmmToHours(b.endTime)] as [number, number])
    .map(([s, e]) => [Math.max(s, windowStart), Math.min(e, windowEnd)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0])

  let busyHours = 0
  let cursorEnd = -Infinity
  for (const [s, e] of intervals) {
    const start = Math.max(s, cursorEnd)
    if (e > start) {
      busyHours += e - start
      cursorEnd = e
    }
  }
  return Math.max(0, windowEnd - windowStart - busyHours)
}

export interface FeasibilityResult {
  /** Whether the requested plan plausibly fits the user's real schedule. */
  feasible: boolean
  /** Days in the window where the requested daily hours don't fit. */
  tightDays: string[]
  totalFreeHours: number
  requiredHours: number
}

/**
 * Prospective check, run BEFORE asking the LLM to build a plan. Catches
 * "15 days × 2h/day" against a calendar that has no room for it.
 */
export function assessFeasibility(opts: {
  startDate: string
  durationDays: number
  dailyHours: number
  busySlots: BusySlot[]
}): FeasibilityResult {
  const { startDate, durationDays, dailyHours, busySlots } = opts
  const tightDays: string[] = []
  let totalFreeHours = 0

  for (let i = 0; i < durationDays; i++) {
    const key = addDaysToKey(startDate, i)
    const free = freeHoursOnDay(busySlots, key)
    totalFreeHours += free
    if (free < dailyHours) tightDays.push(key)
  }

  const requiredHours = durationDays * dailyHours
  // Infeasible when either there isn't enough total room, or more than a
  // third of the days can't host a single session. The second test matters
  // because learning needs regular contact, not one heroic weekend.
  const feasible = totalFreeHours >= requiredHours && tightDays.length <= Math.floor(durationDays / 3)

  return { feasible, tightDays, totalFreeHours, requiredHours }
}

// ─── Goal health ───────────────────────────────────────────────────────────

export type GoalHealthStatus =
  | "done"
  | "on_track"
  | "at_risk"
  | "behind"
  | "not_feasible"
  | "no_deadline"

export interface GoalHealth {
  status: GoalHealthStatus
  remainingTasks: number
  remainingHours: number
  overdueTasks: number
  /** Days from today to the target date; negative once the deadline passes. */
  daysLeft: number | null
  /** Hours/day the user must average from here to finish on time. */
  requiredPacePerDay: number | null
  /** One-line summary safe to render directly. */
  headline: string
}

function timestampToDayKey(value: unknown, timeZone?: string): string | null {
  if (!value) return null
  const anyVal = value as { toDate?: () => Date; seconds?: number }
  let d: Date | null = null
  if (value instanceof Date) d = value
  else if (typeof anyVal.toDate === "function") {
    try {
      d = anyVal.toDate()
    } catch {
      d = null
    }
  } else if (typeof anyVal.seconds === "number") d = new Date(anyVal.seconds * 1000)
  if (!d || Number.isNaN(d.getTime())) return null
  return dayKeyInTz(d, timeZone)
}

export function computeGoalHealth(opts: {
  goal: UserGoal
  tasks: CalendarTask[]
  /** Sustainable hours/day for this user; from profile.defaultDailyHours. */
  dailyCapacityHours?: number
  timeZone?: string
  now?: Date
}): GoalHealth {
  const { goal, tasks, dailyCapacityHours = 2, timeZone, now = new Date() } = opts
  const todayKey = dayKeyInTz(now, timeZone)

  const goalTasks = tasks.filter(t => t.goalId === goal.id)
  const remaining = goalTasks.filter(t => !t.completed)
  const remainingTasks = remaining.length
  const remainingHours = remaining.reduce((acc, t) => acc + taskHours(t), 0)
  const overdueTasks = remaining.filter(t => t.date < todayKey).length

  if (remainingTasks === 0) {
    return {
      status: "done",
      remainingTasks: 0,
      remainingHours: 0,
      overdueTasks: 0,
      daysLeft: null,
      requiredPacePerDay: null,
      headline: goalTasks.length > 0 ? "All tasks complete." : "No tasks yet.",
    }
  }

  // Fall back to the latest scheduled task when no explicit deadline exists,
  // so goals created before targetDate was populated still get a health read.
  const targetKey =
    timestampToDayKey(goal.targetDate, timeZone) ??
    goalTasks.map(t => t.date).sort().at(-1) ??
    null

  if (!targetKey) {
    return {
      status: "no_deadline",
      remainingTasks,
      remainingHours,
      overdueTasks,
      daysLeft: null,
      requiredPacePerDay: null,
      headline: `${remainingTasks} task${remainingTasks === 1 ? "" : "s"} left, no target date set.`,
    }
  }

  const daysLeft = daysBetweenKeys(todayKey, targetKey)
  // Today still counts as a usable day.
  const usableDays = Math.max(1, daysLeft + 1)
  const requiredPacePerDay = remainingHours / usableDays

  if (daysLeft < 0) {
    return {
      status: "behind",
      remainingTasks,
      remainingHours,
      overdueTasks,
      daysLeft,
      requiredPacePerDay,
      headline: `Past the target date with ${remainingTasks} task${remainingTasks === 1 ? "" : "s"} left.`,
    }
  }

  const paceRatio = requiredPacePerDay / Math.max(0.25, dailyCapacityHours)
  let status: GoalHealthStatus
  if (paceRatio > 1.5) status = "not_feasible"
  else if (paceRatio > 1.0 || overdueTasks >= 3) status = "behind"
  else if (paceRatio > 0.8 || overdueTasks > 0) status = "at_risk"
  else status = "on_track"

  const pace = requiredPacePerDay.toFixed(1)
  const headline =
    status === "on_track"
      ? `On track — about ${pace}h/day for ${usableDays} more day${usableDays === 1 ? "" : "s"}.`
      : status === "at_risk"
        ? `Slipping — needs ${pace}h/day to finish on time.`
        : status === "behind"
          ? `Behind — ${overdueTasks} overdue, needs ${pace}h/day to catch up.`
          : `Not achievable at ${dailyCapacityHours}h/day — would need ${pace}h/day.`

  return {
    status,
    remainingTasks,
    remainingHours,
    overdueTasks,
    daysLeft,
    requiredPacePerDay,
    headline,
  }
}

/** Tailwind classes per status, kept next to the logic so they stay in sync. */
export const HEALTH_STYLES: Record<GoalHealthStatus, { label: string; className: string }> = {
  done: { label: "Complete", className: "border-green-300 text-green-700" },
  on_track: { label: "On track", className: "border-green-300 text-green-700" },
  at_risk: { label: "At risk", className: "border-amber-300 text-amber-700" },
  behind: { label: "Behind", className: "border-red-300 text-red-700" },
  not_feasible: { label: "Not achievable", className: "border-red-400 text-red-800" },
  no_deadline: { label: "No deadline", className: "border-slate-300 text-slate-600" },
}
