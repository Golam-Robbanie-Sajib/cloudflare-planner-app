//lib/calendar-store.tsx
"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { useAuth } from "./auth-context"
import {
  CalendarTask,
  SyncStatus,
  addTask as addTaskToFirestore,
  updateTask as updateTaskInFirestore,
  deleteTask as deleteTaskFromFirestore,
  subscribeToTasks,
} from "./firestore-calendar"
import { Timestamp } from "firebase/firestore"

export interface AIGeneratedTaskInput {
  summary: string
  description?: string | null
  startTime: string
  endTime: string
}

export interface AISyncResult {
  taskId: string
  googleEventId?: string
  googleEventLink?: string
  syncStatus: SyncStatus
}

interface CalendarStore {
  tasks: CalendarTask[]
  loading: boolean
  addTask: (taskData: Omit<CalendarTask, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string | null>
  updateTask: (id: string, updates: Partial<CalendarTask>) => Promise<void>
  toggleTask: (id: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  // Returns the IDs of the tasks just written so the caller can update their
  // sync status after talking to Google Calendar.
  addAIGeneratedTasks: (tasks: AIGeneratedTaskInput[], goalId?: string) => Promise<string[]>
  applySyncResults: (results: AISyncResult[]) => Promise<void>
}

const CalendarContext = createContext<CalendarStore | undefined>(undefined)

// Splits "HH:MM" + "YYYY-MM-DD" into a local Date — for ISO-time validation.
const parseIsoSafely = (iso: string): Date | null => {
  if (!iso || typeof iso !== "string") return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function CalendarProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<CalendarTask[]>([])
  const [loading, setLoading] = useState(true)
  const { userInfo, isAuthenticated } = useAuth()

  useEffect(() => {
    if (!isAuthenticated || !userInfo?.email) {
      setTasks([])
      setLoading(false)
      return
    }

    const userId = userInfo.email
    const unsubscribe = subscribeToTasks(userId, (updatedTasks) => {
      setTasks(updatedTasks)
      setLoading(false)
    })

    return unsubscribe
  }, [isAuthenticated, userInfo?.email])

  const addTask = async (taskData: Omit<CalendarTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<string | null> => {
    if (!userInfo?.email) return null
    const id = await addTaskToFirestore(userInfo.email, {
      ...taskData,
      source: taskData.source ?? "user",
      synced: taskData.synced ?? false,
    })
    return id
  }

  const updateTask = async (id: string, updates: Partial<CalendarTask>) => {
    if (!userInfo?.email) return
    await updateTaskInFirestore(userInfo.email, id, updates)
  }

  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id)
    if (!task || !userInfo?.email) return

    const nowDone = !task.completed
    await updateTaskInFirestore(userInfo.email, id, {
      completed: nowDone,
      completedAt: nowDone ? Timestamp.now() : null,
    })
  }

  const deleteTask = async (id: string) => {
    if (!userInfo?.email) return
    await deleteTaskFromFirestore(userInfo.email, id)
  }

  const addAIGeneratedTasks = async (aiTasks: AIGeneratedTaskInput[], goalId?: string): Promise<string[]> => {
    if (!userInfo?.email) return []

    const ids: string[] = []
    for (const task of aiTasks) {
      // Defensive: skip tasks the AI returned with unparseable times. The
      // backend already validates, but a corrupted record shouldn't poison
      // the whole batch.
      const start = parseIsoSafely(task.startTime)
      const end = parseIsoSafely(task.endTime)
      if (!start || !end || end <= start) continue

      const id = await addTaskToFirestore(userInfo.email, {
        title: task.summary,
        description: task.description || "",
        date: task.startTime.split('T')[0],
        startTime: start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        endTime: end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        priority: "medium",
        type: "event",
        completed: false,
        completedAt: null,
        source: "ai",
        synced: false,
        syncStatus: "pending",
        ...(goalId && { goalId }),
      })
      ids.push(id)
    }
    return ids
  }

  const applySyncResults = async (results: AISyncResult[]) => {
    if (!userInfo?.email) return
    await Promise.all(
      results.map((r) =>
        updateTaskInFirestore(userInfo.email!, r.taskId, {
          syncStatus: r.syncStatus,
          synced: r.syncStatus === "synced",
          ...(r.googleEventId && { googleEventId: r.googleEventId }),
          ...(r.googleEventLink && { googleEventLink: r.googleEventLink }),
        }),
      ),
    )
  }

  return (
    <CalendarContext.Provider value={{
      tasks,
      loading,
      addTask,
      updateTask,
      toggleTask,
      deleteTask,
      addAIGeneratedTasks,
      applySyncResults,
    }}>
      {children}
    </CalendarContext.Provider>
  )
}

export function useCalendarStore() {
  const context = useContext(CalendarContext)
  if (context === undefined) {
    throw new Error('useCalendarStore must be used within a CalendarProvider')
  }
  return context
}
