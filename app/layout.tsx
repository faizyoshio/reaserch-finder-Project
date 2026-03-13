import React from "react"
import { SpeedInsights } from "@vercel/speed-insights/next"
import type { Metadata, Viewport } from 'next'
import { Literata, Space_Grotesk } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import Script from 'next/script'
import './globals.css'

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-ui' })
const literata = Literata({ subsets: ['latin'], variable: '--font-display' })

export const metadata: Metadata = {
  title: 'ResearchAtlas - Journals, Research Books, E-Books, and Open Knowledge',
  description:
    'ResearchAtlas helps you discover journals, research books, e-books, and open web resources with legal public access.',
  generator: 'Faiz Yoshio',
  keywords: [
    'research',
    'academic search',
    'journals',
    'research books',
    'ebooks',
    'open access',
    'internet books',
    'public domain books',
  ],
  authors: [{ name: 'faizyoshio.my.id' }],
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      {
        url: '/favicon.ico',
        sizes: 'any',
      },
      {
        url: '/favicon-32x32.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: '/favicon-16x16.png',
        sizes: '16x16',
        type: 'image/png',
      },
    ],
    shortcut: '/favicon.ico',
    apple: [
      {
        url: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2ede0' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1f1d' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var k='researchatlas-theme';var v=localStorage.getItem(k);var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var shouldDark=(v==='dark')||(v==='system'&&prefersDark)||(!v&&prefersDark);document.documentElement.classList.toggle('dark',shouldDark);}catch(e){}})();`}
        </Script>
      </head>
      <body className={`${spaceGrotesk.variable} ${literata.variable} font-sans antialiased`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-black"
        >
          Skip to main content
        </a>
        <ThemeProvider>
          {children}
          <Toaster />
          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  )
}
