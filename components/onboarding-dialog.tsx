// components/onboarding-dialog.tsx
"use client"

import { useEffect, useState } from "react"
import { Timestamp } from "firebase/firestore"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useProfileStore } from "@/lib/profile-store"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { Sparkles, Clock, Target, ArrowRight } from "lucide-react"
import { toast } from "@/components/ui/use-toast"

// Three-step welcome:
//   1. Pick interests so the AI has a starting point.
//   2. Set defaults (daily hours, preferred time of day).
//   3. Offer to jump straight into the chat to plan a first goal.
//
// Persistence: writes profile.onboardedAt so we never show this again, plus
// the captured defaults so the AI can pre-fill those fields automatically.

const INTERESTS = [
  "Programming", "Languages", "Music", "Fitness", "Cooking", "Reading",
  "Writing", "Design", "Photography", "Business", "Math", "Science",
]

export default function OnboardingDialog() {
  const { profile, loading, updateProfile } = useProfileStore()
  const { isAuthenticated } = useAuth()
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [dailyHours, setDailyHours] = useState<number>(2)
  const [preferredTime, setPreferredTime] = useState<"morning" | "afternoon" | "evening" | "any">("any")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (loading || !isAuthenticated) return
    // Open only if profile exists and has never been onboarded.
    if (profile && !profile.onboardedAt) {
      setOpen(true)
    }
  }, [profile, loading, isAuthenticated])

  const toggleInterest = (i: string) => {
    setSelectedInterests(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])
  }

  const finish = async (jumpToChat: boolean) => {
    setSaving(true)
    try {
      await updateProfile({
        onboardedAt: Timestamp.now(),
        defaultDailyHours: dailyHours,
        defaultPreferredTime: preferredTime,
        interests: selectedInterests,
      })
      setOpen(false)
      toast({ title: "You're all set", description: "Your defaults are saved." })
      if (jumpToChat) router.push("/dashboard")
    } catch (e) {
      toast({ title: "Couldn't save", description: (e as Error).message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) setOpen(false) }}>
      <DialogContent className="max-w-lg card-colorful">
        <DialogHeader>
          <DialogTitle className="text-purple-600 flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> Welcome to TaskFlow
          </DialogTitle>
          <DialogDescription>
            Three quick steps so the AI can plan around you, not the other way around.
          </DialogDescription>
        </DialogHeader>

        {step === 0 && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-700 font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-500" />
              What are you interested in learning? (pick any number)
            </p>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map(i => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleInterest(i)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    selectedInterests.includes(i)
                      ? "bg-purple-500 border-purple-500 text-white"
                      : "bg-white border-slate-200 text-slate-700 hover:border-purple-300"
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">You can change these any time in Settings.</p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-700 font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-500" />
              When do you usually have time to learn?
            </p>
            <div className="space-y-2">
              <Label>Hours per day</Label>
              <Input
                type="number"
                min={0.5}
                max={12}
                step={0.5}
                value={dailyHours}
                onChange={(e) => setDailyHours(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>Preferred time of day</Label>
              <Select value={preferredTime} onValueChange={(v: any) => setPreferredTime(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="afternoon">Afternoon</SelectItem>
                  <SelectItem value="evening">Evening</SelectItem>
                  <SelectItem value="any">No preference</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 py-2 text-center">
            <Sparkles className="h-8 w-8 text-purple-500 mx-auto" />
            <p className="text-sm text-slate-700">
              You're set up. The AI assistant on the dashboard will use these defaults — and ask follow-up questions when it needs more.
            </p>
            <p className="text-xs text-slate-500">
              Tip: just tell it what you want to learn ("I want to learn FastAPI in two weeks") and it will do the rest.
            </p>
          </div>
        )}

        <DialogFooter className="flex justify-between gap-2">
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={saving}>Back</Button>
          ) : <div />}
          {step < 2 && (
            <Button className="btn-purple" onClick={() => setStep(s => s + 1)}>
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === 2 && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => finish(false)} disabled={saving}>I'll explore first</Button>
              <Button className="btn-purple" onClick={() => finish(true)} disabled={saving}>
                Plan my first goal <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
