// app/friends/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Share2, Plus, X, Flame, Trophy, RefreshCw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { useProfileStore } from "@/lib/profile-store"
import { useCalendarStore } from "@/lib/calendar-store"
import { computeProgress } from "@/lib/progress"
import {
  PublicProfile,
  getProfileBySlug,
  newProfileSlug,
  publishProfile,
  unpublishProfile,
} from "@/lib/firestore-public-profile"

export default function FriendsPage() {
  const { isAuthenticated, userInfo } = useAuth()
  const { profile, updateProfile } = useProfileStore()
  const { tasks } = useCalendarStore()

  const myStats = useMemo(() => computeProgress(tasks), [tasks])
  const [friendInput, setFriendInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [friends, setFriends] = useState<PublicProfile[]>([])

  // Re-fetch each friend's public profile snapshot so the leaderboard reflects
  // their latest stats, not the values cached when they were first added.
  const refreshFriends = async (slugs: string[]) => {
    if (!slugs.length) {
      setFriends([])
      return
    }
    setLoading(true)
    try {
      const results = await Promise.all(slugs.map(s => getProfileBySlug(s)))
      setFriends(results.filter((p): p is PublicProfile => !!p))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshFriends(profile?.friendSlugs ?? [])
  }, [profile?.friendSlugs?.join("|")])

  // Publishes (or refreshes) the user's own public profile and copies the
  // share slug. Idempotent — reuses the existing slug if there is one.
  const publishMine = async () => {
    if (!userInfo?.email || !profile) return
    setLoading(true)
    try {
      const slug = profile.publicProfileSlug || newProfileSlug()
      await publishProfile({
        slug,
        ownerUid: userInfo.uid,
        displayName: userInfo.name,
        picture: userInfo.picture,
        currentStreak: myStats.currentStreak,
        bestStreak: myStats.bestStreak,
        completedTasks: myStats.totalCompleted,
        totalTasks: myStats.totalTasks,
      })
      if (slug !== profile.publicProfileSlug) {
        await updateProfile({ publicProfileSlug: slug })
      }
      try {
        await navigator.clipboard.writeText(slug)
        toast({ title: "Public stats published", description: `Slug copied: ${slug}` })
      } catch {
        toast({ title: "Public stats published", description: `Slug: ${slug}` })
      }
    } catch (e) {
      toast({ title: "Couldn't publish", description: (e as Error).message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const unpublishMine = async () => {
    if (!profile?.publicProfileSlug) return
    setLoading(true)
    try {
      await unpublishProfile(profile.publicProfileSlug)
      await updateProfile({ publicProfileSlug: undefined as any })
      toast({ title: "Public stats removed" })
    } catch (e) {
      toast({ title: "Couldn't unpublish", description: (e as Error).message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const addFriend = async () => {
    const slug = friendInput.trim()
    if (!slug) return
    if (slug === profile?.publicProfileSlug) {
      toast({ title: "That's your own slug", variant: "destructive" })
      return
    }
    if ((profile?.friendSlugs ?? []).includes(slug)) {
      toast({ title: "Already added" })
      setFriendInput("")
      return
    }
    setLoading(true)
    try {
      const p = await getProfileBySlug(slug)
      if (!p) throw new Error("No profile found for that slug.")
      const next = [...(profile?.friendSlugs ?? []), slug]
      await updateProfile({ friendSlugs: next })
      setFriendInput("")
      toast({ title: `Added ${p.displayName}` })
    } catch (e) {
      toast({ title: "Couldn't add", description: (e as Error).message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const removeFriend = async (slug: string) => {
    if (!profile) return
    const next = (profile.friendSlugs ?? []).filter(s => s !== slug)
    await updateProfile({ friendSlugs: next })
  }

  // Build the leaderboard from the friends + the user themself.
  const leaderboard = useMemo(() => {
    const me = userInfo ? {
      slug: profile?.publicProfileSlug ?? "_me",
      ownerUid: userInfo.uid,
      displayName: userInfo.name + " (you)",
      picture: userInfo.picture,
      currentStreak: myStats.currentStreak,
      bestStreak: myStats.bestStreak,
      completedTasks: myStats.totalCompleted,
      totalTasks: myStats.totalTasks,
      updatedAt: null as any,
    } : null
    const all = [...friends, ...(me ? [me] : [])]
    return all.sort((a, b) => b.currentStreak - a.currentStreak || b.completedTasks - a.completedTasks)
  }, [friends, profile?.publicProfileSlug, myStats, userInfo])

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        Sign in to use Friends.
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 bg-slate-50 dark:bg-slate-950">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard">
          <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Friends & Leaderboard</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="card-colorful">
          <CardHeader>
            <CardTitle className="text-purple-600 flex items-center gap-2"><Share2 className="h-5 w-5" />Your share slug</CardTitle>
            <CardDescription>Publish a snapshot of your streak and completion stats. Friends paste this slug to add you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {profile?.publicProfileSlug ? (
              <>
                <div className="font-mono text-sm bg-slate-100 dark:bg-slate-800 p-2 rounded-md break-all">
                  {profile.publicProfileSlug}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={publishMine} disabled={loading}>
                    {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    Refresh stats
                  </Button>
                  <Button size="sm" variant="outline" onClick={unpublishMine} disabled={loading}>Unpublish</Button>
                </div>
              </>
            ) : (
              <Button onClick={publishMine} disabled={loading} className="btn-purple w-full">
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Share2 className="h-4 w-4 mr-1" />}
                Publish my stats
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="card-colorful">
          <CardHeader>
            <CardTitle className="text-purple-600 flex items-center gap-2"><Plus className="h-5 w-5" />Add a friend</CardTitle>
            <CardDescription>Paste a friend's slug to follow their progress.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="abc123xyz98"
                value={friendInput}
                onChange={(e) => setFriendInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addFriend() }}
              />
              <Button onClick={addFriend} disabled={loading || !friendInput.trim()}>Add</Button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Tip: ask a friend to publish their stats on their Friends page, then send you their slug.
            </p>
          </CardContent>
        </Card>

        <Card className="card-colorful">
          <CardHeader>
            <CardTitle className="text-purple-600 flex items-center gap-2"><Trophy className="h-5 w-5" />Leaderboard</CardTitle>
            <CardDescription>Sorted by current streak.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {leaderboard.length === 0 ? (
              <p className="text-sm text-slate-500">Add friends to see a leaderboard.</p>
            ) : leaderboard.map((p, i) => {
              const isMe = p.ownerUid === userInfo?.uid
              return (
                <div key={p.slug} className="flex items-center gap-3 p-2 rounded-md border bg-white dark:bg-slate-900">
                  <span className="text-sm font-bold text-slate-500 w-5 text-center">{i + 1}</span>
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={p.picture} alt={p.displayName} />
                    <AvatarFallback className="text-xs">{p.displayName?.split(" ").map(n => n[0]).join("").toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.displayName}</p>
                    <p className="text-xs text-slate-500">{p.completedTasks} tasks completed</p>
                  </div>
                  <Badge variant="outline" className="border-orange-300 text-orange-700">
                    <Flame className="h-3 w-3 mr-1" />{p.currentStreak}
                  </Badge>
                  {!isMe && profile?.friendSlugs?.includes(p.slug) && (
                    <Button variant="ghost" size="sm" onClick={() => removeFriend(p.slug)} title="Unfollow">
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
