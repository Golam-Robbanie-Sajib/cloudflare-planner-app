// middleware.ts
//
// Sets security headers on every response. Edge-runtime safe — no Node APIs.
// CSP is the meaningful one: it locks XSS down to scripts we explicitly
// allow. The connect-src list is the full set of third-parties this app
// talks to from the browser:
//   * Firebase / Firestore / Identity Toolkit (auth, db)
//   * Google APIs (Calendar)
//   * generative AI is server-side only (Groq is hit from the edge route,
//     never from the browser), so it's NOT in connect-src.
//
// 'unsafe-inline' on script-src is required because Next.js injects an
// inline runtime; 'unsafe-eval' is required by the React-Query devtools in
// dev. Strict-Dynamic + nonces would be the next step but require a deeper
// Next.js integration than fits in middleware.

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Next runtime, plus inline scripts emitted by next/script. 'unsafe-eval'
  // is needed by Recharts internals + React Query devtools.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' " + [
    "https://*.googleapis.com",
    "https://*.firebaseio.com",
    "https://*.firebase.com",
    "https://*.firebaseapp.com",
    "https://firestore.googleapis.com",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    "https://www.googleapis.com",
    "https://accounts.google.com",
    "wss://*.firebaseio.com",
  ].join(" "),
  // Google's sign-in popup runs in a child window; needed for postMessage
  // back to our origin to work.
  "frame-src https://accounts.google.com https://*.firebaseapp.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ")

export function middleware(req: NextRequest) {
  const res = NextResponse.next()
  res.headers.set("Content-Security-Policy", CSP_DIRECTIVES)
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  res.headers.set("X-Content-Type-Options", "nosniff")
  res.headers.set("X-Frame-Options", "DENY")
  res.headers.set("Permissions-Policy", "geolocation=(), microphone=(self), camera=(), payment=()")
  // HSTS only makes sense once you're fully on HTTPS in prod. The condition
  // keeps localhost untouched.
  if (req.nextUrl.protocol === "https:") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  }
  return res
}

export const config = {
  // Skip Next's internal assets to avoid hashing/streaming weirdness.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)"],
}
