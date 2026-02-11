import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface ParsedSearchSyntax {
  cleanedQuery: string
  author?: string
  yearFrom?: number
  yearTo?: number
  phrases: string[]
  hasStructuredSyntax: boolean
}

export function parseSearchSyntax(query: string): ParsedSearchSyntax {
  const raw = query.trim()
  let working = raw
  let author: string | undefined
  const phrases: string[] = []
  const authorQuoted = /author:"([^"]+)"/i
  const authorSimple = /author:([^\s]+)/i

  const quotedMatch = raw.match(authorQuoted)
  if (quotedMatch?.[1]) {
    author = quotedMatch[1].trim()
    working = working.replace(authorQuoted, ' ')
  } else {
    const simpleMatch = working.match(authorSimple)
    if (simpleMatch?.[1]) {
      author = simpleMatch[1].trim()
      working = working.replace(authorSimple, ' ')
    }
  }

  const phraseRegex = /"([^"]+)"/g
  working = working.replace(phraseRegex, (_, phrase: string) => {
    const trimmed = phrase.trim()
    if (trimmed) phrases.push(trimmed)
    return ' '
  })

  let yearFrom: number | undefined
  let yearTo: number | undefined
  const yearRegex = /year:(>=|<=|>|<|=)?(\d{4})/gi
  working = working.replace(yearRegex, (_, operator: string | undefined, yearStr: string) => {
    const year = parseInt(yearStr, 10)
    if (Number.isNaN(year)) return ' '

    if (!operator || operator === '=') {
      yearFrom = year
      yearTo = year
    } else if (operator === '>=' || operator === '>') {
      const normalized = operator === '>' ? year + 1 : year
      yearFrom = yearFrom ? Math.max(yearFrom, normalized) : normalized
    } else if (operator === '<=' || operator === '<') {
      const normalized = operator === '<' ? year - 1 : year
      yearTo = yearTo ? Math.min(yearTo, normalized) : normalized
    }
    return ' '
  })

  const cleanedQuery = working.replace(/\s+/g, ' ').trim()
  const hasStructuredSyntax = Boolean(author || yearFrom || yearTo || phrases.length > 0)

  return {
    cleanedQuery,
    author,
    yearFrom,
    yearTo,
    phrases,
    hasStructuredSyntax,
  }
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
  // Free text requires at least 3 words unless structured syntax is provided.
  isValidSearchQuery: (query: string): boolean => {
    if (!query.trim()) return false
    const parsed = parseSearchSyntax(query)
    const words = parsed.cleanedQuery.split(/\s+/).filter(word => word.length > 0)
    if (parsed.hasStructuredSyntax) return true
    return words.length >= 3
  },
  
  // Get word count
  getWordCount: (query: string): number => {
    const parsed = parseSearchSyntax(query)
    return parsed.cleanedQuery.split(/\s+/).filter(word => word.length > 0).length
  },
  
  // Get validation message
  getValidationMessage: (query: string): string => {
    const parsed = parseSearchSyntax(query)
    const wordCount = validation.getWordCount(query)
    if (parsed.hasStructuredSyntax) return ''
    if (wordCount === 0) {
      return 'Enter keywords'
    }
    if (wordCount === 1) {
      return `Minimum 3 words required for free-text query. Only ${wordCount} word provided`
    }
    if (wordCount < 3) {
      return `Minimum 3 words required for free-text query. Only ${wordCount} words provided`
    }
    return ''
  },
}
