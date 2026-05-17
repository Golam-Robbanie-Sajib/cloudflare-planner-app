// lib/notifications.ts
//
// Lightweight browser-only notifications for upcoming tasks. Polls the user's
// task list every minute and fires a Notification for any task starting in
// the next 5 minutes that we haven't notified about yet.
//
// We deliberately do NOT use a service worker / Web Push here. Service-worker
// push needs a backend signing key and per-user subscription tracking; in-tab
// Notifications cover the "the user is using the app" case for free, and the
// missing case (app closed) is what a future server-cron + email/SMS will solve.

import type { CalendarTask } from "./firestore-calendar"

const STORAGE_KEY = "tf:notified-task-ids"
// We keep the notified-id set bounded; with hundreds of tasks per user this
// would otherwise grow forever.
const MAX_TRACKED = 500
const LEAD_TIME_MIN = 5

export type PermissionState = "default" | "granted" | "denied" | "unsupported"

export function getPermissionState(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported"
  return Notification.permission as PermissionState
}

export async function requestPermission(): Promise<PermissionState> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported"
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission as PermissionState
  }
  const result = await Notification.requestPermission()
  return result as PermissionState
}

const loadNotified = (): Set<string> => {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

const saveNotified = (ids: Set<string>) => {
  try {
    const arr = [...ids]
    const trimmed = arr.length > MAX_TRACKED ? arr.slice(arr.length - MAX_TRACKED) : arr
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    /* ignore quota errors */
  }
}

// "HH:MM" in 24h → minutes since midnight.
const minsSinceMidnight = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map((v) => parseInt(v, 10))
  if (Number.isNaN(h) || Number.isNaN(m)) return -1
  return h * 60 + m
}

export function checkAndFireNotifications(tasks: CalendarTask[]): void {
  if (typeof window === "undefined" || !("Notification" in window)) return
  if (Notification.permission !== "granted") return

  const now = new Date()
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const notified = loadNotified()
  let changed = false

  for (const t of tasks) {
    if (t.date !== todayKey) continue
    if (t.completed) continue
    if (notified.has(t.id)) continue
    const startMins = minsSinceMidnight(t.startTime)
    if (startMins < 0) continue
    const lead = startMins - nowMins
    // Fire when the task starts within the lead window (and hasn't started
    // more than 1 minute ago — we don't want to spam the user about past
    // tasks if they just opened the app).
    if (lead <= LEAD_TIME_MIN && lead >= -1) {
      try {
        new Notification(t.title, {
          body: lead <= 0
            ? `Starting now — ${t.startTime}–${t.endTime}`
            : `In ${lead} min — ${t.startTime}–${t.endTime}`,
          tag: t.id,
          icon: "/placeholder-logo.png",
        })
        notified.add(t.id)
        changed = true
      } catch {
        /* fail silently — some browsers block constructor outside user gestures */
      }
    }
  }

  if (changed) saveNotified(notified)
}
