'use client'

import React from 'react'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body>
        <main style={{ maxWidth: 720, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontSize: 24, margin: '16px 0' }}>Something went wrong</h1>
          <p style={{ color: '#444', lineHeight: 1.5 }}>
            We could not load the discovery view. Please try again.
          </p>
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => reset()}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #bbb',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}

