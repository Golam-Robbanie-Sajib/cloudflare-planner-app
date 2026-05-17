// components/theme-toggle.tsx
"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  // next-themes only resolves the theme after mount; avoid SSR hydration
  // mismatch by rendering nothing until then.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="h-9 w-9" aria-hidden />

  const isDark = resolvedTheme === "dark"
  return (
    <Button
      variant="ghost"
      size="icon"
      className="hover:bg-slate-100 dark:hover:bg-slate-800"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  )
}
