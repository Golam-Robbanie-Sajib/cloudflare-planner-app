// lib/firestore-progress.ts
//
// Append-only progress event log + per-day rollups.
//
// WHY THIS EXISTS: before this, every progress number was recomputed from
// mutable current state. Un-completing a task nulled `completedAt`, which
// destroyed the only evidence the work ever happened — so "how did I do last
// week vs this week?" was unanswerable, and lifetime stats were silently
// clamped by the 60-day task subscription window.
//
// The model follows the discipline TrainingPeaks/Strava use for training
// load: store an immutable daily scalar and replay it, never patch state.
//
//   users/{uid}/events/{autoId}  — append-only, never updated or deleted
//   users/{uid}/days/{YYYY-MM-DD} — derived rollup, cheap to query, rebuildable
//
// The rollup is a cache. If it ever disagrees with the log, the log wins and
// the rollup can be rebuilt (see rebuildDayRollup).

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  Timestamp,
  increment,
  serverTimestamp,
  type QueryConstraint,
} from "firebase/firestore"
import { db } from "./firebase"

// ─── Types ─────────────────────────────────────────────────────────────────

export type ProgressEventType =
  | "task_completed"
  | "task_uncompleted"
  | "task_skipped"
  | "task_moved"
  | "focus_session"
  | "quiz_taken"
  | "plan_generated"
  | "plan_realigned"
  | "streak_freeze_used"

export interface QuizScore {
  correct: number
  total: number
}

export interface ProgressEvent {
  id: string
  type: ProgressEventType
  taskId?: string
  goalId?: string
  /** When it actually happened. */
  occurredAt: Timestamp
  /** The day the task was scheduled for (YYYY-MM-DD), when applicable. */
  scheduledFor?: string
  /** Day bucket resolved in the USER's timezone. Authoritative for rollups. */
  dayKey: string
  /** Real effort, from the focus timer. */
  minutesSpent?: number
  quizScore?: QuizScore
  /** Free-form extras (e.g. plan goal title, realignment reason). */
  meta?: Record<string, string | number | boolean>
}

export interface DayRollup {
  dayKey: string
  done: number
  uncompleted: number
  skipped: number
  minutesSpent: number
  quizCorrect: number
  quizTotal: number
  updatedAt: Timestamp
}

const eventsCol = (uid: string) => collection(db, `users/${uid}/events`)
const dayDoc = (uid: string, dayKey: string) => doc(db, `users/${uid}/days/${dayKey}`)

// Firestore rejects undefined; strip before every write.
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v
  return out as T
}

// ─── Writing ───────────────────────────────────────────────────────────────

// Which rollup counters an event type moves. Types not listed here are
// logged but don't affect counts (e.g. plan_generated is context, not work).
const ROLLUP_DELTAS: Partial<Record<ProgressEventType, Partial<Record<keyof DayRollup, number>>>> = {
  task_completed: { done: 1 },
  task_uncompleted: { done: -1, uncompleted: 1 },
  task_skipped: { skipped: 1 },
}

/**
 * Appends an event and folds it into that day's rollup.
 *
 * Deliberately NOT a transaction: the event log is the source of truth and
 * must land even if the rollup write fails. A failed rollup is recoverable
 * (rebuildDayRollup); a lost event is not. Callers should treat failures as
 * non-fatal — progress logging must never block the user's actual click.
 */
