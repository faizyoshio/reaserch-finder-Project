import { NextRequest, NextResponse } from 'next/server'
import type { ResearchArticle, SearchResponse } from '@/lib/types'
import { parseSearchSyntax, safeHttpUrl } from '@/lib/utils'
import { corsPreflightResponse, rejectIfCorsDisallowed, withCors } from '@/lib/server/cors'
import { fetchWithRedirectAllowlist } from '@/lib/server/safe-fetch'

const searchCache = new Map<string, { data: SearchResponse; timestamp: number }>()
const CACHE_TTL = 60 * 1000

const OPENALEX_ALLOWED_HOSTS = ['api.openalex.org'] as const
const CROSSREF_ALLOWED_HOSTS = ['api.crossref.org'] as const
const OPENALEX_SELECT = [
  'id',
  'title',
  'authorships',
  'publication_year',
  'primary_location',
  'doi',
  'open_access',
  'cited_by_count',
  'abstract_inverted_index',
  'relevance_score',
  'type',
].join(',')

type AbstractInvertedIndex = Record<string, number[]>

interface OpenAlexWork {
  id: string
  title: string
  authorships: Array<{ author: { display_name: string } }>
  publication_year: number
  primary_location?: {
    is_oa?: boolean
    landing_page_url?: string
    pdf_url?: string
    source?: {
      display_name?: string
    }
  }
  doi: string
  open_access?: { is_oa?: boolean; oa_url?: string }
  cited_by_count: number
  abstract_inverted_index?: AbstractInvertedIndex
  relevance_score?: number
  type?: string
}

