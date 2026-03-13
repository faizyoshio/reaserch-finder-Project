import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { safeHttpUrl, sanitizeAsciiFilename } from '@/lib/utils'
import { corsPreflightResponse, rejectIfCorsDisallowed, withCors } from '@/lib/server/cors'
import { fetchWithRedirectAllowlist } from '@/lib/server/safe-fetch'

const DOI_REDIRECT_ALLOWED_HOSTS = [
  'doi.org',
  'dx.doi.org',
  'api.crossref.org',
  'data.crosscite.org',
  'api.datacite.org',
  'data.datacite.org',
]

function normalizeDoi(doi: string): string {
  return doi
    .trim()
    .replace(/\s+/g, '')
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:/i, '')
}

function isProbablyDoi(doi: string): boolean {
  // Pragmatic validation: prevent header injection and obvious nonsense,
  // without trying to fully implement the DOI grammar.
  if (!doi) return false
  if (doi.length > 200) return false
  if (/[\r\n\t]/.test(doi)) return false
  return /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(doi)
}

function sanitizeMetadata(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

function escapeBibTeX(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[{}]/g, (m) => `\\${m}`)
}

function generateBibTeXFromMetadata(
  doi: string,
  title: string,
  authors: string[],
  year: number,
  venue?: string,
  url?: string
): string {
  const safeTitle = escapeBibTeX(title)
  const safeAuthors = escapeBibTeX(authors.slice(0, 10).join(' and ') || 'Unknown')
  const safeVenue = venue ? escapeBibTeX(venue) : ''
  const safeUrl = escapeBibTeX(url || `https://doi.org/${doi}`)

  const citeKeyBase = sanitizeAsciiFilename(`${authors[0] || 'unknown'}-${year}`, 'citation').replace(/-/g, '_')
  const bibtexKey = citeKeyBase || 'citation'

  const fields = [
    `  title = {${safeTitle}}`,
    `  author = {${safeAuthors}}`,
    `  year = {${year}}`,
    safeVenue ? `  journal = {${safeVenue}}` : '',
    `  doi = {${doi}}`,
    `  url = {${safeUrl}}`,
  ]
    .filter(Boolean)
    .join(',\n')

  return `@article{${bibtexKey},\n${fields}\n}\n`
}

function generateRISFromMetadata(doi: string, title: string, authors: string[], year: number, venue?: string, url?: string): string {
  const safeTitle = sanitizeMetadata(title, 500)
  const safeAuthors = authors.map((a) => sanitizeMetadata(a, 200)).filter(Boolean).slice(0, 20)
  const safeVenue = sanitizeMetadata(venue, 300)
  const safeUrl = sanitizeMetadata(url, 1000) || `https://doi.org/${doi}`

  let ris = `TY  - JOUR
TI  - ${safeTitle || 'Untitled'}
${safeAuthors.length > 0 ? `AU  - ${safeAuthors.join('\nAU  - ')}` : 'AU  - Unknown'}
PY  - ${year}
DO  - ${doi}
UR  - ${safeUrl}`

  if (safeVenue) {
    ris += `\nJO  - ${safeVenue}`
  }

  ris += '\nER  - \n'

  return ris
}

async function fetchFromDoi(doi: string, format: 'bibtex' | 'ris'): Promise<string | null> {
  try {
    const normalized = normalizeDoi(doi)
    const acceptHeader = format === 'bibtex' ? 'application/x-bibtex' : 'application/x-research-info-systems'

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    const response = await fetchWithRedirectAllowlist(
      `https://doi.org/${normalized}`,
      {
        headers: { Accept: acceptHeader },
        signal: controller.signal,
      },
      { allowedHosts: DOI_REDIRECT_ALLOWED_HOSTS, maxRedirects: 4 }
    ).finally(() => clearTimeout(timeout))

    if (response.ok && response.headers.get('content-type')?.includes(format === 'bibtex' ? 'bibtex' : 'x-research-info-systems')) {
      return await response.text()
    }
  } catch {
    // Fallback if content negotiation fails
  }

  return null
}

const exportRequestSchema = z
  .object({
    doi: z.string().min(1).max(256),
    format: z.enum(['bibtex', 'ris']),
    title: z.string().optional(),
    authors: z.array(z.string()).optional(),
    year: z.union([z.number(), z.string()]).optional(),
    venue: z.string().optional(),
    url: z.string().optional(),
  })
  .strict()

export async function POST(request: NextRequest) {
  const corsRejection = rejectIfCorsDisallowed(request)
  if (corsRejection) return corsRejection

  const json = (body: unknown, init?: ResponseInit) => withCors(request, NextResponse.json(body, init))

  try {
    const body = await request.json().catch(() => null)
    const parsed = exportRequestSchema.safeParse(body)
    if (!parsed.success) {
      return json({ error: 'Invalid request parameters' }, { status: 400 })
    }

    const doi = normalizeDoi(parsed.data.doi)
    if (!isProbablyDoi(doi)) {
      return json({ error: 'Invalid DOI' }, { status: 400 })
    }

    const format = parsed.data.format
    const title = sanitizeMetadata(parsed.data.title, 500) || 'Untitled'
    const authors = (parsed.data.authors || []).map((a) => sanitizeMetadata(a, 200)).filter(Boolean)
    const yearRaw = parsed.data.year
    const yearParsed = typeof yearRaw === 'number' ? yearRaw : typeof yearRaw === 'string' ? parseInt(yearRaw, 10) : NaN
    const year = Number.isFinite(yearParsed) && yearParsed >= 1000 && yearParsed <= 3000 ? yearParsed : new Date().getFullYear()
    const venue = sanitizeMetadata(parsed.data.venue, 300) || undefined
    const url = safeHttpUrl(parsed.data.url) || undefined

    // Try to fetch from DOI first
    let content = await fetchFromDoi(doi, format)

    // If DOI lookup fails, generate from metadata
    if (!content) {
      if (format === 'bibtex') {
        content = generateBibTeXFromMetadata(doi, title, authors, year, venue, url)
      } else {
        content = generateRISFromMetadata(doi, title, authors, year, venue, url)
      }
    }

    const ext = format === 'bibtex' ? 'bib' : 'ris'
    const doiPart = sanitizeAsciiFilename(doi, 'doi')
    const titlePart = sanitizeAsciiFilename(title || 'article', 'article')
    const filenameBase = `${titlePart}-${doiPart}`.slice(0, 160)
    const filename = `${filenameBase}.${ext}`

    const response = new NextResponse(content, {
      headers: {
        'Content-Type': format === 'bibtex' ? 'application/x-bibtex' : 'application/x-research-info-systems',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })

    return withCors(request, response)
  } catch (error) {
    console.error('[ResearchAtlas] Export API error:', error)
    return json({ error: 'Export failed' }, { status: 500 })
  }
}

export function OPTIONS(request: NextRequest) {
  return corsPreflightResponse(request)
}
