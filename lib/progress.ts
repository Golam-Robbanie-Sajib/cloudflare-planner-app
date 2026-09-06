// lib/progress.ts
//
// Pure helpers for computing user-progress signals from the Firestore tasks
// the CalendarStore already maintains. Used by the dashboard "Today" widget,
// by the streak badge, and as input for the AI's userProgress signal.
//
// Kept side-effect free so it's easy to test and so React can call it in
// render without re-subscribing to anything.
//
// TWO CORRECTNESS RULES THIS FILE ENFORCES:
//
// 1. Streaks are derived from `completedAt` (when the work actually
//    happened), never from `date` (the day the task was *scheduled* for).
//    Deriving from `date` meant clearing a backlog of overdue tasks
//    retroactively fabricated streak days that never happened, and doing
//    three days of work in one sitting yielded a 3-day streak.
//
// 2. Every day boundary resolves in ONE authoritative timezone, passed in by
//    the caller (from UserProfile.timezone). Mixing the browser's local
//    midnight with a server-side fixed zone gives users phantom streak
//    breaks whenever they travel or live outside that zone.

import type { CalendarTask } from "./firestore-calendar"

// ─── Timezone-safe day keys ────────────────────────────────────────────────

// "YYYY-MM-DD" for an instant, resolved in `timeZone`. en-CA formats as
// ISO-like YYYY-MM-DD, which is what our task `date` field already uses.
// Falls back to the browser's zone if the IANA name is missing or invalid.
export function dayKeyInTz(d: Date, timeZone?: string): string {
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d)
    } catch {
      // Invalid IANA name — fall through to local.
    }
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// Calendar arithmetic on a day key. Pure UTC so DST transitions can't shift
// the result by a day — we're stepping calendar dates, not instants.
export function addDaysToKey(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().slice(0, 10)
}

// Whole days between two day keys (b - a). Negative when b precedes a.
export function daysBetweenKeys(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number)
  const [by, bm, bd] = b.split("-").map(Number)
  const at = Date.UTC(ay, (am ?? 1) - 1, ad ?? 1)
  const bt = Date.UTC(by, (bm ?? 1) - 1, bd ?? 1)
  return Math.round((bt - at) / 86400000)
}

// Firestore Timestamp | legacy {seconds} | Date | null → Date | null.
// Legacy docs written before completedAt existed return null.
function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const anyVal = value as { toDate?: () => Date; seconds?: number }
  if (typeof anyVal.toDate === "function") {
    try {
      const d = anyVal.toDate()
      return Number.isNaN(d.getTime()) ? null : d
    } catch {
      return null
    }
  }
  if (typeof anyVal.seconds === "number") return new Date(anyVal.seconds * 1000)
  return null
}

// ─── Stats ─────────────────────────────────────────────────────────────────

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
  // Mean days between a task's scheduled date and when it was actually
  // completed. Only counts tasks that have a usable completedAt, so it stays
  // undefined until there's real evidence. Positive = running late.
  avgDelayDays?: number
  // Tasks completed on the day they were scheduled, as a fraction of tasks
  // with completion evidence. This is the honest "did you stick to the plan"
  // number, distinct from completionRate ("did you eventually do it").
  onTimeRate?: number
}

export interface ProgressOptions {
  /** IANA zone from UserProfile.timezone. Falls back to the browser's zone. */
  timeZone?: string
  /** Injectable for tests; defaults to now. */
  now?: Date
}

export function computeProgress(tasks: CalendarTask[], opts: ProgressOptions = {}): ProgressStats {
  const { timeZone, now = new Date() } = opts
  const todayStr = dayKeyInTz(now, timeZone)

  const todayTasks = tasks
    .filter(t => t.date === todayStr)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
  const todayCompleted = todayTasks.filter(t => t.completed).length

  // Overdue: scheduled before today and still not done. Pure string compare
  // works because both sides are YYYY-MM-DD in the same zone.
  const overdueTasks = tasks.filter(t => !t.completed && t.date < todayStr)

  // ── Streak: days on which the user actually completed something ──
  // Keyed on completedAt, not the scheduled date. Tasks completed before
  // completedAt shipped have no evidence, so they can't contribute — better
  // to under-count than to invent history.
  const activeDays = new Set<string>()
  for (const t of tasks) {
    if (!t.completed) continue
    const done = toDate(t.completedAt)
    if (!done) continue
    activeDays.add(dayKeyInTz(done, timeZone))
  }

  let currentStreak = 0
  // Today counts as "in progress" — if nothing is done yet today we start
  // counting from yesterday rather than zeroing a live streak.
  let cursor = activeDays.has(todayStr) ? todayStr : addDaysToKey(todayStr, -1)
  while (activeDays.has(cursor)) {
    currentStreak++
    cursor = addDaysToKey(cursor, -1)
  }

  let bestStreak = 0
  let run = 0
  let prevKey: string | null = null
  for (const k of [...activeDays].sort()) {
    run = prevKey && daysBetweenKeys(prevKey, k) === 1 ? run + 1 : 1
    if (run > bestStreak) bestStreak = run
    prevKey = k
  }
  bestStreak = Math.max(bestStreak, currentStreak)

  // ── Completion + timeliness ──
  const totalCompleted = tasks.filter(t => t.completed).length
  const totalTasks = tasks.length
  const completionRate = totalTasks >= 3 ? totalCompleted / totalTasks : undefined

  // Delay is only measurable where we have completion evidence.
  let delaySum = 0
  let delayCount = 0
  let onTimeCount = 0
  for (const t of tasks) {
    if (!t.completed) continue
    const done = toDate(t.completedAt)
    if (!done) continue
    const delta = daysBetweenKeys(t.date, dayKeyInTz(done, timeZone))
    delaySum += delta
    delayCount++
    if (delta <= 0) onTimeCount++
  }

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
    avgDelayDays: delayCount > 0 ? delaySum / delayCount : undefined,
    onTimeRate: delayCount > 0 ? onTimeCount / delayCount : undefined,
  }
}

export function todayDateString(timeZone?: string): string {
  return dayKeyInTz(new Date(), timeZone)
}

export function tomorrowDateString(timeZone?: string): string {
  return addDaysToKey(dayKeyInTz(new Date(), timeZone), 1)
}
