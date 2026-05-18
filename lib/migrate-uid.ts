// lib/migrate-uid.ts
//
// One-time migration from email-keyed Firestore docs (legacy) to uid-keyed
// docs. Runs on every sign-in but no-ops once the uid subtree exists, so it's
// safe to leave in place.
//
// Why uid? Firebase Auth's UID is immutable per identity. Keying on email
// breaks the moment a user changes their primary Google email (or has their
// account merged). UID dodges that whole class of bugs.
//
// We copy three subtrees: tasks, goals, profile. publicPlans / publicProfiles
// store ownerEmail for now — those keep working unchanged because they don't
// live under /users/{userId}.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  type QueryDocumentSnapshot,
} from "firebase/firestore"
import { db } from "./firebase"

// Per-tab marker so we don't run the same migration twice in the same
// session. The "real" idempotency comes from checking existence in Firestore,
// but skipping the round-trip on subsequent renders is nice.
const migratedThisSession = new Set<string>()

export async function migrateEmailToUid(uid: string, email: string): Promise<void> {
  if (!uid || !email) return
  if (migratedThisSession.has(`${uid}|${email}`)) return
  migratedThisSession.add(`${uid}|${email}`)

  const uidRoot = doc(db, "users", uid)
  const emailRoot = doc(db, "users", email)

  // Fast bail-out: if the uid root has a profile doc already, the migration
  // is done (or was never needed).
  const uidProfile = await getDoc(doc(uidRoot, "profile", "main")).catch(() => null)
  if (uidProfile?.exists()) return

  // Fast bail-out the other way: if the email root has no profile and no
  // tasks, there's nothing to migrate. We use the profile probe + tasks size
  // as a cheap proxy.
  const emailProfileSnap = await getDoc(doc(emailRoot, "profile", "main")).catch(() => null)
  const emailTasksSnap = await getDocs(collection(emailRoot, "tasks")).catch(() => null)
  const emailGoalsSnap = await getDocs(collection(emailRoot, "goals")).catch(() => null)
  const hasLegacy =
    (emailProfileSnap?.exists() ?? false) ||
    (emailTasksSnap && !emailTasksSnap.empty) ||
    (emailGoalsSnap && !emailGoalsSnap.empty)
  if (!hasLegacy) return

  // Copy the profile doc.
  if (emailProfileSnap?.exists()) {
    await setDoc(doc(uidRoot, "profile", "main"), emailProfileSnap.data())
  }

  // Tasks and goals can be hundreds of docs each; use a batch but cap at
  // 450 ops/batch (Firestore's limit is 500, leaving headroom).
  const batchedCopy = async (docs: QueryDocumentSnapshot[], subcoll: "tasks" | "goals") => {
    let batch = writeBatch(db)
    let n = 0
    for (const d of docs) {
      batch.set(doc(uidRoot, subcoll, d.id), d.data())
      n++
      if (n >= 450) {
        await batch.commit()
        batch = writeBatch(db)
        n = 0
      }
    }
    if (n > 0) await batch.commit()
  }
  if (emailTasksSnap) await batchedCopy(emailTasksSnap.docs, "tasks")
  if (emailGoalsSnap) await batchedCopy(emailGoalsSnap.docs, "goals")

  // We intentionally DO NOT delete the email-keyed docs. Leaving them lets a
  // failed migration (e.g. network drop after copy of tasks but before goals)
  // be safely retried next sign-in. They're orphaned but harmless; a
  // server-side cleanup can prune them later.
}
