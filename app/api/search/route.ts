import { NextRequest, NextResponse } from 'next/server'
import type { ResearchArticle, SearchResponse } from '@/lib/types'

// Simple in-memory cache with TTL
const searchCache = new Map<string, { data: SearchResponse; timestamp: number }>()
const CACHE_TTL = 60 * 1000 // 60 seconds

interface OpenAlexWork {
  id: string
  title: string
  author_count: number
  authorships: Array<{ author: { display_name: string } }>
  publication_year: number
  host_venue?: { display_name?: string }
  doi: string
  open_access: { is_oa: boolean }
  cited_by_count: number
  landing_page_url?: string
}

interface CrossrefArticle {
  DOI: string
  title: string[]
  author?: Array<{ given: string; family: string }>
  published: { 'date-parts': number[][] }
  container?: { title: string }
  is_referenced_by_count: number
  URL: string
  link?: Array<{ URL: string; 'content-type': string }>
}

async function fetchOpenAlex(query: string, page: number, perPage: number, yearFrom?: number, yearTo?: number, oaOnly?: boolean, documentType?: string): Promise<{ articles: ResearchArticle[]; total: number }> {
  try {
    const filterParts: string[] = []
    if (yearFrom) filterParts.push(`publication_year:>=${yearFrom}`)
    if (yearTo) filterParts.push(`publication_year:<=${yearTo}`)
    if (oaOnly) filterParts.push('open_access.is_oa:true')
    if (documentType) {
      // Map document types to OpenAlex type filter
      const typeMap: { [key: string]: string } = {
        journal: 'journal-article',
        conference: 'proceedings-article',
        preprint: 'preprint',
        book: 'book',
      }
      const openAlexType = typeMap[documentType]
      if (openAlexType) filterParts.push(`type:${openAlexType}`)
    }

    const filter = filterParts.length > 0 ? `&filter=${filterParts.join(',')}` : ''

    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&page=${page}&per-page=${perPage}${filter}&sort=-publication_year`

    const response = await fetch(url, { next: { revalidate: 60 } })
    if (!response.ok) throw new Error(`OpenAlex API error: ${response.status}`)

    const data = await response.json()

    const articles: ResearchArticle[] = (data.results || []).map((work: OpenAlexWork) => ({
      id: work.id,
      title: work.title,
      authors: work.authorships.slice(0, 5).map((a: { author: { display_name: string } }) => a.author.display_name),
      year: work.publication_year,
      venue: work.host_venue?.display_name,
      doi: work.doi ? normalizeDoi(work.doi) : undefined,
      url: work.landing_page_url,
      citedBy: work.cited_by_count,
      openAccess: work.open_access.is_oa,
      source: 'openAlex' as const,
    }))

    return { articles, total: data.meta?.count || 0 }
  } catch (error) {
    console.error('[ResearchFinder] OpenAlex fetch error:', error)
    return { articles: [], total: 0 }
  }
}

async function fetchCrossref(query: string, page: number, perPage: number, yearFrom?: number, yearTo?: number): Promise<{ articles: ResearchArticle[]; total: number }> {
  try {
    const offset = (page - 1) * perPage
    let url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&offset=${offset}&rows=${perPage}&sort=relevance`

    if (yearFrom) url += `&filter=from-pub-date:${yearFrom}-01-01`
    if (yearTo) url += `,until-pub-date:${yearTo}-12-31`

    const response = await fetch(url, { next: { revalidate: 60 } })
    if (!response.ok) throw new Error(`Crossref API error: ${response.status}`)

    const data = await response.json()

    const articles: ResearchArticle[] = (data.message?.items || []).map((item: CrossrefArticle) => ({
      id: item.DOI || `crossref-${Math.random()}`,
      title: item.title ? item.title[0] : 'Untitled',
      authors: (item.author || [])
        .slice(0, 5)
        .map((a: { given: string; family: string }) => `${a.given || ''} ${a.family || ''}`.trim()),
      year: item.published?.['date-parts']?.[0]?.[0] || new Date().getFullYear(),
      venue: item.container?.title,
      doi: item.DOI ? normalizeDoi(item.DOI) : undefined,
      url: item.URL,
      citedBy: item.is_referenced_by_count || 0,
      openAccess: false, // Crossref doesn't reliably indicate OA status
      source: 'crossref' as const,
    }))

    return { articles, total: data.message?.['total-results'] || 0 }
  } catch (error) {
    console.error('[ResearchFinder] Crossref fetch error:', error)
    return { articles: [], total: 0 }
  }
}

