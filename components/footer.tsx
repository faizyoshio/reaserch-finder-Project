'use client'

import React from 'react'
import Link from 'next/link'

export function Footer() {
  return (
    <footer className="w-full py-6 sm:py-8 px-4 text-center text-xs sm:text-sm text-foreground/50 hover:text-foreground/70 transition-colors duration-300">
      <nav aria-label="Footer" className="mb-2 flex items-center justify-center gap-4">
        <Link href="/" className="hover:text-foreground underline-offset-4 hover:underline">
          Home
        </Link>
        <Link href="/saved" className="hover:text-foreground underline-offset-4 hover:underline">
          Saved Sources
        </Link>
      </nav>
      <p>(c) 2019-2026 ResearchAtlas by Faiz Yoshio. All rights reserved.</p>
    </footer>
  )
}
