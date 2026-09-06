// components/focus-timer.tsx
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Play, Pause, RotateCcw, Check, X } from "lucide-react"
import { useCalendarStore } from "@/lib/calendar-store"
import { useAuth } from "@/lib/auth-context"
import { useProfileStore } from "@/lib/profile-store"
import { appendProgressEvent } from "@/lib/firestore-progress"
import { todayDateString } from "@/lib/progress"
import { toast } from "@/components/ui/use-toast"
import type { CalendarTask } from "@/lib/firestore-calendar"

interface Props {
  task: CalendarTask | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

// "HH:MM" - "HH:MM" → seconds, clamped to >= 60.
function durationFromTask(t: CalendarTask): number {
  const [sh, sm] = t.startTime.split(":").map(n => parseInt(n, 10))
  const [eh, em] = t.endTime.split(":").map(n => parseInt(n, 10))
  if ([sh, sm, eh, em].some(Number.isNaN)) return 25 * 60 // sane default
  const seconds = ((eh * 60 + em) - (sh * 60 + sm)) * 60
  return seconds > 60 ? seconds : 25 * 60
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
}

export default function FocusTimer({ task, open, onOpenChange }: Props) {
  const { toggleTask } = useCalendarStore()
  const { userInfo } = useAuth()
  const { profile } = useProfileStore()
  const initialRef = useRef(0)
  const [remaining, setRemaining] = useState(0)
  const [running, setRunning] = useState(false)
  // Seconds actually elapsed with the timer running. Previously the whole
  // session was discarded on unmount, so real effort was never recorded and
  // "hours remaining" could only ever be estimated from scheduled ranges.
  const elapsedRef = useRef(0)
  const loggedRef = useRef(false)

  // Persist the session once, on close, if any meaningful time was spent.
  const flushFocusSession = useCallback(() => {
    const minutes = Math.round(elapsedRef.current / 60)
    if (loggedRef.current || minutes < 1 || !userInfo?.uid) return
    loggedRef.current = true
    void appendProgressEvent(userInfo.uid, {
      type: "focus_session",
      taskId: task?.id,
      goalId: task?.goalId,
      scheduledFor: task?.date,
      dayKey: todayDateString(profile?.timezone),
      minutesSpent: minutes,
    })
  }, [task?.id, task?.goalId, task?.date, userInfo?.uid, profile?.timezone])

  // Reset countdown whenever a new task is opened.
  useEffect(() => {
    if (!task || !open) return
    const d = durationFromTask(task)
    initialRef.current = d
    setRemaining(d)
    elapsedRef.current = 0
    loggedRef.current = false
    setRunning(true)
  }, [task, open])

  // Tick.
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      elapsedRef.current += 1
      setRemaining(prev => {
        if (prev <= 1) {
          window.clearInterval(id)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [running])

  // When we hit zero, beep + offer to mark done.
  useEffect(() => {
    if (remaining !== 0 || !running) return
    setRunning(false)
    try {
      // Tiny WebAudio beep — silent if the context can't be created.
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      if (Ctx) {
        const ctx = new Ctx()
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.frequency.value = 660
        o.connect(g)
        g.connect(ctx.destination)
        g.gain.setValueAtTime(0.1, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)
        o.start()
        o.stop(ctx.currentTime + 0.6)
      }
    } catch { /* noop */ }
    toast({ title: "Time's up", description: task ? `"${task.title}" — mark it done?` : "Session complete." })
  }, [remaining, running, task])

  const pct = initialRef.current > 0 ? 1 - remaining / initialRef.current : 0
  const reset = () => {
    if (!task) return
    setRemaining(initialRef.current)
    setRunning(false)
  }
  const markDoneAndClose = async () => {
    flushFocusSession()
    if (task && !task.completed) await toggleTask(task.id)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Record the session on any close path — X, Escape, backdrop click —
        // not just the explicit "Mark done" button.
        if (!next) flushFocusSession()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-sm card-colorful">
        <DialogHeader>
          <DialogTitle>{task?.title ?? "Focus"}</DialogTitle>
          <DialogDescription>
            {task ? `${task.startTime} – ${task.endTime}` : "Stay on task."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-4 select-none">
          <svg width="180" height="180" viewBox="0 0 180 180" className="-rotate-90">
            <circle cx="90" cy="90" r="78" stroke="hsl(var(--muted))" strokeWidth="10" fill="none" />
            <circle
              cx="90"
              cy="90"
              r="78"
              stroke="hsl(var(--purple))"
              strokeWidth="10"
              fill="none"
              strokeDasharray={2 * Math.PI * 78}
              strokeDashoffset={(1 - pct) * 2 * Math.PI * 78}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <div className="-mt-[120px] text-3xl font-bold tabular-nums text-slate-800">
            {fmt(remaining)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {running ? "Running" : remaining === 0 ? "Done" : "Paused"}
          </div>
        </div>

        <div className="flex justify-center gap-2 pb-2 flex-wrap">
          {running ? (
            <Button variant="outline" size="sm" onClick={() => setRunning(false)}>
              <Pause className="h-4 w-4 mr-1" /> Pause
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setRunning(true)} disabled={remaining === 0}>
              <Play className="h-4 w-4 mr-1" /> Resume
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reset
          </Button>
          <Button size="sm" className="btn-purple" onClick={markDoneAndClose}>
            <Check className="h-4 w-4 mr-1" /> Mark done
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-1" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
