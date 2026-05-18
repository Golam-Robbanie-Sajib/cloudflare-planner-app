// lib/firestore-public-profile.ts
//
// Opt-in public profile snapshots used by the Friends/leaderboard feature.
// The slug is high-entropy (capability token, not a secret); anyone with the
// slug can read the public stats but only the owner can update/delete the
// document (enforced by firestore.rules).

import { doc, getDoc, setDoc, deleteDoc, Timestamp } from "firebase/firestore"
import { db } from "./firebase"

export interface PublicProfile {
  slug: string
  ownerEmail: string
  displayName: string
  picture?: string
  currentStreak: number
  bestStreak: number
  completedTasks: number
  totalTasks: number
  updatedAt: Timestamp
}

const COLLECTION = "publicProfiles"

export function newProfileSlug(): string {
  const arr = new Uint8Array(8)
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(arr).map(b => b.toString(36)).join("").slice(0, 11)
}

export async function publishProfile(p: Omit<PublicProfile, "updatedAt">): Promise<void> {
  await setDoc(doc(db, COLLECTION, p.slug), { ...p, updatedAt: Timestamp.now() })
}

export async function getProfileBySlug(slug: string): Promise<PublicProfile | null> {
  const snap = await getDoc(doc(db, COLLECTION, slug))
  if (!snap.exists()) return null
  return snap.data() as PublicProfile
}

export async function unpublishProfile(slug: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, slug))
}
