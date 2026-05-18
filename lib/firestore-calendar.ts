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
  Timestamp 
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

// Subscribe to real-time task updates
export const subscribeToTasks = (userId: string, callback: (tasks: CalendarTask[]) => void) => {
  const tasksRef = getUserTasksCollection(userId)
  const q = query(tasksRef, orderBy('date', 'asc'))
  
  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as CalendarTask))
    callback(tasks)
  })
}