export async function appendProgressEvent(
  uid: string,
  event: Omit<ProgressEvent, "id" | "occurredAt"> & { occurredAt?: Timestamp },
): Promise<string | null> {
  if (!uid || !event?.dayKey) return null

  let eventId: string | null = null
  try {
    const ref = await addDoc(
      eventsCol(uid),
      stripUndefined({ ...event, occurredAt: event.occurredAt ?? Timestamp.now() }),
    )
    eventId = ref.id
  } catch (e) {
    console.warn("progress: event append failed", e)
    return null
  }

  // Fold into the day rollup. Uses increment() so concurrent writes from two
  // tabs don't clobber each other.
  try {
    const deltas = ROLLUP_DELTAS[event.type] ?? {}
    const patch: Record<string, unknown> = {
      dayKey: event.dayKey,
      updatedAt: serverTimestamp(),
    }
    for (const [field, delta] of Object.entries(deltas)) {
      patch[field] = increment(delta as number)
    }
    if (event.minutesSpent) patch.minutesSpent = increment(event.minutesSpent)
    if (event.quizScore) {
      patch.quizCorrect = increment(event.quizScore.correct)
      patch.quizTotal = increment(event.quizScore.total)
    }
    await setDoc(dayDoc(uid, event.dayKey), patch, { merge: true })
  } catch (e) {
    console.warn("progress: rollup update failed (event still logged)", e)
  }

  return eventId
}

// ─── Reading ───────────────────────────────────────────────────────────────

export async function getDayRollups(
  uid: string,
  fromDayKey: string,
  toDayKey: string,
): Promise<DayRollup[]> {
  if (!uid) return []
  try {
    // Doc IDs are the day keys, so an ID range query gets the window without
    // needing a composite index.
    const snap = await getDocs(
      query(
        collection(db, `users/${uid}/days`),
        where("dayKey", ">=", fromDayKey),
        where("dayKey", "<=", toDayKey),
        orderBy("dayKey", "asc"),
      ),
    )
    return snap.docs.map((d) => ({ dayKey: d.id, ...d.data() } as DayRollup))
  } catch (e) {
    console.warn("progress: rollup read failed", e)
    return []
  }
}

export async function getRecentEvents(
  uid: string,
  opts: { types?: ProgressEventType[]; goalId?: string; max?: number } = {},
): Promise<ProgressEvent[]> {
  if (!uid) return []
  const constraints: QueryConstraint[] = [orderBy("occurredAt", "desc"), fsLimit(opts.max ?? 100)]
  // Firestore allows a single `in` filter; adding goalId too would need a
  // composite index, so we filter goalId client-side when both are present.
  if (opts.types?.length) constraints.unshift(where("type", "in", opts.types.slice(0, 10)))
  try {
    const snap = await getDocs(query(eventsCol(uid), ...constraints))
    let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProgressEvent))
    if (opts.goalId) rows = rows.filter((r) => r.goalId === opts.goalId)
    return rows
  } catch (e) {
    console.warn("progress: event read failed", e)
    return []
  }
}

/**
 * Recomputes one day's rollup from the event log. The log is authoritative;
 * this exists so a failed incremental update self-heals rather than leaving
 * the cache permanently skewed.
 */
export async function rebuildDayRollup(uid: string, dayKey: string): Promise<DayRollup | null> {
  if (!uid || !dayKey) return null
  try {
    const snap = await getDocs(query(eventsCol(uid), where("dayKey", "==", dayKey)))
    const totals = { done: 0, uncompleted: 0, skipped: 0, minutesSpent: 0, quizCorrect: 0, quizTotal: 0 }
    for (const d of snap.docs) {
      const ev = d.data() as ProgressEvent
      const deltas = ROLLUP_DELTAS[ev.type] ?? {}
      for (const [field, delta] of Object.entries(deltas)) {
        totals[field as keyof typeof totals] += delta as number
      }
      if (ev.minutesSpent) totals.minutesSpent += ev.minutesSpent
      if (ev.quizScore) {
        totals.quizCorrect += ev.quizScore.correct
        totals.quizTotal += ev.quizScore.total
      }
    }
    const rollup = { dayKey, ...totals, updatedAt: Timestamp.now() }
    await setDoc(dayDoc(uid, dayKey), rollup)
    return rollup
  } catch (e) {
    console.warn("progress: rollup rebuild failed", e)
    return null
  }
}

export async function getDayRollup(uid: string, dayKey: string): Promise<DayRollup | null> {
  if (!uid) return null
  try {
    const snap = await getDoc(dayDoc(uid, dayKey))
    return snap.exists() ? ({ dayKey: snap.id, ...snap.data() } as DayRollup) : null
  } catch {
    return null
  }
}
