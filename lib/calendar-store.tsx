// frontend/lib/calendar-store.tsx
"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { useAuth } from "./auth-context"
import { 
  CalendarTask, 
  addTask as addTaskToFirestore, 
  updateTask as updateTaskInFirestore,
  deleteTask as deleteTaskFromFirestore,
  subscribeToTasks 
} from "./firestore-calendar"
import { Timestamp } from "firebase/firestore"

interface CalendarStore {
  tasks: CalendarTask[]
  loading: boolean
  addTask: (taskData: Omit<CalendarTask, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateTask: (id: string, updates: Partial<CalendarTask>) => Promise<void>
  toggleTask: (id: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  addAIGeneratedTasks: (tasks: any[]) => Promise<void>
}

const CalendarContext = createContext<CalendarStore | undefined>(undefined)

export function CalendarProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<CalendarTask[]>([])
  const [loading, setLoading] = useState(true)
  const { userInfo, isAuthenticated } = useAuth()

  // Subscribe to real-time updates when user is authenticated
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

  const addTask = async (taskData: Omit<CalendarTask, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!userInfo?.email) return
    
    await addTaskToFirestore(userInfo.email, {
      ...taskData,
      source: "user",
      synced: false
    })
  }

  const updateTask = async (id: string, updates: Partial<CalendarTask>) => {
    if (!userInfo?.email) return
    await updateTaskInFirestore(userInfo.email, id, updates)
  }

  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id)
    if (!task || !userInfo?.email) return
    
    await updateTaskInFirestore(userInfo.email, id, {
      completed: !task.completed
    })
  }

  const deleteTask = async (id: string) => {
    if (!userInfo?.email) return
    await deleteTaskFromFirestore(userInfo.email, id)
  }

  const addAIGeneratedTasks = async (aiTasks: any[]) => {
    if (!userInfo?.email) return

    for (const task of aiTasks) {
      await addTaskToFirestore(userInfo.email, {
        title: task.summary || task.title,
        description: task.description || "",
        date: task.startTime.split('T')[0],
        startTime: new Date(task.startTime).toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        endTime: new Date(task.endTime).toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        priority: "medium",
        type: "event",
        completed: false,
        source: "ai",
        synced: true // AI tasks are already synced to Google Calendar
      })
    }
  }

  return (
    <CalendarContext.Provider value={{
      tasks,
      loading,
      addTask,
      updateTask,
      toggleTask,
      deleteTask,
      addAIGeneratedTasks
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