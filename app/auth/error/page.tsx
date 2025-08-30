"use client"

import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"
import Link from "next/link"

export default function AuthErrorPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get("error") || "unknown"

  // Map error codes to user-friendly messages
  const errorMessages: Record<string, string> = {
    no_code: "No authorization code was received from Google.",
    token_exchange: "Failed to exchange the authorization code for access tokens.",
    user_info: "Failed to retrieve user information.",
    config_missing: "OAuth configuration is incomplete. Please check environment variables.",
    oauth_access_denied: "You denied access to your Google account.",
    oauth_error: "Google returned an error during authentication.",
    unknown: "An unknown error occurred during authentication.",
  }

  // Handle custom error messages that don't match predefined codes
  let errorMessage = errorMessages[error] || errorMessages.unknown
  if (error.startsWith("oauth_")) {
    errorMessage = `Google authentication error: ${error.substring(6)}`
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <CardTitle>Authentication Error</CardTitle>
          </div>
          <CardDescription>There was a problem authenticating with Google.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">{errorMessage}</p>
          <p className="text-sm">Please try again or contact support if the problem persists.</p>
          <p className="text-sm mt-4 p-2 bg-muted rounded-md">
            <strong>Error code:</strong> {error}
          </p>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Link href="/api/auth/google">
            <Button variant="outline">Try Again</Button>
          </Link>
          <Link href="/">
            <Button>Return to Dashboard</Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
