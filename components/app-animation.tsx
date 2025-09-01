// components/app-animation.tsx

"use client";

// STEP 1: Import the 'Variants' type
import { motion, Variants } from "framer-motion";
import { Calendar, CheckSquare, Bot, Sparkles } from "lucide-react";

// STEP 2: Add the ': Variants' type annotation
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
    },
  },
};

// STEP 3: Add the ': Variants' type annotation here as well
const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100,
    },
  },
};

export default function AppAnimation() {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="bg-white p-6 rounded-2xl shadow-2xl border border-slate-200"
    >
      {/* Mock Chat Interface */}
      <motion.div variants={itemVariants} className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div className="flex-grow">
          <div className="bg-slate-100 rounded-lg p-3">
            <p className="text-sm text-slate-700 font-medium">
              Generate a 7-day plan to learn React...
            </p>
          </div>
        </div>
      </motion.div>

      {/* Mock Calendar Card */}
      <motion.div variants={itemVariants} className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
        <div className="flex items-center text-purple-600 mb-3">
          <Calendar className="h-5 w-5 mr-2" />
          <h3 className="font-bold">Your Generated Plan</h3>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3 bg-white p-2 rounded-md shadow-sm">
            <CheckSquare className="h-4 w-4 text-green-500" />
            <span className="text-sm text-slate-600">Day 1: Intro to JSX & Components</span>
          </div>
          <div className="flex items-center gap-3 bg-white p-2 rounded-md shadow-sm">
            <CheckSquare className="h-4 w-4 text-green-500" />
            <span className="text-sm text-slate-600">Day 2: State and Props</span>
          </div>
          <div className="flex items-center gap-3 bg-white p-2 rounded-md shadow-sm opacity-60">
            <CheckSquare className="h-4 w-4 text-slate-400" />
            <span className="text-sm text-slate-500">Day 3: Handling Events</span>
          </div>
        </div>
      </motion.div>
      
      {/* Mock Upcoming Events */}
      <motion.div variants={itemVariants} className="flex items-center gap-3 mt-4">
         <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div className="flex-grow">
           <p className="text-sm text-slate-500 font-medium">
              ...and your tasks appear in "Upcoming Events"!
            </p>
        </div>
      </motion.div>
    </motion.div>
  );
}