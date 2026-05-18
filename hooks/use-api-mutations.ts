// hooks/use-api-mutations.ts
//
// TanStack Query mutation hooks for every Hono edge endpoint. Centralizing
// these here means:
//   * Loading / error / success state is structured (no more parallel useState
//     flags scattered across the page components).
//   * The retry policy in lib/query-client.tsx handles transient Groq 429s
//     and edge 5xxs automatically.
//   * Each mutation parses the response with its Zod schema, so a backend
//     drift surfaces immediately as a runtime error instead of an
//     "undefined.foo" crash three components deep.
//
// Auth + retry-on-401 is delegated to lib/api-client.ts so these hooks stay
// focused on the request shape.

"use client"

import { useMutation } from "@tanstack/react-query"
import { useAuth } from "@/lib/auth-context"
import { authedFetch } from "@/lib/api-client"
import {
  ChatMessageRequestSchema,
  ChatMessageResponseSchema,
  GeneratePlanRequestSchema,
  GeneratePlanResponseSchema,
  IntegratePlanRequestSchema,
  IntegratePlanResponseSchema,
  QuizRequestSchema,
  QuizResponseSchema,
  RescheduleRequestSchema,
  RescheduleResponseSchema,
  type ChatMessageRequest,
  type ChatMessageResponse,
  type GeneratePlanRequest,
  type GeneratePlanResponse,
  type IntegratePlanRequest,
  type IntegratePlanResponse,
  type QuizRequest,
  type QuizResponse,
  type RescheduleRequest,
} from "@/lib/schemas"
import type { z } from "zod"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL

interface AuthHandles {
  getAccessToken: () => string | null
  signInWithGoogle: () => Promise<string | null>
  signOut: () => void
}

async function postJson<TSchema extends z.ZodTypeAny>(
  path: string,
  body: unknown,
  responseSchema: TSchema,
  auth: AuthHandles,
): Promise<z.infer<TSchema>> {
  const response = await authedFetch(
    `${API_BASE_URL}${path}`,
    { method: "POST", body: JSON.stringify(body) },
    auth,
  )
  // Reading json() once is important — both error and success paths share it.
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error((data as { detail?: string })?.detail || `HTTP ${response.status}`)
  }
  const parsed = responseSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error(`Unexpected response shape from ${path}: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`)
  }
  return parsed.data as z.infer<TSchema>
}

function useAuthHandles(): AuthHandles {
  const { getAccessToken, signInWithGoogle, signOut } = useAuth()
  return { getAccessToken, signInWithGoogle, signOut }
}

// Stable mutation keys — useful for `isMutating(key)` checks or invalidation.
export const mutationKeys = {
  chatMessage: ["chat-message"] as const,
  generatePlan: ["generate-plan"] as const,
  integratePlan: ["integrate-plan"] as const,
  reschedule: ["reschedule-event"] as const,
  quiz: ["generate-quiz"] as const,
}

export function useChatMessage() {
  const auth = useAuthHandles()
  return useMutation<ChatMessageResponse, Error, ChatMessageRequest>({
    mutationKey: mutationKeys.chatMessage,
    mutationFn: async (body) => {
      // The request schema's defaults (`chatHistory: []`) only apply to .parse
      // on incoming data; for outgoing, validate explicitly so we don't ship
      // bad payloads to the server.
      const validated = ChatMessageRequestSchema.parse(body)
      return postJson("/chat-message", validated, ChatMessageResponseSchema, auth)
    },
  })
}

export function useGeneratePlan() {
  const auth = useAuthHandles()
  return useMutation<GeneratePlanResponse, Error, GeneratePlanRequest>({
    mutationKey: mutationKeys.generatePlan,
    mutationFn: async (body) => {
      const validated = GeneratePlanRequestSchema.parse(body)
      return postJson("/generate-plan", validated, GeneratePlanResponseSchema, auth)
    },
  })
}

export function useIntegratePlan() {
  const auth = useAuthHandles()
  return useMutation<IntegratePlanResponse, Error, IntegratePlanRequest>({
    mutationKey: mutationKeys.integratePlan,
    mutationFn: async (body) => {
      const validated = IntegratePlanRequestSchema.parse(body)
      return postJson("/integrate-plan", validated, IntegratePlanResponseSchema, auth)
    },
  })
}

export function useRescheduleEvent() {
  const auth = useAuthHandles()
  return useMutation<z.infer<typeof RescheduleResponseSchema>, Error, RescheduleRequest>({
    mutationKey: mutationKeys.reschedule,
    mutationFn: async (body) => {
      const validated = RescheduleRequestSchema.parse(body)
      return postJson("/reschedule-event", validated, RescheduleResponseSchema, auth)
    },
  })
}

export function useGenerateQuiz() {
  const auth = useAuthHandles()
  return useMutation<QuizResponse, Error, QuizRequest>({
    mutationKey: mutationKeys.quiz,
    mutationFn: async (body) => {
      const validated = QuizRequestSchema.parse(body)
      return postJson("/generate-quiz", validated, QuizResponseSchema, auth)
    },
  })
}
