// lib/gcal-busy.ts
//
// Pull the user's Google Calendar events across ALL visible calendars (work,
// family, holidays, etc.) for a date window so the AI can avoid scheduling
// on top of them. Read-only — the existing OAuth scope (calendar) covers it.
//
// Strategy:
//   1. List the user's calendarList. Filter to calendars the user actually
//      sees in their Google Calendar UI (selected !== false) and where they
//      can read events (accessRole in reader/writer/owner/freeBusyReader).
//   2. Fetch events from each calendar in parallel with the same time window.
//   3. Merge, dedupe by (start, end, title), sort by start time, slice.
//
// Failures of individual calendars are non-fatal — we drop them and use
// whatever else returned. A complete network failure returns [].

const GCAL_BASE = "https://www.googleapis.com/calendar/v3"

export interface ExternalBusySlot {
  date: string
  startTime: string
  endTime: string
  title: string
}

interface CalendarListEntry {
  id: string
  summary?: string
  selected?: boolean
  accessRole?: string
  primary?: boolean
}

const READABLE_ROLES = new Set(["owner", "writer", "reader", "freeBusyReader"])

async function listVisibleCalendars(accessToken: string): Promise<CalendarListEntry[]> {
  try {
    const response = await fetch(`${GCAL_BASE}/users/me/calendarList?minAccessRole=freeBusyReader&showHidden=false`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) return []
    const data = await response.json()
    const items: CalendarListEntry[] = Array.isArray(data.items) ? data.items : []
    return items.filter((c) => {
      // selected defaults to true if not set; only false means user hid it
      if (c.selected === false) return false
      return c.accessRole ? READABLE_ROLES.has(c.accessRole) : true
    })
  } catch {
    return []
  }
}

async function fetchEventsForCalendar(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  maxResults: number,
): Promise<ExternalBusySlot[]> {
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(maxResults),
    timeMin,
    timeMax,
  })
  try {
    const response = await fetch(`${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) return []
    const data = await response.json()
    const items = Array.isArray(data.items) ? data.items : []
    const out: ExternalBusySlot[] = []
    for (const ev of items) {
      // Skip events the user has declined — those slots aren't really busy.
      const myAttendance = Array.isArray(ev.attendees)
        ? ev.attendees.find((a: { self?: boolean; responseStatus?: string }) => a.self)
        : null
      if (myAttendance?.responseStatus === "declined") continue
      // Skip "free" / transparent events (e.g. company holidays the user
      // doesn't actually take, OOO blocks marked as available).
      if (ev.transparency === "transparent") continue

      const start: string | undefined = ev.start?.dateTime
      const end: string | undefined = ev.end?.dateTime
      if (!start || !end) continue // skip all-day events
      const sd = new Date(start)
      const ed = new Date(end)
      if (Number.isNaN(sd.getTime()) || Number.isNaN(ed.getTime())) continue
      const date = `${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, "0")}-${String(sd.getDate()).padStart(2, "0")}`
      const fmt = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
      out.push({
        date,
        startTime: fmt(sd),
        endTime: fmt(ed),
        title: ev.summary || "(busy)",
      })
    }
    return out
  } catch {
    return []
  }
}

// Stable dedup key: same start, same end, same title. We don't use Google's
// event ids because the same event invited across calendars gets a different
// id per calendar — but the user only feels it as one busy block.
const dedupKey = (s: ExternalBusySlot) => `${s.date}T${s.startTime}-${s.endTime}|${s.title}`

export async function fetchGoogleBusySlots(
  accessToken: string,
  fromDate: Date,
  daysAhead: number,
  maxResults = 100,
): Promise<ExternalBusySlot[]> {
  const timeMin = new Date(fromDate)
  timeMin.setHours(0, 0, 0, 0)
  const timeMax = new Date(timeMin)
  timeMax.setDate(timeMin.getDate() + daysAhead)

  // 1. Find every calendar the user can read. If listing fails (rare —
  //    probably a token-scope issue), fall back to /primary so we still
  //    return SOMETHING useful.
  const calendars = await listVisibleCalendars(accessToken)
  const ids = calendars.length > 0 ? calendars.map((c) => c.id) : ["primary"]

  // 2. Pull events from each calendar in parallel. Give each calendar a
  //    generous per-calendar cap so a busy work calendar doesn't starve a
  //    holiday calendar of slots.
  const perCal = Math.max(20, Math.ceil(maxResults / Math.max(1, ids.length)))
  const minIso = timeMin.toISOString()
  const maxIso = timeMax.toISOString()
  const settled = await Promise.allSettled(
    ids.map((id) => fetchEventsForCalendar(accessToken, id, minIso, maxIso, perCal)),
  )

  // 3. Merge + dedupe + sort + clamp.
  const merged: ExternalBusySlot[] = []
  const seen = new Set<string>()
  for (const r of settled) {
    if (r.status !== "fulfilled") continue
    for (const slot of r.value) {
      const key = dedupKey(slot)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(slot)
    }
  }
  merged.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
  return merged.slice(0, maxResults)
}
