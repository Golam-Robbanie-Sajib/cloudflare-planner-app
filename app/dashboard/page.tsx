// app/dashboard/page.tsx

import { Suspense } from "react";
import MainDashboard from "@/components/main-dashboard";

// MainDashboard renders ChatInterface, which calls useSearchParams() to pick
// up the `?regen=…` flag the goal cards send. Next requires any tree using
// useSearchParams to live under a <Suspense> boundary or the page can't
// prerender. Wrapping here keeps the runtime "use client" component intact.
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <MainDashboard />
    </Suspense>
  );
}
