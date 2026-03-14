import { useEffect } from "react"

export type Shortcut = {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  handler: (e: KeyboardEvent) => void
  description?: string
}

export function useKeyboardShortcuts(shortcuts: Shortcut[], deps: unknown[] = []) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      for (const sc of shortcuts) {
        const ctrlMatch = sc.ctrl ? (e.ctrlKey || e.metaKey) : true
        const metaMatch = sc.meta ? e.metaKey : true
        const shiftMatch = sc.shift ? e.shiftKey : !e.shiftKey || !sc.shift
        const altMatch = sc.alt ? e.altKey : true
        const keyMatch = e.key.toLowerCase() === sc.key.toLowerCase()

        if (keyMatch && (sc.ctrl ? (e.ctrlKey || e.metaKey) : !e.ctrlKey && !e.metaKey) && shiftMatch && altMatch) {
          if (sc.ctrl || sc.meta) {
            e.preventDefault()
          }
          sc.handler(e)
        }
      }
    }

    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, deps)
}
