import type { Metadata } from 'next'

const FALLBACK_SITE_URL = 'https://research-finder.faizyoshio.my.id'

function normalizeSiteUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return FALLBACK_SITE_URL
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_SITE_URL)
export const SITE_NAME = 'ResearchAtlas'
export const SITE_TITLE = `${SITE_NAME} - Journals, Research Books, E-Books, and Open Knowledge`
export const SITE_DESCRIPTION =
  'ResearchAtlas helps you discover journals, research books, e-books, and open web resources with legal public access.'
export const SITE_LOCALE = 'en_US'

export function absoluteUrl(pathname: string = '/'): string {
  if (!pathname) return SITE_URL
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${SITE_URL}${normalizedPath}`
}

export function firstSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || ''
  return value || ''
}

export function buildDefaultRobots(): NonNullable<Metadata['robots']> {
  return {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-video-preview': -1,
      'max-snippet': -1,
    },
  }
}

