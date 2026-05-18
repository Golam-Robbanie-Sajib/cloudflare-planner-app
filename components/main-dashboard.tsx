// components/main-dashboard.tsx

"use client"; // This is the most important line

import Calendar from "@/components/calendar";
import ChatInterface from "@/components/chat-interface";
import UpcomingEvents from "@/components/upcoming-events";
import TodayWidget from "@/components/today-widget";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription, DrawerTrigger } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus } from "lucide-react";

export default function MainDashboard() {
  const isMobile = useIsMobile();

  return (
    // STEP 1: Set a fixed height on the main container and remove md:flex-row
    <div className="flex flex-1">
      {/* Left Section */}
      {/* STEP 2: Make this column independently scrollable */}
      <div className="w-full md:w-[70%] border-r border-slate-200 p-6 overflow-y-auto h-[calc(100vh-4rem)]">
        <TodayWidget />
        <Tabs defaultValue="daily" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-slate-100 p-1 rounded-xl">
            <TabsTrigger value="daily" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white rounded-lg font-medium">Daily</TabsTrigger>
            <TabsTrigger value="weekly" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white rounded-lg font-medium">Weekly</TabsTrigger>
            <TabsTrigger value="monthly" className="data-[state=active]:bg-green-500 data-[state=active]:text-white rounded-lg font-medium">Monthly</TabsTrigger>
          </TabsList>
          <TabsContent value="daily" className="animate-fade-in"><Calendar view="daily" /></TabsContent>
          <TabsContent value="weekly" className="animate-fade-in"><Calendar view="weekly" /></TabsContent>
          <TabsContent value="monthly" className="animate-fade-in"><Calendar view="monthly" /></TabsContent>
        </Tabs>
        <UpcomingEvents />
      </div>

      {/* Right Section / Mobile Drawer */}
      {isMobile ? (
        <MobileChatDrawer />
      ) : (
        // STEP 3: This column will now fill the height but not scroll
        <div className="hidden md:flex md:w-[30%] p-6 bg-blue-50 flex-col">
          <ChatInterface />
        </div>
      )}
    </div>
  );
}

function MobileChatDrawer() {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button className="fixed bottom-4 right-4 z-50 h-16 w-16 rounded-full shadow-lg btn-purple flex items-center justify-center">
          <MessageSquarePlus className="h-8 w-8 text-white" />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="h-[85vh] bg-blue-50 flex flex-col">
        <DrawerTitle className="sr-only">AI Assistant Chat</DrawerTitle>
        <DrawerDescription className="sr-only">
          A chat interface to create and manage learning plans with an AI assistant.
        </DrawerDescription>
        <div className="p-4 bg-blue-50 flex-shrink-0">
          <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-blue-200" />
        </div>
        <div className="flex-1 overflow-hidden p-4 pt-0">
          <ChatInterface />
        </div>
      </DrawerContent>
    </Drawer>
  );
}