// app/page.tsx

import MainDashboard from "@/components/main-dashboard";
import TopNavigation from "@/components/top-navigation";

export default function TodoApp() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <TopNavigation />
      <MainDashboard />
    </div>
  );
}