// app/plan/[slug]/plan-view.tsx
"use client"

// All UI lives in this client component. The sibling page.tsx is a server
// component that just sets `runtime = 'edge'` (required by Cloudflare Pages
// for every dynamic route) and renders this view.

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, ArrowRight, Loader2, Calendar as CalIcon } from "lucide-react"
import { getPublicPlan, type PublicPlan } from "@/lib/firestore-share"
import { format, parseISO } from "date-fns"

export default function PublicPlanView() {
  const params = useParams<{ slug: string }>()
  const [plan, setPlan] = useState<PublicPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!params?.slug) return
    let cancelled = false
    getPublicPlan(params.slug)
      .then(p => {
        if (cancelled) return
        if (!p) setNotFound(true)
        else setPlan(p)
      })
      .catch(() => { if (!cancelled) setNotFound(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [params?.slug])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
      </div>
    )
  }

  if (notFound || !plan) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-semibold">Plan not found</h1>
        <p className="text-sm text-slate-500 mt-2">This share link may have been revoked or never existed.</p>
        <Link href="/" className="mt-4">
          <Button className="btn-purple">Go to TaskFlow</Button>
        </Link>
      </div>
    )
  }

  const completed = plan.tasks.filter(t => t.completed).length

  // Group tasks by date so the UI mirrors the in-app plan dialog.
  const byDate = new Map<string, typeof plan.tasks>()
  for (const t of plan.tasks) {
    if (!byDate.has(t.date)) byDate.set(t.date, [])
    byDate.get(t.date)!.push(t)
  }
  const sortedDates = [...byDate.keys()].sort()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b bg-white dark:bg-slate-900">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">T</span>
            </div>
            <span className="font-bold text-purple-600">TaskFlow</span>
          </Link>
          <Link href="/">
            <Button size="sm" className="btn-purple">
              Plan your own <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <Card className="card-colorful">
          <CardHeader>
            <CardTitle className="text-purple-600 text-2xl">{plan.goalTitle}</CardTitle>
            <CardDescription>{plan.goalDescription || `A learning plan shared by ${plan.ownerName}.`}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="border-purple-300 text-purple-700">
                {plan.tasks.length} tasks
              </Badge>
              <Badge variant="outline" className="border-green-300 text-green-700">
                {completed} completed
              </Badge>
              <span className="text-xs text-slate-500">Shared by {plan.ownerName}</span>
            </div>
          </CardContent>
        </Card>

        {sortedDates.map(date => (
          <Card key={date} className="card-colorful">
            <CardHeader className="py-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalIcon className="h-4 w-4 text-purple-500" />
                {format(parseISO(date + "T00:00:00"), "EEEE, MMMM d")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {byDate.get(date)!.map((t, i) => (
                <div key={i} className={`p-3 rounded-md border bg-white dark:bg-slate-900 ${t.completed ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-2">
                    {t.completed && <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />}
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${t.completed ? "line-through" : ""}`}>{t.title}</p>
                      {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                      <p className="text-xs text-slate-500 mt-1">{t.startTime} – {t.endTime}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        <p className="text-center text-xs text-slate-400 pb-6">
          This is a read-only snapshot. Want to build your own plan? <Link href="/" className="text-purple-600 underline">Try TaskFlow</Link>.
        </p>
      </main>
    </div>
  )
}
