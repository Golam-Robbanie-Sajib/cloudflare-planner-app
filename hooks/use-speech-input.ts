// hooks/use-speech-input.ts
//
// Thin wrapper around the browser's SpeechRecognition API. Returns the live
// transcript and a controllable started flag. We default to interim results
// off (less flicker) and a long-form continuous capture so the user can talk
// in full sentences without re-triggering.

"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type AnyRecognition = any

interface UseSpeechInputResult {
  supported: boolean
  listening: boolean
  transcript: string
  start: () => void
  stop: () => void
  reset: () => void
}

export function useSpeechInput(lang = "en-US"): UseSpeechInputResult {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const recRef = useRef<AnyRecognition | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setSupported(false)
      return
    }
    setSupported(true)
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = false
    rec.lang = lang
    rec.onresult = (e: any) => {
      let text = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript
      }
      setTranscript(prev => (prev ? prev + " " : "") + text.trim())
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    return () => {
      try { rec.stop() } catch { /* noop */ }
      recRef.current = null
    }
  }, [lang])

  const start = useCallback(() => {
    if (!recRef.current) return
    try {
      recRef.current.start()
      setListening(true)
    } catch { /* already started */ }
  }, [])

  const stop = useCallback(() => {
    if (!recRef.current) return
    try { recRef.current.stop() } catch { /* noop */ }
    setListening(false)
  }, [])

  const reset = useCallback(() => setTranscript(""), [])

  return { supported, listening, transcript, start, stop, reset }
}
