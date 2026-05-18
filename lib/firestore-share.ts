// lib/firestore-share.ts
//
// Public, read-only plan snapshots. Stored under /publicPlans/{slug} so they
// can be read without auth (see firestore.rules). The slug is a short random
// id that's hard to guess — not a security boundary, just a low-friction
// share mechanism. Writes are restricted to the owner via rules.

import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore"
import { db } from "./firebase"

export interface PublicPlanTask {
  title: string
  description: string
  date: string
  startTime: string
  endTime: string
  completed: boolean
}

export interface PublicPlan {
  slug: string
  // Firebase Auth UID of the publishing user — must match request.auth.uid
  // for the rule to allow write. Kept distinct from ownerName / contact info.
  ownerUid: string
  ownerName: string
  goalTitle: string
  goalDescription: string
  tasks: PublicPlanTask[]
  createdAt: Timestamp
}

const PUBLIC_PLANS = "publicPlans"

// 11-char base36 — ~57 bits of entropy. Long enough that nobody guesses it,
// short enough to fit in a URL nicely.
export function newShareSlug(): string {
  const arr = new Uint8Array(8)
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(arr).map(b => b.toString(36)).join("").slice(0, 11)
}

export async function publishPlan(plan: Omit<PublicPlan, "createdAt">): Promise<void> {
  const ref = doc(db, PUBLIC_PLANS, plan.slug)
  await setDoc(ref, { ...plan, createdAt: Timestamp.now() })
}

export async function unpublishPlan(slug: string): Promise<void> {
  await deleteDoc(doc(db, PUBLIC_PLANS, slug))
}

export async function getPublicPlan(slug: string): Promise<PublicPlan | null> {
  const snap = await getDoc(doc(db, PUBLIC_PLANS, slug))
  if (!snap.exists()) return null
  return snap.data() as PublicPlan
}