interface OpenAlexWorksResponse {
  meta?: { count?: number }
  results?: OpenAlexWork[]
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

interface DiseaseProfile {
  canonical: string
  primaryKeyword: string
  conceptId?: string
  validationRegex: RegExp
}

interface CountryProfile {
  name: string
  countryCode: string
  keywords: string[]
}

interface ProcessedQuery {
  originalQuery: string
  cleanedQuery: string
  extractedKeywords: string[]
  translatedKeywords: string[]
  disease?: DiseaseProfile
  country?: CountryProfile
  secondaryGroups: string[][]
}

const INDONESIAN_STOPWORDS = new Set([
  'dan',
  'atau',
  'yang',
  'dari',
  'di',
  'ke',
  'pada',
  'untuk',
  'dengan',
  'dalam',
  'sebagai',
  'oleh',
  'guna',
  'agar',
  'karena',
  'sehingga',
  'tersebut',
  'ini',
  'itu',
  'suatu',
  'sebuah',
  'para',
  'lebih',
  'kurang',
  'sangat',
  'juga',
  'atau',
  'the',
  'a',
  'an',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
])

// Generic academic terms that reduce precision for scientific retrieval.
const GENERIC_ACADEMIC_TERMS_ID = new Set([
  'analisis',
  'studi',
  'pengaruh',
  'hubungan',
  'faktor',
  'tingkat',
  'kajian',
  'bahaya',
  'terhadap',
  'penelitian',
  'metode',
  'pendekatan',
  'evaluasi',
  'tinjauan',
  'review',
  'literatur',
])

const COUNTRY_PROFILES: CountryProfile[] = [
  { name: 'Indonesia', countryCode: 'ID', keywords: ['indonesia'] },
]

// Disease concepts: keep small and focused; can be extended over time.
const DISEASE_PROFILES: DiseaseProfile[] = [
  {
    canonical: 'HIV',
    primaryKeyword: 'hiv',
    conceptId: 'C3013748606', // Human immunodeficiency virus (HIV)
    validationRegex: /(?:\bhiv\b|h\.?i\.?v\.?)/i,
  },
]

const EPIDEMIOLOGY_TRANSLATIONS: Record<string, string[]> = {
  // Indonesian -> English (domain-aware)
  persebaran: ['transmission', 'spread', 'prevalence'],
  penyebaran: ['transmission', 'spread', 'prevalence'],
  penularan: ['transmission'],
  prevalensi: ['prevalence'],
  'angka_kejadian': ['incidence'],
  kejadian: ['incidence'],
  kematian: ['mortality'],
  epidemiologi: ['epidemiology'],
}

function normalizeKeywordToken(token: string): string {
  const cleaned = token.trim()
  if (!cleaned) return ''
  const lower = cleaned.toLowerCase()
  if (lower === 'hiv') return 'HIV'
  return lower
}

function normalizeQueryForKeywords(input: string): string {
  return input
    .toLowerCase()
    .replace(/\bangka\s+kejadian\b/g, 'angka_kejadian')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeKeywords(input: string): string[] {
  if (!input) return []
  return input
    .replace(/[^a-z0-9_\s-]+/gi, ' ')
    .replace(/[-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean)
}

function uniquePreserveOrder(items: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (!item) continue
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function buildAbstractFromInvertedIndex(index?: AbstractInvertedIndex): string | undefined {
  if (!index) return undefined
  const wordsByPos: string[] = []
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) {
      if (!Number.isFinite(pos)) continue
      wordsByPos[pos] = word
    }
  }

  const abstract = wordsByPos.filter(Boolean).join(' ').trim()
  return abstract || undefined
}

function detectDiseaseProfile(extractedKeywords: string[]): DiseaseProfile | undefined {
  const lower = extractedKeywords.map((k) => k.toLowerCase())
  return DISEASE_PROFILES.find((profile) => lower.includes(profile.primaryKeyword))
}

function detectCountryProfile(extractedKeywords: string[]): CountryProfile | undefined {
  const lower = extractedKeywords.map((k) => k.toLowerCase())
  return COUNTRY_PROFILES.find((profile) => profile.keywords.some((kw) => lower.includes(kw)))
}

function scoreSecondaryGroup(sourceKeyword: string): number {
  const lower = sourceKeyword.toLowerCase()
  let score = 0
  if (EPIDEMIOLOGY_TRANSLATIONS[lower]) score += 10
  if (lower.length >= 7) score += 2
  if (/\d/.test(lower)) score -= 2
  return score
}

function processQueryForOpenAlex(originalQuery: string, cleanedQuery: string, phrases: string[]): ProcessedQuery {
  const normalized = normalizeQueryForKeywords(cleanedQuery || originalQuery)
  const phraseText = phrases.join(' ')
  const allTokens = tokenizeKeywords(`${normalized} ${phraseText}`)

  let extracted = uniquePreserveOrder(
    allTokens
      .map((t) => t.toLowerCase())
      .filter((t) => t.length >= 2)
      .filter((t) => !INDONESIAN_STOPWORDS.has(t))
      .filter((t) => !GENERIC_ACADEMIC_TERMS_ID.has(t))
  )

  const disease = detectDiseaseProfile(extracted)
  const country = detectCountryProfile(extracted)

  // Prefer domain anchors first (e.g., diseases), then context (e.g., geo).
  if (disease) {
    const rest = extracted.filter((k) => k.toLowerCase() !== disease.primaryKeyword)
    extracted = [disease.primaryKeyword, ...rest]
  }
  if (country) {
    const countrySet = new Set(country.keywords.map((k) => k.toLowerCase()))
    const nonCountry = extracted.filter((k) => !countrySet.has(k.toLowerCase()))
    const onlyCountry = extracted.filter((k) => countrySet.has(k.toLowerCase()))
    extracted = [...nonCountry, ...onlyCountry]
  }

  const secondarySource = extracted.filter((k) => {
    const lower = k.toLowerCase()
    if (disease && lower === disease.primaryKeyword) return false
    if (country && country.keywords.includes(lower)) return false
    return true
  })

  const rankedSecondary = [...secondarySource].sort((a, b) => scoreSecondaryGroup(b) - scoreSecondaryGroup(a))
  const secondaryGroups = rankedSecondary.slice(0, 2).map((keyword) => {
    const lower = keyword.toLowerCase()
    const translations = EPIDEMIOLOGY_TRANSLATIONS[lower] || []
    const group = uniquePreserveOrder([lower, ...translations])
    return group.map(normalizeKeywordToken).filter(Boolean)
  })

  const translatedKeywordList = uniquePreserveOrder([
    ...extracted.map(normalizeKeywordToken).filter(Boolean),
    ...secondaryGroups.flat(),
    ...(country ? [country.name] : []),
    ...(disease ? [disease.canonical] : []),
  ])

  return {
    originalQuery,
    cleanedQuery,
    extractedKeywords: extracted,
    translatedKeywords: translatedKeywordList,
    disease,
    country,
    secondaryGroups,
  }
}

function normalizeDoi(doi: string): string {
  return doi
    .trim()
    .replace(/\s+/g, '')
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:/i, '')
}

function isProbablyDoi(doi: string): boolean {
  if (!doi) return false
  if (doi.length > 200) return false
  if (/[\r\n\t]/.test(doi)) return false
  return /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(doi)
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

function mapOpenAlexWork(work: OpenAlexWork): { article: ResearchArticle; relevanceScore: number } {
  const abstract = buildAbstractFromInvertedIndex(work.abstract_inverted_index)
  const articleUrl =
    safeHttpUrl(work.primary_location?.landing_page_url) ||
    safeHttpUrl(work.primary_location?.pdf_url) ||
    safeHttpUrl(work.open_access?.oa_url)

  const article: ResearchArticle = {
    id: work.id,
    title: work.title,
    authors: work.authorships.slice(0, 5).map((a) => a.author.display_name),
    year: work.publication_year,
    venue: work.primary_location?.source?.display_name,
    doi: work.doi ? normalizeDoi(work.doi) : undefined,
    url: articleUrl,
    citedBy: work.cited_by_count,
    openAccess: Boolean(work.open_access?.is_oa ?? work.primary_location?.is_oa),
    source: 'openAlex',
    abstract,
    documentType: work.type,
  }

  return {
    article,
    relevanceScore: typeof work.relevance_score === 'number' ? work.relevance_score : 0,
  }
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

function buildOpenAlexBaseFilters(opts: {
  yearFrom?: number
  yearTo?: number
  oaOnly?: boolean
  documentType?: string
  language?: string
}): string[] {
  const filters: string[] = []
  const { yearFrom, yearTo, oaOnly, documentType, language } = opts

  if (yearFrom) filters.push(`publication_year:>=${yearFrom}`)
  if (yearTo) filters.push(`publication_year:<=${yearTo}`)
  if (oaOnly) filters.push('open_access.is_oa:true')

  if (documentType) {
    const typeMap: Record<string, string> = {
      journal: 'journal-article',
      conference: 'proceedings-article',
      preprint: 'preprint',
      book: 'book',
    }
    const mapped = typeMap[documentType]
    if (mapped) filters.push(`type:${mapped}`)
  }

  if (language && /^[a-z]{2}$/i.test(language)) {
    filters.push(`language:${language.toLowerCase()}`)
  }

  return filters
}

async function fetchOpenAlex(
  processed: ProcessedQuery,
  page: number,
  perPage: number,
  yearFrom?: number,
  yearTo?: number,
  oaOnly?: boolean,
  documentType?: string,
  language?: string
): Promise<SourceResult> {
  try {
    const baseFilters = buildOpenAlexBaseFilters({ yearFrom, yearTo, oaOnly, documentType, language })

    const disease = processed.disease
    const country = processed.country

    const buildUrl = (filters: string[]) => {
      const searchParams = new URLSearchParams()
      searchParams.set('page', String(page))
      searchParams.set('per-page', String(perPage))
      searchParams.set('sort', 'relevance_score:desc')
      searchParams.set('select', OPENALEX_SELECT)
      searchParams.set('filter', filters.join(','))
      return `https://api.openalex.org/works?${searchParams.toString()}`
    }

    const run = async (filters: string[]) => {
      const url = buildUrl(filters)
      const response = await fetchWithRedirectAllowlist(
        url,
        { next: { revalidate: 60 } },
        { allowedHosts: OPENALEX_ALLOWED_HOSTS, maxRedirects: 2 }
      )

      if (!response.ok) {
        return {
          url,
          ok: false as const,
          errorCode: response.status === 429 ? ('rate_limit' as const) : ('upstream' as const),
          data: null as OpenAlexWorksResponse | null,
        }
      }

      const data = (await response.json()) as OpenAlexWorksResponse
      return { url, ok: true as const, errorCode: undefined, data }
    }

    const containsDisease = (article: Pick<ResearchArticle, 'title' | 'abstract'>, profile: DiseaseProfile) => {
      const title = article.title || ''
      const abstract = article.abstract || ''
      return profile.validationRegex.test(title) || profile.validationRegex.test(abstract)
    }

    const buildAttemptFilters = (opts: {
      requireCountryInAbstract: boolean
      useInstitutionsCountryCode: boolean
      useConcept: boolean
      includeSecondaryGroups: boolean
    }) => {
      const common = [...baseFilters]
      if (opts.useConcept && disease?.conceptId) common.push(`concept.id:${disease.conceptId}`)
      if (opts.useInstitutionsCountryCode && country) common.push(`institutions.country_code:${country.countryCode}`)
      if (opts.requireCountryInAbstract && country) common.push(`abstract.search:${country.name}`)
      if (opts.includeSecondaryGroups) {
        for (const group of processed.secondaryGroups) {
          if (group.length === 0) continue
          common.push(`abstract.search:${group.join('|')}`)
        }
      }
      return common
    }

    const attempts: Array<{
      name: string
      requireCountryInAbstract: boolean
      useInstitutionsCountryCode: boolean
      useConcept: boolean
      includeSecondaryGroups: boolean
    }> = []

    if (disease) {
      const useConcept = Boolean(disease.conceptId)
      const includeSecondary = processed.secondaryGroups.length > 0

      // Keep the geo constraint whenever the user specified it (Indonesia, etc.).
      if (country) {
        attempts.push({
          name: 'strict',
          requireCountryInAbstract: true,
          useInstitutionsCountryCode: false,
          useConcept,
          includeSecondaryGroups: includeSecondary,
        })
        attempts.push({
          name: 'relax_secondary',
          requireCountryInAbstract: true,
          useInstitutionsCountryCode: false,
          useConcept,
          includeSecondaryGroups: false,
        })
        attempts.push({
          name: 'geo_institution',
          requireCountryInAbstract: false,
          useInstitutionsCountryCode: true,
          useConcept,
          includeSecondaryGroups: false,
        })
        attempts.push({
          name: 'relax_concept',
          requireCountryInAbstract: true,
          useInstitutionsCountryCode: false,
          useConcept: false,
          includeSecondaryGroups: false,
        })
        attempts.push({
          name: 'geo_institution_no_concept',
          requireCountryInAbstract: false,
          useInstitutionsCountryCode: true,
          useConcept: false,
          includeSecondaryGroups: false,
        })
      } else {
        attempts.push({
          name: 'strict',
          requireCountryInAbstract: false,
          useInstitutionsCountryCode: false,
          useConcept,
          includeSecondaryGroups: includeSecondary,
        })
        attempts.push({
          name: 'relax_secondary',
          requireCountryInAbstract: false,
          useInstitutionsCountryCode: false,
          useConcept,
          includeSecondaryGroups: false,
        })
        attempts.push({
          name: 'relax_concept',
          requireCountryInAbstract: false,
          useInstitutionsCountryCode: false,
          useConcept: false,
          includeSecondaryGroups: false,
        })
      }
    } else {
      // Non-disease queries: field-specific retrieval using the cleaned keyword string.
      attempts.push({
        name: 'keywords',
        requireCountryInAbstract: Boolean(country),
        useInstitutionsCountryCode: false,
        useConcept: false,
        includeSecondaryGroups: false,
      })

      // Alternate geo strategy for non-disease queries when a country was specified.
      if (country) {
        attempts.push({
          name: 'keywords_geo_institution',
          requireCountryInAbstract: false,
          useInstitutionsCountryCode: true,
          useConcept: false,
          includeSecondaryGroups: false,
        })
      }
    }

    let lastErrorCode: SourceErrorCode | undefined

    for (const attempt of attempts) {
      const commonFilters = buildAttemptFilters(attempt)

      const keywordString = processed.translatedKeywords
        .filter((t) => t && t.length >= 2)
        .slice(0, 6)
        .join(' ')
        .trim() || processed.cleanedQuery.trim()

      const fieldQueryTerm = disease?.canonical || keywordString
      if (!fieldQueryTerm) {
        continue
      }

      const titleFilters = [`title.search:${fieldQueryTerm}`, ...commonFilters]
      const abstractFilters = [`abstract.search:${fieldQueryTerm}`, ...commonFilters]

      const [titleRes, abstractRes] = await Promise.all([run(titleFilters), run(abstractFilters)])

      const urls = [titleRes.url, abstractRes.url]
      const titleOk = titleRes.ok
      const abstractOk = abstractRes.ok

      if (!titleOk) lastErrorCode = titleRes.errorCode
      if (!abstractOk) lastErrorCode = abstractRes.errorCode

      const titleWorks: OpenAlexWork[] = titleOk ? (titleRes.data?.results || []) : []
      const abstractWorks: OpenAlexWork[] = abstractOk ? (abstractRes.data?.results || []) : []

      const merged: Array<{ article: ResearchArticle; relevanceScore: number }> = []
      const seen = new Set<string>()

      for (const work of [...titleWorks, ...abstractWorks]) {
        const key = work.id || work.doi || work.title
        if (!key) continue
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(mapOpenAlexWork(work))
      }

      const validated = disease ? merged.filter(({ article }) => containsDisease(article, disease)) : merged
      validated.sort((a, b) => b.relevanceScore - a.relevanceScore)

      console.info('[ResearchFinder] OpenAlexSearch', {
        originalQuery: processed.originalQuery,
        cleanedQuery: processed.cleanedQuery,
        extractedKeywords: processed.extractedKeywords,
        translatedKeywords: processed.translatedKeywords,
        attempt: attempt.name,
        urls,
        resultsReturned: validated.length,
      })

      if (validated.length > 0) {
        const totalEstimate = Math.max(
          titleOk ? (titleRes.data?.meta?.count || 0) : 0,
          abstractOk ? (abstractRes.data?.meta?.count || 0) : 0
        )
        return { articles: validated.map(({ article }) => article), total: totalEstimate }
      }
    }

    // If OpenAlex responded with errors for all attempts, surface it as an upstream issue.
    if (lastErrorCode) {
      return { articles: [], total: 0, errorCode: lastErrorCode }
    }

    return { articles: [], total: 0 }
  } catch (error) {
    console.error('[ResearchFinder] OpenAlex fetch error:', error)
    return { articles: [], total: 0, errorCode: 'network' }
  }
}

async function fetchOpenAlexAdvanced(
  fields: { author?: string; title?: string; doi?: string; affiliation?: string },
  page: number,
  perPage: number,
  opts: { yearFrom?: number; yearTo?: number; oaOnly?: boolean; documentType?: string; language?: string }
): Promise<SourceResult & { url?: string; filter?: string }> {
  try {
    const author = fields.author?.trim() || ''
    const title = fields.title?.trim() || ''
    const affiliation = fields.affiliation?.trim() || ''
    const doiRaw = fields.doi?.trim() || ''
    const doi = doiRaw ? normalizeDoi(doiRaw) : ''

    const filterParts: string[] = []
    if (author) filterParts.push(`raw_author_name.search:${author}`)
    if (title) filterParts.push(`title.search:${title}`)
    if (affiliation) filterParts.push(`raw_affiliation_strings.search:${affiliation}`)
    if (doi) filterParts.push(`doi:${doi}`)

    const baseFilters = buildOpenAlexBaseFilters(opts)
    const combinedFilters = [...filterParts, ...baseFilters]

    const hasSearchFilter = Boolean(author || title || affiliation)
    // OpenAlex only supports relevance_score sorting when there is a search query (e.g. *.search filters).
    const sort = hasSearchFilter ? 'relevance_score:desc' : 'publication_year:desc'

    const requestPage = doi ? 1 : page
    const requestPerPage = doi ? 1 : perPage

    const searchParams = new URLSearchParams()
    searchParams.set('page', String(requestPage))
    searchParams.set('per-page', String(requestPerPage))
    searchParams.set('select', OPENALEX_SELECT)
    searchParams.set('sort', sort)
    searchParams.set('filter', combinedFilters.join(','))
    const url = `https://api.openalex.org/works?${searchParams.toString()}`

    const response = await fetchWithRedirectAllowlist(
      url,
      { next: { revalidate: 60 } },
      { allowedHosts: OPENALEX_ALLOWED_HOSTS, maxRedirects: 2 }
    )

    if (!response.ok) {
      return {
        articles: [],
        total: 0,
        errorCode: response.status === 429 ? 'rate_limit' : 'upstream',
        url,
        filter: combinedFilters.join(','),
      }
    }

    const data = (await response.json()) as OpenAlexWorksResponse
    const works = data.results || []

    const articles = works.map((work) => mapOpenAlexWork(work).article)

    const validated = doi ? articles.filter((a) => (a.doi || '').toLowerCase() === doi.toLowerCase()) : articles

    if (process.env.NODE_ENV !== 'production') {
      console.info('[ResearchFinder] OpenAlexAdvancedSearch', {
        mode: 'advanced',
        fields: { author, title, affiliation, doi: doi || undefined },
        filter: combinedFilters.join(','),
        url,
        resultsReturned: validated.length,
      })
    }

    return {
      articles: validated,
      total: data.meta?.count || validated.length,
      url,
      filter: combinedFilters.join(','),
    }
  } catch (error) {
    console.error('[ResearchFinder] OpenAlex advanced fetch error:', error)
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

    const response = await fetchWithRedirectAllowlist(
      url,
      { next: { revalidate: 60 } },
      { allowedHosts: CROSSREF_ALLOWED_HOSTS, maxRedirects: 2 }
    )
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
      url: safeHttpUrl(item.URL),
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
  const corsRejection = rejectIfCorsDisallowed(request)
  if (corsRejection) return corsRejection

  const json = (body: unknown, init?: ResponseInit) => withCors(request, NextResponse.json(body, init))

  try {
    const searchParams = request.nextUrl.searchParams
    const rawQuery = searchParams.get('q')?.trim() || ''

    const MAX_PAGE = 25
    const pageRaw = parseInt(searchParams.get('page') || '1', 10)
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.min(MAX_PAGE, pageRaw)) : 1
    if (pageRaw > MAX_PAGE) {
      return json({ error: `Page limit exceeded (max ${MAX_PAGE}).`, code: 'PAGE_LIMIT' }, { status: 400 })
    }
    const perPageRaw = parseInt(searchParams.get('perPage') || '10', 10)
    const perPageParsed = Number.isFinite(perPageRaw) ? perPageRaw : 10
    const perPage = Math.min(25, Math.max(1, perPageParsed))
    const uiYearFrom = searchParams.get('yearFrom') ? parseInt(searchParams.get('yearFrom')!, 10) : undefined
    const uiYearTo = searchParams.get('yearTo') ? parseInt(searchParams.get('yearTo')!, 10) : undefined
    const oaOnly = searchParams.get('oaOnly') === 'true'
    const sortParam = (searchParams.get('sort') || 'relevance').toLowerCase()
    const sort: 'relevance' | 'year' | 'citedBy' =
      sortParam === 'year' || sortParam === 'citedby' ? (sortParam === 'citedby' ? 'citedBy' : 'year') : 'relevance'
    const sortDirParam = (searchParams.get('sortDir') || 'desc').toLowerCase()
    const sortDir: 'asc' | 'desc' = sortDirParam === 'asc' ? 'asc' : 'desc'
    const documentType = searchParams.get('documentType') || undefined
    const language = searchParams.get('language') || undefined

    const modeParam = (searchParams.get('mode') || '').toLowerCase()
    const advancedFields = {
      author: searchParams.get('author')?.trim() || '',
      title: searchParams.get('title')?.trim() || '',
      doi: searchParams.get('doi')?.trim() || '',
      affiliation: searchParams.get('affiliation')?.trim() || '',
    }
    const isAdvanced =
      modeParam === 'advanced' ||
      Boolean(advancedFields.author || advancedFields.title || advancedFields.doi || advancedFields.affiliation)

    if (!isAdvanced && rawQuery.length > 500) {
      return json({ error: 'Search query too long.', code: 'QUERY_TOO_LONG' }, { status: 400 })
    }

    if (isAdvanced) {
      if (
        !advancedFields.author &&
        !advancedFields.title &&
        !advancedFields.doi &&
        !advancedFields.affiliation
      ) {
        return json({ error: 'Enter at least one advanced field.', code: 'ADVANCED_EMPTY' }, { status: 400 })
      }

      const MAX_FIELD = 300
      for (const [key, value] of Object.entries(advancedFields)) {
        if (value.length > MAX_FIELD) {
          return json({ error: `Advanced field too long: ${key}`, code: 'ADVANCED_FIELD_TOO_LONG' }, { status: 400 })
        }
      }

      const normalizedDoi = advancedFields.doi ? normalizeDoi(advancedFields.doi) : ''
      if (advancedFields.doi && !isProbablyDoi(normalizedDoi)) {
        return json({ error: 'Invalid DOI format.', code: 'INVALID_DOI' }, { status: 400 })
      }

      const effectivePage = normalizedDoi ? 1 : page
      const effectivePerPage = normalizedDoi ? 1 : perPage

      const cacheKey = `advanced:${advancedFields.author}:${advancedFields.title}:${normalizedDoi}:${advancedFields.affiliation}:${effectivePage}:${effectivePerPage}:${uiYearFrom}:${uiYearTo}:${oaOnly}:${sort}:${sortDir}:${documentType}:${language}`
      const cached = searchCache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return json(cached.data)
      }

      const openAlexResult = await fetchOpenAlexAdvanced(
        {
          author: advancedFields.author || undefined,
          title: advancedFields.title || undefined,
          doi: normalizedDoi || undefined,
          affiliation: advancedFields.affiliation || undefined,
        },
        effectivePage,
        effectivePerPage,
        { yearFrom: uiYearFrom, yearTo: uiYearTo, oaOnly, documentType, language }
      )

      if (openAlexResult.articles.length === 0 && openAlexResult.errorCode) {
        const isRateLimited = openAlexResult.errorCode === 'rate_limit'
        return json(
          {
            error: isRateLimited
              ? 'Search sources are rate-limited. Please wait a moment and retry.'
              : 'Search sources are temporarily unavailable. Please retry shortly.',
            code: isRateLimited ? 'RATE_LIMITED' : 'UPSTREAM_UNAVAILABLE',
          },
          { status: isRateLimited ? 429 : 503 }
        )
      }

      let combined = [...openAlexResult.articles]
      if (oaOnly) combined = combined.filter((article) => article.openAccess)
      combined = deduplicateArticles(combined)

      // Author exact match boosting (only in relevance mode).
      if (sort === 'relevance' && advancedFields.author) {
        const needle = normalizeText(advancedFields.author)
        const scored = combined.map((article, idx) => ({
          article,
          idx,
          exact: article.authors.some((a) => normalizeText(a) === needle) ? 1 : 0,
        }))
        scored.sort((a, b) => b.exact - a.exact || a.idx - b.idx)
        combined = scored.map((s) => s.article)
      }

      const pseudoQuery: ParsedRequestQuery = {
        effectiveQuery: [advancedFields.title, advancedFields.author, advancedFields.affiliation, normalizedDoi]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
        author: advancedFields.author || undefined,
        yearFrom: uiYearFrom,
        yearTo: uiYearTo,
        phrases: [],
      }

      combined = combined.map((article) => ({ ...article, relevanceReasons: inferRelevanceReasons(article, pseudoQuery, oaOnly) }))
      combined = sortArticles(combined, sort)
      if (sortDir === 'asc' && (sort === 'year' || sort === 'citedBy')) {
        combined.reverse()
      }

      const paginatedArticles = combined.slice(0, effectivePerPage)
      const totalEstimate = openAlexResult.total || paginatedArticles.length

      const response: SearchResponse = {
        articles: paginatedArticles,
        total: totalEstimate,
        page: effectivePage,
        perPage: effectivePerPage,
        hasMore: totalEstimate > effectivePage * effectivePerPage,
      }

      searchCache.set(cacheKey, { data: response, timestamp: Date.now() })
      if (searchCache.size > 100) {
        const oldest = Array.from(searchCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)[0]
        searchCache.delete(oldest[0])
      }

      return json(response)
    }

    if (!rawQuery) {
      return json({ error: 'Please enter a search query.', code: 'EMPTY_QUERY' }, { status: 400 })
    }

    const parsedSyntax = parseSearchSyntax(rawQuery)
    const cleanedWords = parsedSyntax.cleanedQuery.split(/\s+/).filter((word) => word.length > 0)
    const hasStructured = parsedSyntax.hasStructuredSyntax
    if (!hasStructured && cleanedWords.length < 3) {
      return json(
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
    const processedForOpenAlex = processQueryForOpenAlex(rawQuery, parsedSyntax.cleanedQuery, parsedSyntax.phrases)

    const cacheKey = `${query.effectiveQuery}:${page}:${perPage}:${yearFrom}:${yearTo}:${oaOnly}:${sort}:${sortDir}:${documentType}:${language}`
    const cached = searchCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return json(cached.data)
    }

    const [openAlexResult, crossrefResult] = await Promise.all([
      fetchOpenAlex(processedForOpenAlex, page, perPage, yearFrom, yearTo, oaOnly, documentType, language),
      fetchCrossref(query.effectiveQuery, page, perPage, yearFrom, yearTo),
    ])

    if (
      openAlexResult.articles.length === 0 &&
      crossrefResult.articles.length === 0 &&
      openAlexResult.errorCode &&
      crossrefResult.errorCode
    ) {
      const isRateLimited = openAlexResult.errorCode === 'rate_limit' || crossrefResult.errorCode === 'rate_limit'
      return json(
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

    // Strict result validation for disease-focused queries: never surface results that
    // don't explicitly mention the primary disease term in title or abstract.
    if (processedForOpenAlex.disease) {
      const diseaseRe = processedForOpenAlex.disease.validationRegex
      combined = combined.filter((article) => diseaseRe.test(article.title) || diseaseRe.test(article.abstract || ''))
    }

    // Crossref does not provide reliable affiliations/geo metadata here; avoid polluting
    // geo-scoped queries with unrelated global studies.
    if (processedForOpenAlex.country) {
      const countryNeedle = processedForOpenAlex.country.name.toLowerCase()
      combined = combined.filter((article) => {
        if (article.source !== 'crossref') return true
        const title = normalizeText(article.title)
        const abstract = normalizeText(article.abstract || '')
        return title.includes(countryNeedle) || abstract.includes(countryNeedle)
      })
    }

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

    // Each upstream source is already paginated by `page`/`perPage`. After merging/deduping/sorting,
    // return up to `perPage` articles for this page.
    const paginatedArticles = combined.slice(0, perPage)
    const totalEstimate =
      processedForOpenAlex.disease || processedForOpenAlex.country
        ? openAlexResult.total || paginatedArticles.length
        : openAlexResult.total + crossrefResult.total
    const response: SearchResponse = {
      articles: paginatedArticles,
      total: totalEstimate,
      page,
      perPage,
      hasMore: totalEstimate > page * perPage,
      warnings: warnings.length > 0 ? warnings : undefined,
    }

    searchCache.set(cacheKey, { data: response, timestamp: Date.now() })
    if (searchCache.size > 100) {
      const oldest = Array.from(searchCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)[0]
      searchCache.delete(oldest[0])
    }

    return json(response)
  } catch (error) {
    console.error('[ResearchFinder] Search API error:', error)
    return json({ error: 'Unexpected server error while searching. Please retry.', code: 'SEARCH_FAILED' }, { status: 500 })
  }
}

export function OPTIONS(request: NextRequest) {
  return corsPreflightResponse(request)
}
