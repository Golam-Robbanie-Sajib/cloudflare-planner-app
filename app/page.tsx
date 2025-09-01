// app/page.tsx

"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import HomePage from "@/components/home-page";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait until the auth status is determined and is true
    if (!isLoading && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  // While checking the auth status, show a loading spinner
  // This prevents the homepage from flashing before the redirect
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  // If not loading and not authenticated, show the homepage
  // The redirect will happen for authenticated users, so they will never see this.
  return (
      <div className="min-h-screen flex flex-col">
          <HomePage />
      </div>
  );
}