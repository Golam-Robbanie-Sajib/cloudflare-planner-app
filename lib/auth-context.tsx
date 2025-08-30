//lib/auth-context.tsx

"use client"
import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { googleLogout } from "@react-oauth/google"
import { GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged } from "firebase/auth"
import { auth, googleProvider } from "./firebase"

interface UserInfo {
  email: string
  name: string
  picture: string
  accessToken: string
}

interface AuthContextType {
  isAuthenticated: boolean
  userInfo: UserInfo | null
  isLoading: boolean
  signOut: () => void
  signInWithGoogle: () => void
  getAccessToken: () => string | null
  error: string | null
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  userInfo: null,
  isLoading: false,
  signOut: () => {},
  signInWithGoogle: () => {},
  getAccessToken: () => null,
  error: null,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && userInfo) {
        // User is signed in and we have their info
        setIsLoading(false)
      } else if (!user) {
        // User is signed out
        setUserInfo(null)
        setIsLoading(false)
      }
    })

    return unsubscribe
  }, [userInfo])

  // Check for existing session on mount
  useEffect(() => {
    const storedUserInfo = localStorage.getItem("userInfo")
    if (storedUserInfo) {
      try {
        const parsed = JSON.parse(storedUserInfo)
        const isTokenFresh = parsed.timestamp && (Date.now() - parsed.timestamp < 3600000)
        
        if (isTokenFresh && parsed.accessToken) {
          const { timestamp, ...userInfo } = parsed
          setUserInfo(userInfo)
          console.log('Restored user session for:', userInfo.email)
        } else {
          localStorage.removeItem("userInfo")
        }
      } catch (error) {
        console.error('Error parsing stored user info:', error)
        localStorage.removeItem("userInfo")
      }
    }
    setIsLoading(false)
  }, [])

  const signInWithGoogle = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      // Clear any existing auth state first
      await signOut()
      
      const result = await signInWithPopup(auth, googleProvider)
      const credential = GoogleAuthProvider.credentialFromResult(result)

      if (!result.user || !credential?.accessToken) {
        throw new Error("Google sign-in failed. Please try again.")
      }

      const { displayName, email, photoURL } = result.user
      const accessToken = credential.accessToken

      if (!displayName || !email) {
        throw new Error("User information is missing from Google response.")
      }

      const newUserInfo: UserInfo = {
        name: displayName,
        email: email,
        picture: photoURL || "",
        accessToken: accessToken,
      }

      setUserInfo(newUserInfo)
      localStorage.setItem("userInfo", JSON.stringify({ 
        ...newUserInfo, 
        timestamp: Date.now() 
      }))

      console.log('Successfully signed in:', email)

    } catch (error: any) {
      console.error("Authentication error:", error)
      
      // Set user-friendly error messages
      let errorMessage = "Sign-in failed. Please try again."
      
      if (error.code === "auth/configuration-not-found") {
        errorMessage = "Authentication service is not properly configured. Please contact support."
      } else if (error.code === "auth/popup-closed-by-user") {
        errorMessage = "Sign-in was cancelled."
      } else if (error.code === "auth/popup-blocked") {
        errorMessage = "Pop-up was blocked. Please allow pop-ups and try again."
      } else if (error.message) {
        errorMessage = error.message
      }
      
      setError(errorMessage)
      
      // Clear any existing session on error
      localStorage.removeItem("userInfo")
      setUserInfo(null)
    } finally {
      setIsLoading(false)
    }
  }

  const signOut = async () => {
    try {
      console.log('Signing out user')
      await firebaseSignOut(auth)
      googleLogout()
      setUserInfo(null)
      setError(null)
      localStorage.removeItem("userInfo")
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const getAccessToken = () => {
    if (userInfo?.accessToken) {
      return userInfo.accessToken
    }
    
    const storedUserInfo = localStorage.getItem("userInfo")
    if (storedUserInfo) {
      try {
        const parsed = JSON.parse(storedUserInfo)
        const isTokenFresh = parsed.timestamp && (Date.now() - parsed.timestamp < 3600000)
        
        if (isTokenFresh && parsed.accessToken) {
          return parsed.accessToken
        } else {
          localStorage.removeItem("userInfo")
          setUserInfo(null)
        }
      } catch (error) {
        console.error('Error parsing stored token:', error)
        localStorage.removeItem("userInfo")
        setUserInfo(null)
      }
    }
    
    return null
  }

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated: !!userInfo, 
      userInfo, 
      isLoading, 
      signOut, 
      signInWithGoogle, 
      getAccessToken,
      error
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}