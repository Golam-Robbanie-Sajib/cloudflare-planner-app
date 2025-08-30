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

export interface CalendarTask {
  id: string
  title: string
  description: string
  date: string
  startTime: string
  endTime: string
  priority: "high" | "medium" | "low"
  type: "task" | "event"
  completed: boolean
  location?: string
  attendees?: number
  source: "user" | "ai" // Track if user-created or AI-generated
  synced: boolean // Track if synced to Google Calendar
  createdAt: Timestamp
  updatedAt: Timestamp
}

// Get user's tasks collection reference
const getUserTasksCollection = (userId: string) => {
  return collection(db, `users/${userId}/tasks`)
}

// Add a new task
export const addTask = async (userId: string, taskData: Omit<CalendarTask, 'id' | 'createdAt' | 'updatedAt'>) => {
  const tasksRef = getUserTasksCollection(userId)
  const now = Timestamp.now()
  
  const docRef = await addDoc(tasksRef, {
    ...taskData,
    createdAt: now,
    updatedAt: now
  })
  
  return docRef.id
}

// Update a task
export const updateTask = async (userId: string, taskId: string, updates: Partial<CalendarTask>) => {
  const taskRef = doc(db, `users/${userId}/tasks/${taskId}`)
  await updateDoc(taskRef, {
    ...updates,
    updatedAt: Timestamp.now()
  })
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