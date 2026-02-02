'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sparkles, BookmarkIcon } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'

export function TopBar() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 glass-strong rounded-b-2xl mx-2 mt-2 sm:mx-4 sm:mt-3">
      <nav className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
        {/* Logo / Brand */}
        <Link href="/" className="flex items-center gap-2 sm:gap-3 group">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg glass-button flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
              ResearchFinder
            </h1>
            <p className="text-xs text-foreground/60 leading-none">Academic / Scholar</p>
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent sm:hidden">
            RF
          </span>
        </Link>

        {/* Navigation Links & Actions */}
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/saved"
            className={`glass-button flex items-center gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base transition-all duration-200 ${
              pathname === '/saved'
                ? 'ring-2 ring-blue-500 shadow-lg'
                : 'hover:shadow-md'
            }`}
            aria-label="Saved articles"
          >
            <BookmarkIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Tersimpan / Saved</span>
            <span className="sm:hidden">Saved</span>
          </Link>

          {/* Theme Toggle */}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
