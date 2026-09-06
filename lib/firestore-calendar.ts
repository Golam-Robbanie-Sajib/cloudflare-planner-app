//lib/firestore-calendar.ts
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where,
  Timestamp,
  type QueryConstraint,
} from "firebase/firestore"
import { db } from "./firebase"

export type SyncStatus = "pending" | "synced" | "failed"

export interface TaskResource {
  title: string
  url?: string
  type: "article" | "video" | "course" | "book" | "docs" | "tool" | "other"
}

export interface CalendarTask {
  id: string
  title: string
  description: string
  date: string
  startTime: string
  endTime: string
  goalId?: string
  priority: "high" | "medium" | "low"
  type: "task" | "event"
  completed: boolean
  completedAt?: Timestamp | null
  // Explicitly set aside by the user — NOT a failure. Way of Life's
  // Yes/No/Skip model: a skipped day is neutral, so it neither breaks a
  // streak nor decays the goal's progression level. Without this, "I was
  // ill on Tuesday" is indistinguishable from "I blew it off".
  skipped?: boolean
  skippedAt?: Timestamp | null
  location?: string
  attendees?: number
  source: "user" | "ai"
  // Legacy boolean kept for back-compat with existing docs in Firestore.
  synced: boolean
  // syncStatus is the new source of truth for Google Calendar sync state.
  // "pending" = not yet attempted, "synced" = successfully written to GCal,
  // "failed" = attempted and Google rejected; user can retry.
  syncStatus?: SyncStatus
  googleEventId?: string
  googleEventLink?: string
  resources?: TaskResource[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

// Get user's tasks collection reference
const getUserTasksCollection = (userId: string) => {
  return collection(db, `users/${userId}/tasks`)
}

// Firestore rejects `undefined` values, but optional fields on CalendarTask
// can easily be undefined when callers spread partial objects. Strip them
// before every write.
const stripUndefined = <T extends Record<string, any>>(obj: T): T => {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v
  }
  return out as T
}

// Add a new task
export const addTask = async (userId: string, taskData: Omit<CalendarTask, 'id' | 'createdAt' | 'updatedAt'>) => {
  const tasksRef = getUserTasksCollection(userId)
  const now = Timestamp.now()

  const docRef = await addDoc(tasksRef, stripUndefined({
    ...taskData,
    createdAt: now,
    updatedAt: now,
  }))

  return docRef.id
}

// Update a task
export const updateTask = async (userId: string, taskId: string, updates: Partial<CalendarTask>) => {
  const taskRef = doc(db, `users/${userId}/tasks/${taskId}`)
  await updateDoc(taskRef, stripUndefined({
    ...updates,
    updatedAt: Timestamp.now(),
  }))
}

// Delete a task
export const deleteTask = async (userId: string, taskId: string) => {
  const taskRef = doc(db, `users/${userId}/tasks/${taskId}`)
  await deleteDoc(taskRef)
}

// Get all tasks (one-time read)
export const getTasks = async (userId: string): Promise<CalendarTask[]> => {
  const tasksRef = getUserTasksCollection(userId)
  const q = query(tasksRef, orderBy('date', 'asc'))
  const snapshot = await getDocs(q)
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as CalendarTask))
}

// Subscribe to real-time task updates within a sliding window. Defaults to
// 60 days back / 90 days forward, which covers everything the UI shows
// (Today widget, 14-day calendar grid, /events past tab, /goals progress
// chart) without subscribing to every task the user has ever created.
//
// `windowDaysBack` / `windowDaysAhead` can be tuned by callers that need
// more. Pass null for either side to disable that bound (e.g. an export
// flow that needs the full history).
export const subscribeToTasks = (
  userId: string,
  callback: (tasks: CalendarTask[]) => void,
  opts: { windowDaysBack?: number | null; windowDaysAhead?: number | null } = {},
) => {
  const tasksRef = getUserTasksCollection(userId)
  const { windowDaysBack = 60, windowDaysAhead = 90 } = opts

  const toDayKey = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }

  const constraints: QueryConstraint[] = [orderBy("date", "asc")]
  if (windowDaysBack != null) {
    const past = new Date()
    past.setDate(past.getDate() - windowDaysBack)
    constraints.unshift(where("date", ">=", toDayKey(past)))
  }
  if (windowDaysAhead != null) {
    const future = new Date()
    future.setDate(future.getDate() + windowDaysAhead)
    constraints.push(where("date", "<=", toDayKey(future)))
  }

  const q = query(tasksRef, ...constraints)

  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as CalendarTask))
    callback(tasks)
  })
}