// app/dashboard/layout.tsx

import TopNavigation from "@/components/top-navigation";
import OnboardingDialog from "@/components/onboarding-dialog";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
      <TopNavigation />
      <OnboardingDialog />
      {children}
    </div>
  );
}