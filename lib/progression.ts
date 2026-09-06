// lib/progression.ts
//
// Per-goal progression level, modelled on TrainerRoad's Adaptive Training.
//
// THE CORE IDEA WE'RE BORROWING: when an athlete misses sessions,
// TrainerRoad does NOT shove the original plan later. It decays their
// Progression Level so the plan re-issues EASIER work from where they
// actually are. Shifting the calendar snowballs (Todoist names this failure
// mode in their own docs); reducing difficulty converges.
//
// Level runs 1.0–10.0 and is DERIVED by replaying the goal's tasks in
// schedule order, not stored as a mutable counter. That means:
//   * no decay cron is needed — the level is always current when read
//   * it's idempotent and replayable, matching the event-log philosophy
//   * there's no stored value to drift out of sync with reality
//
// Mean reversion is deliberate. SM-2's ease factor famously ratchets to its
// floor with no way back ("ease hell"); FSRS fixed that by making difficulty
// mean-revert. Same trick here: gains are larger when the level is low,
// losses larger when it's high, so a bad week can't permanently pin a user.

import type { CalendarTask } from "./firestore-calendar"
import { dayKeyInTz } from "./progress"

export const MIN_LEVEL = 1.0
export const MAX_LEVEL = 10.0
export const DEFAULT_LEVEL = 3.0

const COMPLETE_GAIN = 0.25
const MISS_DECAY = 0.4
const MEAN_REVERSION = 0.05 // pull toward the midpoint each step

const clamp = (v: number) => Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, v))

/** One step of the level update. Exported for tests and for previewing. */
export function stepLevel(current: number, outcome: "completed" | "missed" | "skipped"): number {
  if (outcome === "skipped") return current // neutral by design — see lib/progress.ts
  const midpoint = (MIN_LEVEL + MAX_LEVEL) / 2
  // Gains shrink as the level rises; losses shrink as it falls.
  const headroom = (MAX_LEVEL - current) / (MAX_LEVEL - MIN_LEVEL)
  const floorroom = (current - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL)
  const delta =
    outcome === "completed"
      ? COMPLETE_GAIN * (0.5 + headroom)
      : -MISS_DECAY * (0.5 + floorroom)
  const reverted = current + (midpoint - current) * MEAN_REVERSION
  return clamp(reverted + delta)
}

export interface ProgressionResult {
  level: number
  /** How the next batch of work should be pitched, for the LLM and the UI. */
  band: "recovering" | "steady" | "stretching"
  completed: number
  missed: number
}

/**
 * Replays a goal's tasks in schedule order to get the current level.
 * Only tasks whose scheduled day has passed count as "missed" — future
 * incomplete work is simply not due yet.
 */
export function computeProgressionLevel(opts: {
  tasks: CalendarTask[]
  goalId?: string
  timeZone?: string
  now?: Date
}): ProgressionResult {
  const { tasks, goalId, timeZone, now = new Date() } = opts
  const todayKey = dayKeyInTz(now, timeZone)

  const relevant = (goalId ? tasks.filter(t => t.goalId === goalId) : tasks)
    .slice()
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))

  let level = DEFAULT_LEVEL
  let completed = 0
  let missed = 0

  for (const t of relevant) {
    if (t.completed) {
      level = stepLevel(level, "completed")
      completed++
    } else if (t.date < todayKey) {
      // Past its day and still not done.
      level = stepLevel(level, "missed")
      missed++
    }
    // Future incomplete tasks: not due, no signal.
  }

  const band = level < 2.5 ? "recovering" : level > 5.5 ? "stretching" : "steady"
  return { level: Math.round(level * 10) / 10, band, completed, missed }
}

/**
 * The instruction we hand the LLM. Phrased as scope/difficulty guidance
 * because that's the lever we want it pulling — never "move everything to
 * next week".
 */
export function difficultyGuidanceFor(result: ProgressionResult): string {
  switch (result.band) {
    case "recovering":
      return `The user has been missing sessions (progression level ${result.level}/10). Re-enter gently: SHORTER sessions (30-45 min), fewer per day, and revisit fundamentals before advancing. Do NOT simply move the old plan later — reduce its scope so it fits the pace they are actually keeping.`
    case "stretching":
      return `The user is consistently completing work (progression level ${result.level}/10). Push slightly: longer or more demanding sessions, and introduce harder material sooner than a default plan would.`
    default:
      return `The user is keeping a steady pace (progression level ${result.level}/10). Keep session length and difficulty near their current level, progressing gradually.`
  }
}
