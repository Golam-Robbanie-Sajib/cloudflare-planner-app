//app/page.tsx

import Calendar from "@/components/calendar"
import ChatInterface from "@/components/chat-interface"
import TopNavigation from "@/components/top-navigation"
import UpcomingEvents from "@/components/upcoming-events"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function TodoApp() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Top Navigation Bar */}
      <TopNavigation />

      {/* Main Content */}
      <div className="flex flex-1">
        {/* Left Section - 70% width */}
        <div className="w-[70%] border-r border-slate-200 p-6 flex flex-col overflow-auto">
          {/* View Selection Tabs */}
          <Tabs defaultValue="daily" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-slate-100 p-1 rounded-xl">
              <TabsTrigger
                value="daily"
                className="data-[state=active]:bg-purple-500 data-[state=active]:text-white rounded-lg font-medium"
              >
                Daily
              </TabsTrigger>
              <TabsTrigger
                value="weekly"
                className="data-[state=active]:bg-blue-500 data-[state=active]:text-white rounded-lg font-medium"
              >
                Weekly
              </TabsTrigger>
              <TabsTrigger
                value="monthly"
                className="data-[state=active]:bg-green-500 data-[state=active]:text-white rounded-lg font-medium"
              >
                Monthly
              </TabsTrigger>
            </TabsList>

            {/* Calendar Component */}
            <TabsContent value="daily" className="animate-fade-in">
              <Calendar view="daily" />
            </TabsContent>
            <TabsContent value="weekly" className="animate-fade-in">
              <Calendar view="weekly" />
            </TabsContent>
            <TabsContent value="monthly" className="animate-fade-in">
              <Calendar view="monthly" />
            </TabsContent>
          </Tabs>

          {/* Upcoming Events below Calendar */}
          <UpcomingEvents />
        </div>

        {/* Right Section - 30% width */}
        <div className="w-[30%] p-6 bg-blue-50">
          <ChatInterface />
        </div>
      </div>
    </div>
  )
}
