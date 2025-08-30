// frontend/lib/profile-store.tsx
"use client"
import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { useAuth } from "./auth-context"
import { UserProfile, getUserProfile, setUserProfile, updateUserProfile } from "./firestore-profile"

interface ProfileStore {
  profile: UserProfile | null
  loading: boolean
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>
}

const ProfileContext = createContext<ProfileStore | undefined>(undefined)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const { userInfo, isAuthenticated } = useAuth()

  useEffect(() => {
    if (!isAuthenticated || !userInfo?.email) {
      setProfile(null)
      setLoading(false)
      return
    }

    const loadProfile = async () => {
      try {
        const userProfile = await getUserProfile(userInfo.email)
        if (!userProfile) {
          // Create default profile for new users
          const defaultProfile = {
            firstName: userInfo.name?.split(' ')[0] || '',
            lastName: userInfo.name?.split(' ').slice(1).join(' ') || '',
            email: userInfo.email,
            picture: userInfo.picture,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            settings: {
              theme: "light" as const,
              notifications: true,
              defaultCalendar: "app",
              autoSync: false,
              syncFrequency: "daily" as const
            }
          }
          await setUserProfile(userInfo.email, defaultProfile)
          setProfile({ ...defaultProfile, createdAt: new Date(), updatedAt: new Date() } as any)
        } else {
          setProfile(userProfile)
        }
      } catch (error) {
        console.error("Error loading profile:", error)
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [isAuthenticated, userInfo])

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!userInfo?.email) return
    await updateUserProfile(userInfo.email, updates)
    setProfile(prev => prev ? { ...prev, ...updates } : null)
  }

  return (
    <ProfileContext.Provider value={{ profile, loading, updateProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfileStore() {
  const context = useContext(ProfileContext)
  if (!context) throw new Error('useProfileStore must be used within a ProfileProvider')
  return context
}