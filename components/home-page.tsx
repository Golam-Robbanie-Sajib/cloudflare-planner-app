// components/home-page.tsx

"use client";

import Link from "next/link";
import { Bot, Calendar, TrendingUp, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import GoogleAuthButton from "./google-auth-button";
import { Button } from "./ui/button";

export default function HomePage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="flex-grow flex flex-col items-center justify-center animated-gradient">
      <div className="container mx-auto px-6 py-16 flex-grow flex items-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          
          {/* Left Side: App Description */}
          <div className="text-white">
            <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-4">
              Turn Your Goals into Daily Actions
            </h1>
            <p className="text-lg md:text-xl text-purple-200 mb-8">
              Our AI Goal Planner intelligently structures your learning path,
              integrates it with your calendar, and helps you build consistent habits.
            </p>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <Bot className="h-8 w-8 text-purple-300 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg">AI-Powered Planning</h3>
                  <p className="text-purple-200">Describe your goal, and our AI will generate a structured, actionable plan for you.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Calendar className="h-8 w-8 text-purple-300 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg">Seamless Calendar Integration</h3>
                  <p className="text-purple-200">Sync your new learning schedule directly to your Google Calendar with a single click.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <TrendingUp className="h-8 w-8 text-purple-300 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg">Track Your Progress</h3>
                  <p className="text-purple-200">Manage tasks, view your schedule, and stay on top of your goals all in one place.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Login / Dashboard Button */}
          <div className="bg-white/10 backdrop-blur-lg p-8 rounded-2xl shadow-2xl text-center">
            {isAuthenticated ? (
              <>
                <h2 className="text-3xl font-bold text-white mb-4">Welcome Back!</h2>
                <p className="text-purple-200 mb-8">Ready to continue your learning journey? Your dashboard is waiting.</p>
                <Link href="/dashboard">
                  <Button size="lg" className="w-full bg-white text-purple-700 hover:bg-purple-100 font-bold text-lg py-8 shadow-lg transition-transform hover:scale-105">
                    Go to Dashboard
                    <ChevronRight className="ml-2 h-6 w-6" />
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <h2 className="text-3xl font-bold text-white mb-4">Get Started Now</h2>
                <p className="text-purple-200 mb-8">Sign in with your Google account to create your first AI-powered learning plan for free.</p>
                <GoogleAuthButton className="w-full bg-white text-gray-800 font-bold text-lg py-8 shadow-lg hover:bg-gray-100" />
              </>
            )}
          </div>
        </div>
      </div>

      {/* --- This is the new footer with the Privacy Policy link --- */}
      <footer className="w-full text-center p-6 bg-transparent">
        <Link href="/privacy-policy">
          <span className="text-sm text-purple-200 hover:text-white underline transition-colors">
            Privacy Policy
          </span>
        </Link>
      </footer>
    </div>
  );
}