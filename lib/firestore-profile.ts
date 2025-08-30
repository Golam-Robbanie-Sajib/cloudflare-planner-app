// frontend/lib/firestore-profile.ts
import { doc, getDoc, setDoc, updateDoc, Timestamp } from "firebase/firestore"
import { db } from "./firebase"

export interface UserProfile {
  firstName: string
  lastName: string
  email: string
  phone?: string
  picture?: string
  timezone: string
  company?: string
  position?: string
  location?: string
  settings: {
    theme: "light" | "dark"
    notifications: boolean
    defaultCalendar: string
    autoSync: boolean
    syncFrequency: "hourly" | "daily" | "manual"
  }
  createdAt: Timestamp
  updatedAt: Timestamp
}

// Get user profile document reference
const getUserProfileDoc = (userId: string) => {
  return doc(db, `users/${userId}/profile/main`)
}

// Get user profile
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  const profileRef = getUserProfileDoc(userId)
  const snapshot = await getDoc(profileRef)
  
  if (snapshot.exists()) {
    return snapshot.data() as UserProfile
  }
  return null
}

// Create or update user profile
export const setUserProfile = async (userId: string, profileData: Omit<UserProfile, 'createdAt' | 'updatedAt'>) => {
  const profileRef = getUserProfileDoc(userId)
  const now = Timestamp.now()
  
  // Check if profile exists
  const existing = await getDoc(profileRef)
  
  if (existing.exists()) {
    // Update existing profile
    await updateDoc(profileRef, {
      ...profileData,
      updatedAt: now
    })
  } else {
    // Create new profile
    await setDoc(profileRef, {
      ...profileData,
      createdAt: now,
      updatedAt: now
    })
  }
}

// Update specific profile fields
export const updateUserProfile = async (userId: string, updates: Partial<UserProfile>) => {
  const profileRef = getUserProfileDoc(userId)
  await updateDoc(profileRef, {
    ...updates,
    updatedAt: Timestamp.now()
  })
}