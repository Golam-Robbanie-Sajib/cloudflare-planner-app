// lib/gcal-busy.ts
//
// Pull the user's Google Calendar primary events for a date window so the AI
// can avoid scheduling on top of them. Read-only — the existing OAuth scope
// already covers calendar.readonly via the calendar scope we request.

const GCAL_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

export interface ExternalBusySlot {
  date: string
  startTime: string
  endTime: string
  title: string
}

// Returns up to `maxResults` future events whose start has a dateTime (skipping
// all-day events, since they don't represent a busy block in the same sense).
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

  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(maxResults),
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
  })

  try {
    const response = await fetch(`${GCAL_EVENTS_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) return []
    const data = await response.json()
    const items = Array.isArray(data.items) ? data.items : []
    const out: ExternalBusySlot[] = []
    for (const ev of items) {
      const start: string | undefined = ev.start?.dateTime
      const end: string | undefined = ev.end?.dateTime
      if (!start || !end) continue
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
