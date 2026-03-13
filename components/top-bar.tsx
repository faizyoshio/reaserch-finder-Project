'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { BookmarkIcon } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'

export function TopBar() {
  const pathname = usePathname()

  return (
    <header className="top-0 z-50 glass-strong rounded-b-2xl mx-2 mt-2 sm:mx-4 sm:mt-3">
      <nav className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
        {/* */}
        <Link href="/" className="flex items-center group">
          <div className="relative h-8 w-8 sm:h-10 sm:w-10 rounded-lg glass-button p-0 flex items-center justify-center overflow-hidden transition-transform duration-300 group-hover:scale-110">
            <Image
              src="/researchatlas-icon.png"
              alt="ResearchAtlas icon"
              fill
              sizes="(max-width: 640px) 20px, 24px"
              className="rounded-sm object-contain p-1.5 sm:p-2"
              priority
            />
          </div>
          <div className="ml-2 hidden sm:block leading-tight">
            <p className="text-sm font-semibold mb-0">ResearchAtlas</p>
            <p className="text-[11px] text-foreground/60 mb-0">Journals, Books, and Open Sources</p>
          </div>
          <span className="sr-only">ResearchAtlas</span>
        </Link>

        {/* */}
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/saved"
            className={`glass-button flex items-center gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base transition-all duration-200 ${
              pathname === '/saved'
                ? 'ring-2 ring-emerald-500 shadow-lg'
                : 'hover:shadow-md'
            }`}
            aria-label="Saved sources"
          >
            <BookmarkIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Saved</span>
            <span className="sm:hidden">Saved</span>
          </Link>

          {/* */}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
