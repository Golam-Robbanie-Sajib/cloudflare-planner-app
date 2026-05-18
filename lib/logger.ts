// lib/logger.ts
//
// Tiny structured-logging wrapper. Two reasons it exists:
//   1. Every place we currently call `console.error("...", err)` becomes a
//      `logger.error("event-name", { err, context })` call. Structured output
//      is much easier to grep in Cloudflare Pages / Vercel log explorers.
//   2. If/when Sentry (or any error-tracking SDK) is added, it's a one-place
//      change — install @sentry/nextjs, capture inside logger.error.
//
// Keeping this dependency-free keeps the edge bundle small.

type Severity = "debug" | "info" | "warn" | "error"

interface LogPayload {
  event: string
  severity: Severity
  context?: Record<string, unknown>
  err?: unknown
  ts: string
}

function format(payload: LogPayload): string {
  const { ts, severity, event, context, err } = payload
  const errMsg = err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err
  return JSON.stringify({ ts, severity, event, context, err: errMsg })
}

function emit(severity: Severity, event: string, context?: Record<string, unknown>, err?: unknown) {
  const payload: LogPayload = { event, severity, context, err, ts: new Date().toISOString() }
  const line = format(payload)
  if (severity === "error") console.error(line)
  else if (severity === "warn") console.warn(line)
  else console.log(line)
  // Sentry hook: when @sentry/nextjs is installed, wire it here:
  //   if (severity === "error" && err) Sentry.captureException(err, { extra: { event, context } })
}

export const logger = {
  debug: (event: string, context?: Record<string, unknown>) => emit("debug", event, context),
  info: (event: string, context?: Record<string, unknown>) => emit("info", event, context),
  warn: (event: string, context?: Record<string, unknown>) => emit("warn", event, context),
  error: (event: string, err: unknown, context?: Record<string, unknown>) =>
    emit("error", event, context, err),
}
