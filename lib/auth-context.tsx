// lib/auth-context.tsx

"use client"
import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react"
import { googleLogout } from "@react-oauth/google"
import { GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, User } from "firebase/auth"
import { auth, googleProvider } from "./firebase"
import { toast } from "@/components/ui/use-toast"

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
  signInWithGoogle: () => Promise<string | null> // Returns the new access token or null
  getAccessToken: () => string | null
  error: string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Dedupes concurrent sign-in calls: multiple components hitting an expired
  // token at the same time should all await the SAME popup, not race their own.
  const signInPromiseRef = useRef<Promise<string | null> | null>(null);

  // Effect to handle Firebase's own auth state changes in the background
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      if (user) {
        // User is signed in according to Firebase.
        // We don't set user info here directly to avoid race conditions with signInWithGoogle.
        // We mainly use this listener to handle the signed-out case.
      } else {
        // User is signed out. Clear all local state.
        setUserInfo(null);
        localStorage.removeItem("userInfo");
      }
      // We are done with the initial check
      if (isLoading) {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [isLoading]);

  // Effect to restore session from localStorage on initial load for speed
  useEffect(() => {
    const storedUserInfo = localStorage.getItem("userInfo");
    if (storedUserInfo) {
      try {
        const parsed = JSON.parse(storedUserInfo);
        // Trust the stored info for the initial render to make the UI fast
        setUserInfo(parsed);
      } catch (e) {
        localStorage.removeItem("userInfo");
      }
    }
    // Let the onAuthStateChanged listener handle the final loading state
  }, []);

  const signInWithGoogle = async (): Promise<string | null> => {
    // If a sign-in is already in flight, every caller awaits the same promise.
    if (signInPromiseRef.current) return signInPromiseRef.current;

    const promise = (async (): Promise<string | null> => {
      setIsLoading(true);
      setError(null);
      try {
      // The googleProvider is imported from firebase.ts, where the scope is correctly defined.
      // This ensures we ask for calendar permissions on the first sign-in.
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);

      if (!result.user || !credential?.accessToken) {
        throw new Error("Google sign-in failed. Please try again.");
      }

      const { displayName, email, photoURL } = result.user;
      const accessToken = credential.accessToken;

      if (!displayName || !email) {
        throw new Error("User information is missing from Google response.");
      }

      const newUserInfo: UserInfo = {
        name: displayName,
        email: email,
        picture: photoURL || "",
        accessToken: accessToken,
      };

      setUserInfo(newUserInfo);
      localStorage.setItem("userInfo", JSON.stringify({ 
        ...newUserInfo, 
        timestamp: Date.now() 
      }));
      
      return accessToken; // Return the fresh token on success

    } catch (error: any) {
      console.error("Authentication error:", error);
      
      if (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request") {
        toast({
          title: "Sign-in Cancelled",
          description: "You cancelled the sign-in process.",
        });
        setError(null);
      } else {
        let errorMessage = "Sign-in failed. Please try again.";
        if (error.code === "auth/popup-blocked") {
          errorMessage = "Pop-up was blocked. Please allow pop-ups and try again.";
        } else if (error.message) {
          errorMessage = error.message;
        }
        setError(errorMessage);
        toast({ title: "Authentication Error", description: errorMessage, variant: "destructive" });
      }
      
      localStorage.removeItem("userInfo");
      setUserInfo(null);
      return null; // Return null on failure
    } finally {
      setIsLoading(false);
    }
    })();

    signInPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      signInPromiseRef.current = null;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      googleLogout(); // From @react-oauth/google, helps clear any session state
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      // This ensures local state is always cleared
      setUserInfo(null);
      setError(null);
      localStorage.removeItem("userInfo");
    }
  };
  
  const getAccessToken = (): string | null => {
    // This is the "fast path" check. It returns a token ONLY if it's likely to be valid.
    const storedUserInfo = localStorage.getItem("userInfo");
    if (!storedUserInfo) return null;

    try {
      const parsed = JSON.parse(storedUserInfo);
      // Google access tokens live 60 min. Treat them as stale at 55 min so we
      // never hand out a token that expires mid-request.
      const isTokenFresh = parsed.timestamp && (Date.now() - parsed.timestamp < 55 * 60 * 1000);
      
      if (isTokenFresh && parsed.accessToken) {
        return parsed.accessToken;
      } else {
        // If the token is stale, we return null to signal that a refresh is needed.
        return null;
      }
    } catch (error) {
      return null;
    }
  };

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
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}