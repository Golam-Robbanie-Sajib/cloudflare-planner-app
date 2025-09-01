// app/dashboard/layout.tsx

import TopNavigation from "@/components/top-navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <TopNavigation />
      {children}
    </div>
  );
}