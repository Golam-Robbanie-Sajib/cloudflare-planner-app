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
import { updateGoal as updateGoalInFirestore } from "./firestore-goals"
import { appendProgressEvent } from "./firestore-progress"
import { useProfileStore } from "./profile-store"
import { todayDateString } from "./progress"
import { Timestamp } from "firebase/firestore"

export interface AIGeneratedTaskInput {
  summary: string
  description?: string | null
  startTime: string
  endTime: string
  resources?: {
    title: string
    url?: string
    type: "article" | "video" | "course" | "book" | "docs" | "tool" | "other"
  }[]
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
  // ProfileProvider wraps CalendarProvider in app/layout.tsx, so this is safe.
  // Used purely to resolve day keys in the user's own timezone.
  const { profile } = useProfileStore()
  const { userInfo, isAuthenticated } = useAuth()

  useEffect(() => {
    if (!isAuthenticated || !userInfo?.uid) {
      setTasks([])
      setLoading(false)
      return
    }

    const userId = userInfo.uid
    const unsubscribe = subscribeToTasks(userId, (updatedTasks) => {
      setTasks(updatedTasks)
      setLoading(false)
    })

    return unsubscribe
  }, [isAuthenticated, userInfo?.uid])

  const addTask = async (taskData: Omit<CalendarTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<string | null> => {
    if (!userInfo?.uid) return null
    const id = await addTaskToFirestore(userInfo.uid, {
      ...taskData,
      source: taskData.source ?? "user",
      synced: taskData.synced ?? false,
    })
    return id
  }

  const updateTask = async (id: string, updates: Partial<CalendarTask>) => {
    if (!userInfo?.uid) return
    await updateTaskInFirestore(userInfo.uid, id, updates)
  }

  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id)
    if (!task || !userInfo?.uid) return

    const nowDone = !task.completed
    await updateTaskInFirestore(userInfo.uid, id, {
      completed: nowDone,
      completedAt: nowDone ? Timestamp.now() : null,
    })

    // Append to the immutable log. Un-completing nulls `completedAt` on the
    // task doc, so without this the evidence that the work ever happened is
    // destroyed and week-over-week comparisons become impossible.
    void appendProgressEvent(userInfo.uid, {
      type: nowDone ? "task_completed" : "task_uncompleted",
      taskId: id,
      goalId: task.goalId,
      scheduledFor: task.date,
      dayKey: todayDateString(profile?.timezone),
    })

    // Roll the parent goal's status forward/back. Without this a goal whose
    // tasks are all finished stays "in_progress" forever — status was only
    // ever set by hand.
    if (task.goalId) {
      const siblings = tasks.filter(t => t.goalId === task.goalId)
      const remaining = siblings.filter(t => (t.id === id ? !nowDone : !t.completed)).length
      try {
        if (remaining === 0) {
          await updateGoalInFirestore(userInfo.uid, task.goalId, { status: "completed" })
        } else if (nowDone === false) {
          // Un-checking a task on a finished goal reopens it.
          await updateGoalInFirestore(userInfo.uid, task.goalId, { status: "in_progress" })
        }
      } catch (e) {
        // Non-fatal: the task toggle already succeeded, and goal status is
        // derived state we can recompute. Don't fail the user's click.
        console.warn("Could not roll up goal status", e)
      }
    }
  }

  const deleteTask = async (id: string) => {
    if (!userInfo?.uid) return
    await deleteTaskFromFirestore(userInfo.uid, id)
  }

  const addAIGeneratedTasks = async (aiTasks: AIGeneratedTaskInput[], goalId?: string): Promise<string[]> => {
    if (!userInfo?.uid) return []

    const ids: string[] = []
    for (const task of aiTasks) {
      // Defensive: skip tasks the AI returned with unparseable times. The
      // backend already validates, but a corrupted record shouldn't poison
      // the whole batch.
      const start = parseIsoSafely(task.startTime)
      const end = parseIsoSafely(task.endTime)
      if (!start || !end || end <= start) continue

      const id = await addTaskToFirestore(userInfo.uid, {
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
        ...(task.resources && task.resources.length ? { resources: task.resources } : {}),
      })
      ids.push(id)
    }
    return ids
  }

  const applySyncResults = async (results: AISyncResult[]) => {
    if (!userInfo?.uid) return
    await Promise.all(
      results.map((r) =>
        updateTaskInFirestore(userInfo.uid!, r.taskId, {
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
