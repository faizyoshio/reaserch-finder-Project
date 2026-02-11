import { NextRequest, NextResponse } from 'next/server'

function sanitizeDoi(doi: string): string {
  return doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:/, '')
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
}

function generateBibTeXFromMetadata(doi: string, title: string, authors: string[], year: number, venue?: string, url?: string): string {
  const authorStr = authors.slice(0, 3).join(' and ')
  const bibtexKey = sanitizeFileName(`${authors[0]?.split(' ')[0] || 'unknown'}-${year}`)
  const journalOrBooktitle = venue ? `journal = "${venue}",` : ''

  return `@article{${bibtexKey},
  title = "${title}",
  author = "${authorStr}",
  year = ${year},
  ${journalOrBooktitle}
  doi = "${doi}",
  url = "${url || `https://doi.org/${doi}`}"
}`
}

function generateRISFromMetadata(doi: string, title: string, authors: string[], year: number, venue?: string, url?: string): string {
  let ris = `TY  - JOUR
TI  - ${title}
AU  - ${authors.join('\nAU  - ')}
PY  - ${year}
DO  - ${doi}
UR  - ${url || `https://doi.org/${doi}`}`

  if (venue) {
    ris += `\nJO  - ${venue}`
  }

  ris += '\nER  - '

  return ris
}

async function fetchFromDoi(doi: string, format: 'bibtex' | 'ris'): Promise<string | null> {
  try {
    const sanitizedDoi = sanitizeDoi(doi)
    const acceptHeader = format === 'bibtex' ? 'application/x-bibtex' : 'application/x-research-info-systems'

    const response = await fetch(`https://doi.org/${sanitizedDoi}`, {
      headers: { Accept: acceptHeader },
      redirect: 'follow',
    })

    if (response.ok && response.headers.get('content-type')?.includes(format === 'bibtex' ? 'bibtex' : 'x-research-info-systems')) {
      return await response.text()
    }
  } catch {
    // Fallback if content negotiation fails
  }

  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { doi, title, authors, year, venue, url, format } = body

    if (!doi || !format || !['bibtex', 'ris'].includes(format)) {
      return NextResponse.json(
        { error: 'Invalid request parameters' },
        { status: 400 }
      )
    }

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

    const sanitizedDoi = sanitizeDoi(doi)
    const filename = `${sanitizeFileName(title || 'article')}-${sanitizedDoi}.${format === 'bibtex' ? 'bib' : 'ris'}`

    return new NextResponse(content, {
      headers: {
        'Content-Type': format === 'bibtex' ? 'application/x-bibtex' : 'application/x-research-info-systems',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('[ResearchFinder] Export API error:', error)
    return NextResponse.json(
      { error: 'Export failed' },
      { status: 500 }
    )
  }
}
