import { NextRequest, NextResponse } from 'next/server'
import type { ResearchArticle, SearchResponse } from '@/lib/types'
import { parseSearchSyntax } from '@/lib/utils'

const searchCache = new Map<string, { data: SearchResponse; timestamp: number }>()
const CACHE_TTL = 60 * 1000

interface OpenAlexWork {
  id: string
  title: string
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
}

type SourceErrorCode = 'rate_limit' | 'upstream' | 'network'

interface SourceResult {
  articles: ResearchArticle[]
  total: number
  errorCode?: SourceErrorCode
}

interface ParsedRequestQuery {
  effectiveQuery: string
  author?: string
  yearFrom?: number
  yearTo?: number
  phrases: string[]
}

function normalizeDoi(doi: string): string {
  return doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:/, '')
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function deduplicateArticles(articles: ResearchArticle[]): ResearchArticle[] {
  const seen = new Map<string, ResearchArticle>()
  for (const article of articles) {
    const titleKey = normalizeText(article.title)
    const composite = `${titleKey}:${article.year}`
    const key = article.doi ? `doi:${article.doi}` : `text:${composite}`

    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, article)
      continue
    }

    const preferred = existing.openAccess ? existing : article
    if (preferred !== existing) {
      seen.set(key, preferred)
    }
  }

  return Array.from(seen.values())
}

function sortArticles(articles: ResearchArticle[], sort: 'relevance' | 'year' | 'citedBy'): ResearchArticle[] {
  const sorted = [...articles]
  if (sort === 'year') return sorted.sort((a, b) => b.year - a.year)
  if (sort === 'citedBy') return sorted.sort((a, b) => b.citedBy - a.citedBy)
  return sorted
}

function inferRelevanceReasons(article: ResearchArticle, parsed: ParsedRequestQuery, oaOnly: boolean): string[] {
  const reasons: string[] = []
  const title = normalizeText(article.title)
  const venue = normalizeText(article.venue || '')
  const authorJoined = normalizeText(article.authors.join(' '))

  const terms = parsed.effectiveQuery
    .split(/\s+/)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 2)

  const matchedTerms = terms.filter((term) => title.includes(term) || venue.includes(term))
  if (matchedTerms.length > 0) {
    reasons.push(`Matched keywords: ${matchedTerms.slice(0, 3).join(', ')}`)
  }

  if (parsed.phrases.some((phrase) => title.includes(normalizeText(phrase)))) {
    reasons.push('Contains exact phrase')
  }

  if (parsed.author && authorJoined.includes(normalizeText(parsed.author))) {
    reasons.push(`Author match: ${parsed.author}`)
  }

  if ((parsed.yearFrom && article.year >= parsed.yearFrom) || (parsed.yearTo && article.year <= parsed.yearTo)) {
    reasons.push('Matches year filter')
  }

  if (oaOnly && article.openAccess) {
    reasons.push('Open access match')
  }

  return reasons.slice(0, 3)
}

