import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Accessibility utilities
export const a11y = {
  visuallyHidden: 'sr-only',
  focusRing: 'focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 dark:focus:ring-offset-slate-950',
  button: 'inline-flex items-center justify-center transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed',
}

// Responsive spacing utility
export const spacing = {
  mobile: 'px-2 py-2 sm:px-4 sm:py-3',
  card: 'p-4 sm:p-6',
  section: 'px-2 sm:px-4 py-4 sm:py-6',
}

// Common breakpoints for reference
export const breakpoints = {
  xs: '320px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const

// Validation utilities
export const validation = {
  // Minimum 3 words validation
  isValidSearchQuery: (query: string): boolean => {
    if (!query.trim()) return false
    const words = query.trim().split(/\s+/).filter(word => word.length > 0)
    return words.length >= 3
  },
  
  // Get word count
  getWordCount: (query: string): number => {
    return query.trim().split(/\s+/).filter(word => word.length > 0).length
  },
  
  // Get validation message
  getValidationMessage: (query: string): string => {
    const wordCount = validation.getWordCount(query)
    if (wordCount === 0) {
      return 'Masukkan kata kunci / Enter keywords'
    }
    if (wordCount === 1) {
      return `Diperlukan minimal 3 kata. Hanya ${wordCount} kata sekarang / Need at least 3 words. Only ${wordCount} word now`
    }
    if (wordCount < 3) {
      return `Diperlukan minimal 3 kata. Hanya ${wordCount} kata sekarang / Need at least 3 words. Only ${wordCount} words now`
    }
    return ''
  },
}
