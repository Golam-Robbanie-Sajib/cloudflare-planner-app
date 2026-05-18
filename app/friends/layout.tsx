import TopNavigation from "@/components/top-navigation"

export default function FriendsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
      <TopNavigation />
      {children}
    </div>
  )
}
