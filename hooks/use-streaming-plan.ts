// hooks/use-streaming-plan.ts
//
// Consumer for the /generate-plan-stream SSE endpoint. Exposes:
//   * narrative — the text streamed so far (grows as the AI writes)
//   * tasks     — the final structured task array (null until the stream
//                 completes successfully)
//   * isPending — true while the stream is live
//   * error     — last error message, or null
//   * start(payload) — kicks off a new generation
//
// We keep this orthogonal to TanStack Query's `useMutation` because mutations
// expect a single Promise — streams need incremental state updates.

"use client"

import { useCallback, useRef, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { authedFetch } from "@/lib/api-client"
import {
  BackendTaskSchema,
  GeneratePlanRequestSchema,
  type BackendTask,
  type GeneratePlanRequest,
} from "@/lib/schemas"
import { z } from "zod"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL

// SSE event payloads emitted by the backend.
const StreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("narrative"), delta: z.string() }),
  z.object({ type: z.literal("tasks"), tasks: z.array(BackendTaskSchema) }),
  z.object({ type: z.literal("error"), detail: z.string() }),
])

interface UseStreamingPlanReturn {
  narrative: string
  tasks: BackendTask[] | null
  isPending: boolean
  error: string | null
  start: (payload: GeneratePlanRequest) => Promise<{ narrative: string; tasks: BackendTask[] } | null>
  reset: () => void
}

export function useStreamingPlan(): UseStreamingPlanReturn {
  const { getAccessToken, signInWithGoogle, signOut } = useAuth()
  const auth = { getAccessToken, signInWithGoogle, signOut }

  const [narrative, setNarrative] = useState("")
  const [tasks, setTasks] = useState<BackendTask[] | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Aborter so a second start() call cancels the previous in-flight stream.
  const abortRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setNarrative("")
    setTasks(null)
    setIsPending(false)
    setError(null)
  }, [])

  const start = useCallback(async (payload: GeneratePlanRequest) => {
    // Validate before sending — same contract as the non-streaming hook.
    const parsed = GeneratePlanRequestSchema.parse(payload)
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setNarrative("")
    setTasks(null)
    setError(null)
    setIsPending(true)

    let localNarrative = ""
    let localTasks: BackendTask[] | null = null
    let localError: string | null = null

    try {
      const response = await authedFetch(
        `${API_BASE_URL}/generate-plan-stream`,
        { method: "POST", body: JSON.stringify(parsed), signal: ctrl.signal } as RequestInit,
        auth,
      )
      if (!response.ok || !response.body) {
        const errData = await response.json().catch(() => ({}))
        throw new Error((errData as { detail?: string })?.detail || `HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx: number
        // SSE frames are separated by "\n\n".
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          for (const line of frame.split("\n")) {
            const m = /^data:\s?(.*)$/.exec(line)
            if (!m) continue
            const dataLine = m[1]
            if (!dataLine) continue
            let event: z.infer<typeof StreamEventSchema>
            try {
              event = StreamEventSchema.parse(JSON.parse(dataLine))
            } catch {
              continue
            }
            if (event.type === "narrative") {
              localNarrative += event.delta
              setNarrative(localNarrative)
            } else if (event.type === "tasks") {
              localTasks = event.tasks
              setTasks(event.tasks)
            } else if (event.type === "error") {
              localError = event.detail
              setError(event.detail)
            }
          }
        }
      }

      setIsPending(false)
      if (localError && !localTasks) return null
      if (!localTasks) return null
      return { narrative: localNarrative, tasks: localTasks }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        // Caller cancelled — don't surface as error.
        setIsPending(false)
        return null
      }
      const msg = (e as Error).message || "Streaming failed."
      setError(msg)
      setIsPending(false)
      return null
    }
  }, [auth])

  return { narrative, tasks, isPending, error, start, reset }
}
