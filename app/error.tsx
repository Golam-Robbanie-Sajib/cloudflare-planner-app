"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("App error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <AlertTriangle className="h-6 w-6 text-red-600" />
      </div>
      <h1 className="text-xl font-semibold text-slate-800">Something went wrong</h1>
      <p className="text-sm text-slate-500 mt-2 max-w-md">
        {error.message || "An unexpected error occurred. The app stays usable — try again or head back to the dashboard."}
      </p>
      <div className="mt-6 flex gap-2">
        <Button onClick={reset} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />Try again
        </Button>
        <Link href="/">
          <Button className="btn-purple">
            <Home className="h-4 w-4 mr-2" />Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
