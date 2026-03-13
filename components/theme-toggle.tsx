'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <button className="glass-button w-10 h-10 flex items-center justify-center rounded-lg" aria-label="Theme toggle loading">
        <div className="w-4 h-4 rounded-full bg-foreground/20" />
      </button>
    )
  }

  const currentTheme = resolvedTheme || theme
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark'

  return (
    <button
      onClick={() => {
        // Add temporary class to enable smooth theme transitions
        try {
          document.documentElement.classList.add('theme-transition')
        } catch {}

        setTheme(nextTheme)

        // Remove transition helper shortly after (duration matches CSS)
        try {
          const duration = 260
          window.setTimeout(() => document.documentElement.classList.remove('theme-transition'), duration)
        } catch {}
      }}
      className="glass-button w-10 h-10 flex items-center justify-center rounded-lg transition-transform duration-300 hover:scale-110"
      aria-label={`Switch to ${nextTheme} theme`}
      aria-pressed={currentTheme === 'dark'}
      title={theme === 'system' ? `Auto (${currentTheme})` : `Manual (${currentTheme})`}
    >
      {currentTheme === 'dark' ? (
        <Sun className="h-4 w-4 text-amber-500" />
      ) : (
        <Moon className="h-4 w-4 text-emerald-700" />
      )}
    </button>
  )
}
