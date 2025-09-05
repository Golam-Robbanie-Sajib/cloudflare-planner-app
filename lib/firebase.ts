//lib/firebase.ts
import { initializeApp, getApp, getApps } from "firebase/app"
import { getFirestore } from "firebase/firestore"
import { getAuth, GoogleAuthProvider } from "firebase/auth"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

// Initialize Firebase
let app;
try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
} catch (error) {
  console.error("Firebase initialization error:", error);
  // Fallback initialization
  app = initializeApp(firebaseConfig);
}

// Initialize services
export const db = getFirestore(app)
export const auth = getAuth(app)

// Configure Google Auth Provider with proper scopes
export const googleProvider = new GoogleAuthProvider()
googleProvider.addScope('https://www.googleapis.com/auth/calendar')
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.profile')
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.email')

// Set custom parameters
googleProvider.setCustomParameters({
  prompt: 'select_account',
  access_type: 'offline',
})

export default app