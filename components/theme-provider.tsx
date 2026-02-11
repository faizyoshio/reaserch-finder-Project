'use client'

import * as React from 'react'
import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from 'next-themes'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      {...props}
      attribute="class"
      enableSystem={true}
      defaultTheme="system"
      storageKey="researchfinder-theme"
      enableColorScheme={true}
    >
      {children}
    </NextThemesProvider>
  )
}