async function fetchOpenAlex(
  query: string,
  page: number,
  perPage: number,
  yearFrom?: number,
  yearTo?: number,
  oaOnly?: boolean,
  documentType?: string
): Promise<SourceResult> {
  try {
    const filterParts: string[] = []
    if (yearFrom) filterParts.push(`publication_year:>=${yearFrom}`)
    if (yearTo) filterParts.push(`publication_year:<=${yearTo}`)
    if (oaOnly) filterParts.push('open_access.is_oa:true')
    if (documentType) {
      const typeMap: Record<string, string> = {
        journal: 'journal-article',
        conference: 'proceedings-article',
        preprint: 'preprint',
        book: 'book',
      }
      const mapped = typeMap[documentType]
      if (mapped) filterParts.push(`type:${mapped}`)
    }

    const filter = filterParts.length > 0 ? `&filter=${filterParts.join(',')}` : ''
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&page=${page}&per-page=${perPage}${filter}&sort=-publication_year`
    const response = await fetch(url, { next: { revalidate: 60 } })

    if (!response.ok) {
      return {
        articles: [],
        total: 0,
        errorCode: response.status === 429 ? 'rate_limit' : 'upstream',
      }
    }

    const data = await response.json()
    const articles: ResearchArticle[] = (data.results || []).map((work: OpenAlexWork) => ({
      id: work.id,
      title: work.title,
      authors: work.authorships.slice(0, 5).map((a) => a.author.display_name),
      year: work.publication_year,
      venue: work.host_venue?.display_name,
      doi: work.doi ? normalizeDoi(work.doi) : undefined,
      url: work.landing_page_url,
      citedBy: work.cited_by_count,
      openAccess: work.open_access.is_oa,
      source: 'openAlex',
    }))

    return { articles, total: data.meta?.count || 0 }
  } catch (error) {
    console.error('[ResearchFinder] OpenAlex fetch error:', error)
    return { articles: [], total: 0, errorCode: 'network' }
  }
}

async function fetchCrossref(
  query: string,
  page: number,
  perPage: number,
  yearFrom?: number,
  yearTo?: number
): Promise<SourceResult> {
  try {
    const offset = (page - 1) * perPage
    let url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&offset=${offset}&rows=${perPage}&sort=relevance`
    if (yearFrom) url += `&filter=from-pub-date:${yearFrom}-01-01`
    if (yearTo) url += `${yearFrom ? ',' : '&filter='}until-pub-date:${yearTo}-12-31`

    const response = await fetch(url, { next: { revalidate: 60 } })
    if (!response.ok) {
      return {
        articles: [],
        total: 0,
        errorCode: response.status === 429 ? 'rate_limit' : 'upstream',
      }
    }

    const data = await response.json()
    const articles: ResearchArticle[] = (data.message?.items || []).map((item: CrossrefArticle, index: number) => ({
      id: item.DOI || `crossref-${offset + index}`,
      title: item.title?.[0] || 'Untitled',
      authors: (item.author || []).slice(0, 5).map((a) => `${a.given || ''} ${a.family || ''}`.trim()),
      year: item.published?.['date-parts']?.[0]?.[0] || new Date().getFullYear(),
      venue: item.container?.title,
      doi: item.DOI ? normalizeDoi(item.DOI) : undefined,
      url: item.URL,
      citedBy: item.is_referenced_by_count || 0,
      openAccess: false,
      source: 'crossref',
    }))

    return { articles, total: data.message?.['total-results'] || 0 }
  } catch (error) {
    console.error('[ResearchFinder] Crossref fetch error:', error)
    return { articles: [], total: 0, errorCode: 'network' }
  }
}

