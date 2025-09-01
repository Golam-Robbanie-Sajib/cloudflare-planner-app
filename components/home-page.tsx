// components/home-page.tsx

import AppAnimation from "./app-animation";
import GoogleAuthButton from "./google-auth-button";
import { Bot, Calendar, TrendingUp } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex-grow flex items-center justify-center bg-slate-50">
      <div className="container mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Left Side: Animation */}
          <div>
            <AppAnimation />
          </div>

          {/* Right Side: Login / Description */}
          <div className="text-center lg:text-left">
            <h1 className="text-4xl md:text-5xl font-extrabold text-slate-800 leading-tight mb-4">
              Turn Your Goals into Daily Actions.
            </h1>
            <p className="text-lg text-slate-600 mb-8">
              Our AI Goal Planner intelligently structures your learning path,
              integrates it with your calendar, and helps you build consistent habits.
            </p>
            
            <div className="flex justify-center lg:justify-start">
              <GoogleAuthButton className="text-lg py-6 px-8 shadow-lg bg-purple-500 text-white hover:bg-purple-600" />
            </div>

            <div className="mt-12 space-y-4 text-left">
              <p className="flex items-center gap-3 text-slate-700">
                <Bot className="h-5 w-5 text-purple-500" />
                <span className="font-medium">AI-Powered Planning</span> to create your schedule in seconds.
              </p>
              <p className="flex items-center gap-3 text-slate-700">
                <Calendar className="h-5 w-5 text-purple-500" />
                <span className="font-medium">Seamless Calendar Integration</span> with your Google account.
              </p>
              <p className="flex items-center gap-3 text-slate-700">
                <TrendingUp className="h-5 w-5 text-purple-500" />
                <span className="font-medium">Track Your Progress</span> and stay on top of your goals.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}