function normalizeDoi(doi: string): string {
  return doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:/, '')
}

function deduplicateArticles(articles: ResearchArticle[]): ResearchArticle[] {
  const seen = new Map<string, ResearchArticle>()

  articles.forEach((article) => {
    const key = article.doi || `${article.source}-${article.id}`
    if (!seen.has(key)) {
      seen.set(key, article)
    }
  })

  return Array.from(seen.values())
}

function sortArticles(articles: ResearchArticle[], sort: 'relevance' | 'year' | 'citedBy'): ResearchArticle[] {
  const sorted = [...articles]
  switch (sort) {
    case 'year':
      return sorted.sort((a, b) => b.year - a.year)
    case 'citedBy':
      return sorted.sort((a, b) => b.citedBy - a.citedBy)
    case 'relevance':
    default:
      return sorted
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const q = searchParams.get('q')?.trim()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const perPage = Math.min(25, Math.max(1, parseInt(searchParams.get('perPage') || '10')))
    const yearFrom = searchParams.get('yearFrom') ? parseInt(searchParams.get('yearFrom')!) : undefined
    const yearTo = searchParams.get('yearTo') ? parseInt(searchParams.get('yearTo')!) : undefined
    const oaOnly = searchParams.get('oaOnly') === 'true'
    const sort = (searchParams.get('sort') || 'relevance') as 'relevance' | 'year' | 'citedBy'
    const sortDir = (searchParams.get('sortDir') || 'desc') as 'asc' | 'desc'
    const documentType = searchParams.get('documentType') || undefined
    const language = searchParams.get('language') || undefined

    // Validate input - minimum 3 words
    if (!q) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      )
    }

    const wordCount = q.trim().split(/\s+/).filter(word => word.length > 0).length
    if (wordCount < 3) {
      return NextResponse.json(
        { error: `Minimum 3 words required. Only ${wordCount} word${wordCount === 1 ? '' : 's'} provided` },
        { status: 400 }
      )
    }

    // Check cache
    const cacheKey = `${q}:${page}:${perPage}:${yearFrom}:${yearTo}:${oaOnly}:${sort}:${sortDir}:${documentType}:${language}`
    const cached = searchCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data)
    }

    // Fetch from both sources in parallel
    const [openAlexResult, crossrefResult] = await Promise.all([
      fetchOpenAlex(q, page, perPage, yearFrom, yearTo, oaOnly, documentType),
      fetchCrossref(q, page, perPage, yearFrom, yearTo),
    ])

    // Combine results
    let combined = [...openAlexResult.articles, ...crossrefResult.articles]

    // Filter OA if requested
    if (oaOnly) {
      combined = combined.filter((a) => a.openAccess)
    }

    // Filter by language if requested (basic client-side filtering based on available metadata)
    if (language) {
      // Since APIs don't provide language info directly, we pass it through for future enhancement
      // In a production system, you'd use a language detection service
    }

    // Deduplicate
    combined = deduplicateArticles(combined)

    // Sort
    combined = sortArticles(combined, sort)

    // Apply sort direction for numeric sorts when requested
    if (sortDir === 'asc' && (sort === 'year' || sort === 'citedBy')) {
      combined = combined.reverse()
    }

    // Paginate
    const start = (page - 1) * perPage
    const paginatedArticles = combined.slice(start, start + perPage)

    const response: SearchResponse = {
      articles: paginatedArticles,
      total: combined.length,
      page,
      perPage,
      hasMore: start + perPage < combined.length,
    }

    // Cache the result
    searchCache.set(cacheKey, { data: response, timestamp: Date.now() })

    // Cleanup old cache entries
    if (searchCache.size > 100) {
      const oldest = Array.from(searchCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)[0]
      searchCache.delete(oldest[0])
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[ResearchFinder] Search API error:', error)
    return NextResponse.json(
      { error: 'Search failed. Please try again.' },
      { status: 500 }
    )
  }
}
