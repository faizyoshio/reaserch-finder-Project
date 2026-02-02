'use client'

import React from 'react'

export function Footer() {
  return (
    <footer className="w-full py-6 sm:py-8 px-4 text-center text-xs sm:text-sm text-foreground/50 hover:text-foreground/70 transition-colors duration-300">
      <p>
        by{' '}
        <a
          href="https://faizyoshio.my.id"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 underline decoration-dotted"
        >
          faizyoshio.my.id
        </a>
      </p>
    </footer>
  )
}
