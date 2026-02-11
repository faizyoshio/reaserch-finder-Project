import React from "react"
import { SpeedInsights } from "@vercel/speed-insights/next"
import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import Script from 'next/script'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ResearchFinder - Academic Literature Discovery',
  description: 'ResearchFinder is a dedicated scholarly platform designed to streamline the discovery of academic literature and research publications.',
  generator: 'Faiz Yoshio',
  keywords: ['research', 'academic', 'journals', 'publications', 'literature'],
  authors: [{ name: 'faizyoshio.my.id' }],
  icons: {
    icon: [
      {
        url: '/favicon-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/favicon-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/favicon.ico',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f3ff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1419' },
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
        {/* Prevent theme flash by applying stored theme class early */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var k='researchfinder-theme';var v=localStorage.getItem(k);if(v==='dark'||(!v&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')} }catch(e){} })();`}
        </Script>
      </head>
      <body className={`${geist.className} font-sans antialiased`}>
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