function mergeYearBound(uiYearFrom?: number, uiYearTo?: number, syntaxYearFrom?: number, syntaxYearTo?: number) {
  const yearFrom = uiYearFrom && syntaxYearFrom ? Math.max(uiYearFrom, syntaxYearFrom) : (uiYearFrom ?? syntaxYearFrom)
  const yearTo = uiYearTo && syntaxYearTo ? Math.min(uiYearTo, syntaxYearTo) : (uiYearTo ?? syntaxYearTo)
  return { yearFrom, yearTo }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const rawQuery = searchParams.get('q')?.trim() || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const perPage = Math.min(25, Math.max(1, parseInt(searchParams.get('perPage') || '10', 10)))
    const uiYearFrom = searchParams.get('yearFrom') ? parseInt(searchParams.get('yearFrom')!, 10) : undefined
    const uiYearTo = searchParams.get('yearTo') ? parseInt(searchParams.get('yearTo')!, 10) : undefined
    const oaOnly = searchParams.get('oaOnly') === 'true'
    const sort = (searchParams.get('sort') || 'relevance') as 'relevance' | 'year' | 'citedBy'
    const sortDir = (searchParams.get('sortDir') || 'desc') as 'asc' | 'desc'
    const documentType = searchParams.get('documentType') || undefined
    const language = searchParams.get('language') || undefined

    if (!rawQuery) {
      return NextResponse.json({ error: 'Please enter a search query.', code: 'EMPTY_QUERY' }, { status: 400 })
    }

    const parsedSyntax = parseSearchSyntax(rawQuery)
    const cleanedWords = parsedSyntax.cleanedQuery.split(/\s+/).filter((word) => word.length > 0)
    const hasStructured = parsedSyntax.hasStructuredSyntax
    if (!hasStructured && cleanedWords.length < 3) {
      return NextResponse.json(
        {
          error: `Free-text search needs at least 3 words. Only ${cleanedWords.length} provided.`,
          code: 'QUERY_TOO_SHORT',
        },
        { status: 400 }
      )
    }

    const effectiveQuery = [
      parsedSyntax.cleanedQuery,
      ...parsedSyntax.phrases,
      parsedSyntax.author ? `author ${parsedSyntax.author}` : '',
    ]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    const query: ParsedRequestQuery = {
      effectiveQuery: effectiveQuery || rawQuery,
      author: parsedSyntax.author,
      yearFrom: parsedSyntax.yearFrom,
      yearTo: parsedSyntax.yearTo,
      phrases: parsedSyntax.phrases,
    }

    const { yearFrom, yearTo } = mergeYearBound(uiYearFrom, uiYearTo, query.yearFrom, query.yearTo)

    const cacheKey = `${query.effectiveQuery}:${page}:${perPage}:${yearFrom}:${yearTo}:${oaOnly}:${sort}:${sortDir}:${documentType}:${language}`
    const cached = searchCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data)
    }

    const [openAlexResult, crossrefResult] = await Promise.all([
      fetchOpenAlex(query.effectiveQuery, page, perPage, yearFrom, yearTo, oaOnly, documentType),
      fetchCrossref(query.effectiveQuery, page, perPage, yearFrom, yearTo),
    ])

    if (
      openAlexResult.articles.length === 0 &&
      crossrefResult.articles.length === 0 &&
      openAlexResult.errorCode &&
      crossrefResult.errorCode
    ) {
      const isRateLimited = openAlexResult.errorCode === 'rate_limit' || crossrefResult.errorCode === 'rate_limit'
      return NextResponse.json(
        {
          error: isRateLimited
            ? 'Search sources are rate-limited. Please wait a moment and retry.'
            : 'Search sources are temporarily unavailable. Please retry shortly.',
          code: isRateLimited ? 'RATE_LIMITED' : 'UPSTREAM_UNAVAILABLE',
        },
        { status: isRateLimited ? 429 : 503 }
      )
    }

    const warnings: string[] = []
    if (openAlexResult.errorCode) warnings.push('OpenAlex source temporarily unavailable.')
    if (crossrefResult.errorCode) warnings.push('Crossref source temporarily unavailable.')

    let combined = [...openAlexResult.articles, ...crossrefResult.articles]

    if (query.author) {
      const authorNeedle = normalizeText(query.author)
      combined = combined.filter((article) => normalizeText(article.authors.join(' ')).includes(authorNeedle))
    }

    if (query.phrases.length > 0) {
      const phraseNeedles = query.phrases.map((phrase) => normalizeText(phrase))
      combined = combined.filter((article) => {
        const title = normalizeText(article.title)
        return phraseNeedles.some((phrase) => title.includes(phrase))
      })
    }

    if (oaOnly) combined = combined.filter((article) => article.openAccess)
    combined = deduplicateArticles(combined)
    combined = combined.map((article) => ({ ...article, relevanceReasons: inferRelevanceReasons(article, query, oaOnly) }))
    combined = sortArticles(combined, sort)
    if (sortDir === 'asc' && (sort === 'year' || sort === 'citedBy')) {
      combined.reverse()
    }

    const start = (page - 1) * perPage
    const paginatedArticles = combined.slice(start, start + perPage)
    const response: SearchResponse = {
      articles: paginatedArticles,
      total: combined.length,
      page,
      perPage,
      hasMore: start + perPage < combined.length,
      warnings: warnings.length > 0 ? warnings : undefined,
    }

    searchCache.set(cacheKey, { data: response, timestamp: Date.now() })
    if (searchCache.size > 100) {
      const oldest = Array.from(searchCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)[0]
      searchCache.delete(oldest[0])
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[ResearchFinder] Search API error:', error)
    return NextResponse.json(
      { error: 'Unexpected server error while searching. Please retry.', code: 'SEARCH_FAILED' },
      { status: 500 }
    )
  }
}
