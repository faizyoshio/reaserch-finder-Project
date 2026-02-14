'use client'

import React from 'react'
import { TopBar } from '@/components/top-bar'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />

      <main id="main-content" className="flex-1 px-2 sm:px-4 py-6 sm:py-10 max-w-4xl mx-auto w-full">
        <div className="glass rounded-2xl p-6 sm:p-10 text-center animate-glass-in">
          <h1 className="text-2xl sm:text-3xl font-bold mb-3">Something went wrong</h1>
          <p className="text-sm sm:text-base text-foreground/70 mb-6">
            An unexpected error occurred. Please try again.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
            <Button onClick={() => reset()} className="glass-button w-full sm:w-auto">
              Try again
            </Button>
            <Button
              onClick={() => {
                window.location.href = '/'
              }}
              className="glass-button w-full sm:w-auto"
              variant="outline"
            >
              Go home
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}

