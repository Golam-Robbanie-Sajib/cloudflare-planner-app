// lib/query-client.tsx
//
// One QueryClient for the entire app, with sane defaults:
//   * Mutations retry once on transient (5xx / network) errors but NOT on
//     4xx — Groq's rate-limit (429) is the most common transient cause
//     of failed mutations and exponential-backoff handles that nicely.
//   * Queries are kept short-lived (30s stale) because most of our reads
//     are public-plan / friend-profile snapshots that we expect to mostly
//     pull from cache during a session.

"use client"

import { ReactNode, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"

const isTransient = (err: unknown): boolean => {
  const msg = (err as Error)?.message?.toLowerCase() ?? ""
  if (msg.includes("rate") || msg.includes("429")) return true
  if (msg.includes("503") || msg.includes("502") || msg.includes("504")) return true
  if (msg.includes("network") || msg.includes("fetch")) return true
  return false
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, err) => failureCount < 2 && isTransient(err),
      },
      mutations: {
        // One retry on transient errors, with the built-in exponential delay.
        retry: (failureCount, err) => failureCount < 1 && isTransient(err),
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
    },
  })
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // Use lazy state so we get a stable instance even under React Fast Refresh.
  const [client] = useState(() => makeQueryClient())
  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === "development" ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  )
}
