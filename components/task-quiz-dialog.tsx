// components/task-quiz-dialog.tsx
"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, Check, X, BookOpen } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useProfileStore } from "@/lib/profile-store"
import { appendProgressEvent } from "@/lib/firestore-progress"
import { todayDateString } from "@/lib/progress"
import { authedFetch } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { toast } from "@/components/ui/use-toast"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL

interface QuizQuestion {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskTitle: string
  taskDescription?: string
  goalTitle?: string
  /** Attribution for the logged quiz_taken event. */
  taskId?: string
  goalId?: string
  scheduledFor?: string
}

export default function TaskQuizDialog({
  open,
  onOpenChange,
  taskTitle,
  taskDescription,
  goalTitle,
  taskId,
  goalId,
  scheduledFor,
}: Props) {
  const { getAccessToken, signInWithGoogle, signOut, userInfo } = useAuth()
  const { profile } = useProfileStore()
  const auth = { getAccessToken, signInWithGoogle, signOut }
  const [loading, setLoading] = useState(false)
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [showResults, setShowResults] = useState(false)

  useEffect(() => {
    if (!open) {
      // Reset when closed so reopening on another task starts fresh.
      setQuestions(null)
      setAnswers([])
      setShowResults(false)
      return
    }
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const response = await authedFetch(
          `${API_BASE_URL}/generate-quiz`,
          { method: "POST", body: JSON.stringify({ taskTitle, taskDescription, goalTitle }) },
          auth,
        )
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err.detail || "Couldn't generate a quiz.")
        }
        const data: { questions: QuizQuestion[] } = await response.json()
        if (cancelled) return
        setQuestions(data.questions)
        setAnswers(new Array(data.questions.length).fill(null))
      } catch (e) {
        if (!cancelled) {
          toast({ title: "Quiz unavailable", description: (e as Error).message, variant: "destructive" })
          onOpenChange(false)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pick = (qi: number, oi: number) => {
    setAnswers(prev => prev.map((v, i) => (i === qi ? oi : v)))
  }

  const allAnswered = questions && answers.every(a => a !== null)
  const score = questions && showResults
    ? questions.reduce((acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0), 0)
    : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg card-colorful">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-purple-600">
            <BookOpen className="h-5 w-5" /> Quick check
          </DialogTitle>
          <DialogDescription>
            Three questions about what you just finished. Skip any time.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-10 flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
            <p className="text-xs text-slate-500">Writing your quiz…</p>
          </div>
        )}

        {!loading && questions && (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {questions.map((q, qi) => (
              <div key={qi} className="space-y-2">
                <p className="text-sm font-medium">{qi + 1}. {q.question}</p>
                <div className="grid gap-1.5">
                  {q.options.map((opt, oi) => {
                    const chosen = answers[qi] === oi
                    const correct = showResults && oi === q.correctIndex
                    const wrong = showResults && chosen && oi !== q.correctIndex
                    return (
                      <button
                        key={oi}
                        type="button"
                        disabled={showResults}
                        onClick={() => pick(qi, oi)}
                        className={cn(
                          "text-left text-sm px-3 py-2 rounded-md border transition-colors",
                          !showResults && chosen && "border-purple-400 bg-purple-50",
                          !showResults && !chosen && "border-slate-200 hover:border-purple-300",
                          correct && "border-green-400 bg-green-50",
                          wrong && "border-red-400 bg-red-50",
                        )}
                      >
                        <span className="font-medium mr-1 text-slate-400">{String.fromCharCode(65 + oi)}.</span>
                        {opt}
                        {correct && <Check className="h-4 w-4 text-green-600 inline ml-2" />}
                        {wrong && <X className="h-4 w-4 text-red-600 inline ml-2" />}
                      </button>
                    )
                  })}
                </div>
                {showResults && (
                  <p className="text-xs text-slate-500 italic px-1">{q.explanation}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          {!showResults && questions && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Skip</Button>
              <Button
                className="btn-purple"
                disabled={!allAnswered}
                onClick={() => {
                  setShowResults(true)
                  if (questions && userInfo?.uid) {
                    const correct = questions.reduce(
                      (acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0),
                      0,
                    )
                    void appendProgressEvent(userInfo.uid, {
                      type: "quiz_taken",
                      taskId,
                      goalId,
                      scheduledFor,
                      dayKey: todayDateString(profile?.timezone),
                      quizScore: { correct, total: questions.length },
                    })
                  }
                }}
              >
                See results
              </Button>
            </>
          )}
          {showResults && questions && (
            <>
              <p className="text-sm text-slate-600 mr-auto">Score: <span className="font-semibold">{score}/{questions.length}</span></p>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
