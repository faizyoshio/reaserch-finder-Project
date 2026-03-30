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
  phrases: string[]
  extractedKeywords: string[]
  translatedKeywords: string[]
  disease?: DiseaseProfile
  country?: CountryProfile
  secondaryGroups: string[][]
}

type OpenAlexPlannerIntent =
  | 'source_lookup'
  | 'work_lookup'
  | 'constrained_work_search'
  | 'direct_id_lookup'
  | 'ambiguous'

type OpenAlexConstraintKind = 'author' | 'institution' | 'source' | 'topic' | 'publisher' | 'funder'

interface PlannerQueryVariant {
  rank: number
  variant: string
  language: string
  script: string
  why: string
}

interface PlannerLanguageConstraint {
  rawValue: string
  normalizedName: string
  iso639_1?: string
  script: string
  requiresResolution: boolean
}

interface OpenAlexPlannerRequestParams {
  search?: string
  'search.exact'?: string
  'search.semantic'?: string
  filter?: string
  per_page?: number
  select?: string
}

interface OpenAlexPlannerRequest {
  rank: number
  label: string
  method: 'GET'
  endpoint: string
  params: OpenAlexPlannerRequestParams
  notes: string
}

interface OpenAlexPlannerResponse {
  intent: OpenAlexPlannerIntent
  detected_query_language: string
  detected_script: string
  reasoning: string
  query_variants: PlannerQueryVariant[]
  requests: OpenAlexPlannerRequest[]
  fallback_strategy: string[]
}

interface PlannerConstraint {
  kind: OpenAlexConstraintKind
  rawValue: string
  endpoint: '/authors' | '/institutions' | '/sources' | '/topics' | '/publishers' | '/funders'
  filterKey:
    | 'authorships.author.id'
    | 'authorships.institutions.id'
    | 'primary_location.source.id'
    | 'topics.id'
    | 'primary_location.source.host_organization'
    | 'funders.id'
  select: string
  placeholder: string
}

interface PlannerAnalysis {
  rawQuery: string
  normalizedQuery: string
  coreQuery: string
  exactTitleCandidate?: string
  detectedQueryLanguage: string
  detectedScript: string
  explicitSource: boolean
  explicitBook: boolean
  explicitArticle: boolean
  broadTopic: boolean
  looksLikeSource: boolean
  looksLikeWork: boolean
  queryVariants: PlannerQueryVariant[]
  requestedLanguage?: PlannerLanguageConstraint
  yearFrom?: number
  yearTo?: number
  constraints: PlannerConstraint[]
}

interface QueryValidationGroup {
  label: string
  primaryTerms: string[]
  expandedTerms: string[]
  regex?: RegExp
  required?: boolean
}

interface ArticleQueryMatch {
  coreOk: boolean
  exactPhrase: boolean
  fullQueryInTitle: boolean
  fullQueryInText: boolean
  matchedGroups: number
  originalMatches: number
  titleMatches: number
  score: number
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

const OPENALEX_PLANNER_WORKS_SELECT = [
  'id',
  'display_name',
  'doi',
  'publication_year',
  'primary_location',
  'cited_by_count',
  'relevance_score',
  'type',
].join(',')

const OPENALEX_PLANNER_SOURCES_SELECT = ['id', 'display_name', 'issn_l', 'type', 'works_count', 'cited_by_count'].join(
  ','
)

const OPENALEX_PLANNER_AUTHORS_SELECT = ['id', 'display_name', 'orcid', 'works_count', 'cited_by_count'].join(',')

const OPENALEX_PLANNER_INSTITUTIONS_SELECT = [
  'id',
  'display_name',
  'country_code',
  'type',
  'works_count',
  'cited_by_count',
].join(',')

const OPENALEX_PLANNER_TOPICS_SELECT = ['id', 'display_name', 'description', 'works_count'].join(',')

const OPENALEX_PLANNER_PUBLISHERS_SELECT = ['id', 'display_name', 'hierarchy_level', 'works_count', 'cited_by_count'].join(
  ','
)

const OPENALEX_PLANNER_FUNDERS_SELECT = ['id', 'display_name', 'works_count', 'cited_by_count'].join(',')

const OPENALEX_PLANNER_LANGUAGES_SELECT = ['id', 'display_name', 'works_count', 'cited_by_count', 'works_api_url'].join(
  ','
)

const PLANNER_TITLE_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'is',
  'are',
  'to',
  'in',
  'on',
  'for',
  'from',
  'by',
  'all',
  'you',
])

const PLANNER_CANONICAL_SOURCE_NAMES = new Set([
  'nature',
  'science',
  'cell',
  'the lancet',
  'lancet',
  'bmj',
  'nejm',
  'jama',
  'plos one',
  'arxiv',
  'biorxiv',
  'medrxiv',
])

const PLANNER_BROAD_TOPIC_CUES = [
  'impact of',
  'effects of',
  'relationship between',
  'role of',
  'applications of',
  'methods for',
  'state of the art',
  'machine learning in',
  'deep learning for',
  'systematic review of',
]

const PLANNER_LEAD_IN_TERMS = [
  'please',
  'tolong',
  'search',
  'find',
  'lookup',
  'look up',
  'show',
  'show me',
  'cari',
  'carikan',
  'buscar',
  'rechercher',
  'suchen',
  'найти',
  'поиск',
  'ابحث',
  '搜索',
  '查找',
  '検索',
  '찾기',
]

const PLANNER_SOURCE_CUES = [
  'journal',
  'jurnal',
  'source',
  'venue',
  'conference',
  'repository',
  'revista',
  'revue',
  'zeitschrift',
  'журнал',
  'مجلة',
  '期刊',
  '雑誌',
  '저널',
]

const PLANNER_WORK_CUES = [
  'paper',
  'papers',
  'article',
  'articles',
  'artikel',
  'makalah',
  'book',
  'books',
  'buku',
  'ebook',
  'e-book',
  'preprint',
  'revista',
  'статья',
  'книга',
  'книги',
  'مقالة',
  'مقالات',
  'بحث',
  'أبحاث',
  'ورقة',
  'كتاب',
  '论文',
  '文章',
  '书',
  '書',
  '論文',
  '記事',
  '本',
  '논문',
  '기사',
  '책',
]

const PLANNER_TOPIC_CUES = [
  'about',
  'tentang',
  'mengenai',
  'sobre',
  'sur',
  'uber',
  'über',
  'о',
  'про',
  'عن',
  'حول',
  '关于',
  '關於',
  'について',
  'に関する',
]

const PLANNER_LANGUAGE_CUE_PATTERNS = [
  /\b(?:in|written in|results? in|language)\s+([a-z\u00c0-\u024f' -]+)\b/iu,
  /\b(?:dalam bahasa|bahasa|berbahasa)\s+([a-z\u00c0-\u024f' -]+)\b/iu,
  /\b(?:en|idioma)\s+([a-z\u00c0-\u024f' -]+)\b/iu,
  /\b(?:auf)\s+([a-z\u00c0-\u024f' -]+)\b/iu,
  /\b(?:на)\s+([а-яё -]+)\b/iu,
  /(?:باللغة|بالعربية)\s+([ء-ي ]+)/u,
  /(日本語で|日本語の)/u,
  /(한국어로|한국어)/u,
]

const PLANNER_LATIN_LANGUAGE_HINTS: Array<{ label: string; patterns: RegExp[] }> = [
  {
    label: 'Indonesian',
    patterns: [/\b(?:tentang|bahasa|dari|dalam|jurnal|buku|artikel)\b/i],
  },
  {
    label: 'English',
    patterns: [/\b(?:about|journal|paper|book|article|find|search|look up)\b/i],
  },
  {
    label: 'Spanish',
    patterns: [/\b(?:revista|articulo|artículo|libro|sobre|idioma)\b/i],
  },
  {
    label: 'French',
    patterns: [/\b(?:revue|livre|langue)\b/i],
  },
  {
    label: 'German',
    patterns: [/\b(?:zeitschrift|buch|sprache|uber|über)\b/i],
  },
  {
    label: 'Portuguese',
    patterns: [/\b(?:artigo|livro|portugues|português)\b/i],
  },
]

const PLANNER_LANGUAGE_ALIASES: Array<{
  code: string
  label: string
  script: string
  names: string[]
  nativePatterns?: RegExp[]
}> = [
  {
    code: 'ar',
    label: 'Arabic',
    script: 'Arabic',
    names: ['arabic', 'bahasa arab', 'arab'],
    nativePatterns: [/باللغة العربية/u, /بالعربية/u],
  },
  {
    code: 'de',
    label: 'German',
    script: 'Latin',
    names: ['german', 'deutsch', 'bahasa jerman'],
  },
  {
    code: 'en',
    label: 'English',
    script: 'Latin',
    names: ['english', 'bahasa inggris', 'inggris'],
    nativePatterns: [/英語/u],
  },
  {
    code: 'es',
    label: 'Spanish',
    script: 'Latin',
    names: ['spanish', 'espanol', 'español', 'bahasa spanyol'],
  },
  {
    code: 'fr',
    label: 'French',
    script: 'Latin',
    names: ['french', 'francais', 'français', 'bahasa prancis'],
  },
  {
    code: 'id',
    label: 'Indonesian',
    script: 'Latin',
    names: ['indonesian', 'bahasa indonesia', 'indonesia'],
  },
  {
    code: 'ja',
    label: 'Japanese',
    script: 'Japanese',
    names: ['japanese', 'jepang', 'bahasa jepang'],
    nativePatterns: [/日本語で/u, /日本語の/u],
  },
  {
    code: 'ko',
    label: 'Korean',
    script: 'Korean',
    names: ['korean', 'bahasa korea', 'korea'],
    nativePatterns: [/한국어로/u],
  },
  {
    code: 'pt',
    label: 'Portuguese',
    script: 'Latin',
    names: ['portuguese', 'portugues', 'português', 'bahasa portugis'],
  },
  {
    code: 'ru',
    label: 'Russian',
    script: 'Cyrillic',
    names: ['russian', 'bahasa rusia', 'rusia'],
    nativePatterns: [/на русском/u, /по-русски/u],
  },
  {
    code: 'zh',
    label: 'Chinese',
    script: 'Chinese',
    names: ['chinese', 'mandarin', 'bahasa cina', 'cina'],
    nativePatterns: [],
  },
]

const PLANNER_CYRILLIC_TO_LATIN: Record<string, string> = {
  А: 'A',
  а: 'a',
  Б: 'B',
  б: 'b',
  В: 'V',
  в: 'v',
  Г: 'G',
  г: 'g',
  Д: 'D',
  д: 'd',
  Е: 'E',
  е: 'e',
  Ё: 'Yo',
  ё: 'yo',
  Ж: 'Zh',
  ж: 'zh',
  З: 'Z',
  з: 'z',
  И: 'I',
  и: 'i',
  Й: 'Y',
  й: 'y',
  К: 'K',
  к: 'k',
  Л: 'L',
  л: 'l',
  М: 'M',
  м: 'm',
  Н: 'N',
  н: 'n',
  О: 'O',
  о: 'o',
  П: 'P',
  п: 'p',
  Р: 'R',
  р: 'r',
  С: 'S',
  с: 's',
  Т: 'T',
  т: 't',
  У: 'U',
  у: 'u',
  Ф: 'F',
  ф: 'f',
  Х: 'Kh',
  х: 'kh',
  Ц: 'Ts',
  ц: 'ts',
  Ч: 'Ch',
  ч: 'ch',
  Ш: 'Sh',
  ш: 'sh',
  Щ: 'Shch',
  щ: 'shch',
  Ы: 'Y',
  ы: 'y',
  Э: 'E',
  э: 'e',
  Ю: 'Yu',
  ю: 'yu',
  Я: 'Ya',
  я: 'ya',
  Ь: '',
  ь: '',
  Ъ: '',
  ъ: '',
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasLatinScript(value: string): boolean {
  return /[A-Za-z\u00C0-\u024F]/u.test(value)
}

function hasCyrillicScript(value: string): boolean {
  return /[\u0400-\u04FF]/u.test(value)
}

function hasArabicScript(value: string): boolean {
  return /[\u0600-\u06FF]/u.test(value)
}

function hasHanScript(value: string): boolean {
  return /[\u4E00-\u9FFF]/u.test(value)
}

function hasHiraganaScript(value: string): boolean {
  return /[\u3040-\u309F]/u.test(value)
}

function hasKatakanaScript(value: string): boolean {
  return /[\u30A0-\u30FF]/u.test(value)
}

function hasHangulScript(value: string): boolean {
  return /[\uAC00-\uD7AF]/u.test(value)
}

function detectPlannerScript(value: string): string {
  const hasLatin = hasLatinScript(value)
  const hasCyrillic = hasCyrillicScript(value)
  const hasArabic = hasArabicScript(value)
  const hasHan = hasHanScript(value)
  const hasHiragana = hasHiraganaScript(value)
  const hasKatakana = hasKatakanaScript(value)
  const hasHangul = hasHangulScript(value)

  const scriptCount = [hasLatin, hasCyrillic, hasArabic, hasHan || hasHiragana || hasKatakana, hasHangul].filter(Boolean).length

  if (hasHan && (hasHiragana || hasKatakana) && !hasLatin && !hasCyrillic && !hasArabic && !hasHangul) return 'Japanese'
  if (hasHangul && !hasLatin && !hasCyrillic && !hasArabic && !(hasHan || hasHiragana || hasKatakana)) return 'Korean'
  if ((hasHan || hasHiragana || hasKatakana) && !hasLatin && !hasCyrillic && !hasArabic && !hasHangul) {
    return hasHan && !hasHiragana && !hasKatakana ? 'Chinese' : 'Japanese'
  }
  if (hasArabic && scriptCount === 1) return 'Arabic'
  if (hasCyrillic && scriptCount === 1) return 'Cyrillic'
  if (hasLatin && scriptCount === 1) return 'Latin'
  return 'mixed-language / mixed-script'
}

function detectPlannerLanguage(value: string, detectedScript: string): string {
  if (detectedScript === 'Japanese') return 'Japanese'
  if (detectedScript === 'Chinese') return 'Chinese'
  if (detectedScript === 'Korean') return 'Korean'
  if (detectedScript === 'Arabic') return 'Arabic'
  if (detectedScript === 'Cyrillic') {
    return /\b(?:в|на|и|о|про)\b/iu.test(value) ? 'Russian / Cyrillic' : 'Cyrillic-based'
  }
  if (detectedScript === 'mixed-language / mixed-script') {
    const parts: string[] = []
    if (hasArabicScript(value)) parts.push('Arabic')
    if (hasCyrillicScript(value)) parts.push('Cyrillic')
    if (hasHangulScript(value)) parts.push('Korean')
    if (hasHanScript(value) || hasHiraganaScript(value) || hasKatakanaScript(value)) {
      parts.push(hasHiraganaScript(value) || hasKatakanaScript(value) ? 'Japanese' : 'Chinese')
    }
    if (hasLatinScript(value)) parts.push('Latin')
    return `mixed ${uniquePreserveOrder(parts).join(' + ')}`
  }

  for (const hint of PLANNER_LATIN_LANGUAGE_HINTS) {
    const score = hint.patterns.reduce((total, pattern) => total + Number(pattern.test(value)), 0)
    if (score > 0) return `Latin (likely ${hint.label})`
  }

  return 'Latin / unknown'
}

function stripPlannerDiacritics(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036F]/g, '')
}

function transliterateCyrillic(value: string): string {
  return Array.from(value)
    .map((char) => PLANNER_CYRILLIC_TO_LATIN[char] ?? char)
    .join('')
}

function normalizePlannerSearchVariant(value: string): string {
  return normalizePlannerWhitespace(
    value
      .replace(/[()[\]{}]+/g, ' ')
      .replace(/\s*[:;,.!?/\\-]\s*/g, ' ')
      .trim()
  )
}

function addPlannerVariant(
  variants: PlannerQueryVariant[],
  variant: string,
  language: string,
  script: string,
  why: string
): void {
  const cleaned = normalizePlannerWhitespace(variant)
  if (!cleaned) return
  if (variants.some((item) => item.variant.toLowerCase() === cleaned.toLowerCase())) return

  variants.push({
    rank: variants.length + 1,
    variant: cleaned,
    language,
    script,
    why,
  })
}

function extractPlannerLatinSegment(value: string): string | undefined {
  const matches = value.match(/[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F0-9'’\-:;, ]*[A-Za-z\u00C0-\u024F0-9]/gu) || []
  const ranked = matches
    .map((match) => normalizePlannerWhitespace(match))
    .filter((match) => tokenizePlannerWords(match).length >= 2 || match.length >= 8)
    .sort((a, b) => b.length - a.length)
  return ranked[0]
}

function buildPlannerQueryVariants(
  rawPhrase: string,
  detectedLanguage: string,
  detectedScript: string,
  exactTitleCandidate?: string
): PlannerQueryVariant[] {
  const variants: PlannerQueryVariant[] = []
  const original = exactTitleCandidate || rawPhrase
  const normalized = normalizePlannerSearchVariant(original)

  addPlannerVariant(variants, original, detectedLanguage, detectedScript, 'Original wording preserved as the highest-priority query variant.')
  addPlannerVariant(
    variants,
    normalized,
    detectedLanguage,
    detectedScript,
    'Normalized spacing and punctuation can improve matching without changing the original terms.'
  )

  const latinSegment = extractPlannerLatinSegmentSafe(rawPhrase)
  if (latinSegment && latinSegment.toLowerCase() !== original.toLowerCase()) {
    addPlannerVariant(
      variants,
      latinSegment,
      'English / Latin-segment fallback',
      'Latin',
      'Mixed-script input contains a meaningful Latin title or phrase that is worth trying separately.'
    )
  }

  if (detectedScript === 'Cyrillic') {
    const transliterated = normalizePlannerWhitespace(transliterateCyrillic(original))
    if (transliterated && transliterated.toLowerCase() !== original.toLowerCase()) {
      addPlannerVariant(
        variants,
        transliterated,
        'Transliterated Cyrillic fallback',
        'Latin',
        'Romanized Cyrillic can help as a lower-rank fallback when script-preserved matching is weak.'
      )
    }
  }

  if (detectedScript === 'Latin') {
    const diacriticStripped = normalizePlannerWhitespace(stripPlannerDiacritics(original))
    if (diacriticStripped && diacriticStripped.toLowerCase() !== original.toLowerCase()) {
      addPlannerVariant(
        variants,
        diacriticStripped,
        detectedLanguage,
        'Latin',
        'A diacritic-normalized Latin variant is useful as a fallback for title and keyword matching.'
      )
    }
  }

  return variants.slice(0, 4).map((variant, index) => ({ ...variant, rank: index + 1 }))
}

function extractPlannerLatinSegmentSafe(value: string): string | undefined {
  const matches = value.match(/[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F0-9'\-:;, ]*[A-Za-z\u00C0-\u024F0-9]/gu) || []
  const ranked = matches
    .map((match) => normalizePlannerWhitespace(match))
    .filter((match) => tokenizePlannerWords(match).length >= 2 || match.length >= 8)
    .sort((a, b) => b.length - a.length)
  return ranked[0]
}

function tryResolvePlannerLanguageByName(value: string): PlannerLanguageConstraint | undefined {
  const normalized = normalizePlannerWhitespace(stripPlannerDiacritics(value).toLowerCase())
  const alias = PLANNER_LANGUAGE_ALIASES.find((item) =>
    item.names.some((name) => stripPlannerDiacritics(name).toLowerCase() === normalized)
  )

  if (!alias) return undefined

  return {
    rawValue: value,
    normalizedName: alias.label,
    iso639_1: alias.code,
    script: alias.script,
    requiresResolution: false,
  }
}

function extractPlannerLanguageConstraint(input: string): { remaining: string; requestedLanguage?: PlannerLanguageConstraint } {
  const codeMatch = input.match(/\b(?:language|lang)\s*:\s*([a-z]{2})\b/i)
  if (codeMatch) {
    const alias = PLANNER_LANGUAGE_ALIASES.find((item) => item.code === codeMatch[1].toLowerCase())
    const requestedLanguage: PlannerLanguageConstraint = {
      rawValue: codeMatch[1].toLowerCase(),
      normalizedName: alias?.label || codeMatch[1].toLowerCase(),
      iso639_1: codeMatch[1].toLowerCase(),
      script: alias?.script || 'Latin',
      requiresResolution: false,
    }

    return {
      remaining: normalizePlannerWhitespace(input.replace(codeMatch[0], ' ')),
      requestedLanguage,
    }
  }

  for (const alias of PLANNER_LANGUAGE_ALIASES) {
    if (alias.nativePatterns?.some((pattern) => pattern.test(input))) {
      const pattern = alias.nativePatterns.find((item) => item.test(input))
      if (!pattern) continue

      return {
        remaining: normalizePlannerWhitespace(input.replace(pattern, ' ')),
        requestedLanguage: {
          rawValue: alias.label,
          normalizedName: alias.label,
          iso639_1: alias.code,
          script: alias.script,
          requiresResolution: false,
        },
      }
    }

    for (const name of alias.names) {
      const escaped = escapeRegex(name)
      const patterns = [
        new RegExp(`\\b(?:in|written in|results? in|language)\\s+${escaped}\\b`, 'iu'),
        new RegExp(`\\b(?:dalam bahasa|bahasa|berbahasa)\\s+${escaped}\\b`, 'iu'),
        new RegExp(`\\b(?:idioma|en|auf)\\s+${escaped}\\b`, 'iu'),
      ]

      for (const pattern of patterns) {
        const match = pattern.exec(input)
        if (!match) continue

        return {
          remaining: normalizePlannerWhitespace(input.replace(match[0], ' ')),
          requestedLanguage: {
            rawValue: name,
            normalizedName: alias.label,
            iso639_1: alias.code,
            script: alias.script,
            requiresResolution: false,
          },
        }
      }
    }
  }

  for (const pattern of PLANNER_LANGUAGE_CUE_PATTERNS) {
    const match = pattern.exec(input)
    if (!match) continue
    const rawValue = typeof match[1] === 'string' ? cleanupPlannerFieldValue(match[1]) : ''
    if (!rawValue) continue

    const resolved = tryResolvePlannerLanguageByName(rawValue)
    return {
      remaining: normalizePlannerWhitespace(input.replace(match[0], ' ')),
      requestedLanguage:
        resolved ||
        ({
          rawValue,
          normalizedName: rawValue,
          script: 'Latin',
          requiresResolution: true,
        } satisfies PlannerLanguageConstraint),
    }
  }

  return { remaining: input }
}

function extractPlannerYearConstraint(
  input: string
): { remaining: string; yearFrom?: number; yearTo?: number } {
  const exactMatch = input.match(/\b(?:year|tahun)\s+(19\d{2}|20\d{2})\b/i)
  if (exactMatch) {
    const year = parseInt(exactMatch[1], 10)
    return {
      remaining: normalizePlannerWhitespace(input.replace(exactMatch[0], ' ')),
      yearFrom: year,
      yearTo: year,
    }
  }

  const betweenMatch = input.match(/\b(?:between|antara)\s+(19\d{2}|20\d{2})\s+(?:and|dan|to|-)\s+(19\d{2}|20\d{2})\b/i)
  if (betweenMatch) {
    const yearA = parseInt(betweenMatch[1], 10)
    const yearB = parseInt(betweenMatch[2], 10)
    return {
      remaining: normalizePlannerWhitespace(input.replace(betweenMatch[0], ' ')),
      yearFrom: Math.min(yearA, yearB),
      yearTo: Math.max(yearA, yearB),
    }
  }

  const fromMatch = input.match(/\b(?:since|from|sejak|dari|after)\s+(19\d{2}|20\d{2})\b/i)
  const toMatch = input.match(/\b(?:before|until|sebelum|sampai|to)\s+(19\d{2}|20\d{2})\b/i)
  if (fromMatch || toMatch) {
    return {
      remaining: normalizePlannerWhitespace(input.replace(fromMatch?.[0] || '', ' ').replace(toMatch?.[0] || '', ' ')),
      yearFrom: fromMatch ? parseInt(fromMatch[1], 10) : undefined,
      yearTo: toMatch ? parseInt(toMatch[1], 10) : undefined,
    }
  }

  return { remaining: input }
}

function normalizePlannerWhitespace(value: string): string {
  return value
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function stripPlannerQuotes(value: string): string {
  const trimmed = normalizePlannerWhitespace(value)
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('`') && trimmed.endsWith('`'))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function tokenizePlannerWords(value: string): string[] {
  return normalizePlannerWhitespace(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function cleanupPlannerFieldValue(value: string): string {
  return stripPlannerQuotes(value.replace(/^[\s:.,;()-]+|[\s:.,;()-]+$/g, ''))
}

function stripPlannerLeadIn(value: string): string {
  let current = normalizePlannerWhitespace(value)
  let previous = ''
  const leadInPattern = new RegExp(`^(?:${PLANNER_LEAD_IN_TERMS.map(escapeRegex).join('|')})\\s+`, 'iu')

  while (current !== previous) {
    previous = current
    current = current.replace(leadInPattern, '').trim()
  }

  return current
}

function sanitizePlannerCoreQuery(value: string, stripLeadingTopicCue: boolean): string {
  let cleaned = stripPlannerLeadIn(value)
  cleaned = cleaned.replace(/^(?:(?:judul|title)\s*:\s*)+/i, '')
  const leadingCuePattern = new RegExp(
    `^(?:(?:${[...PLANNER_WORK_CUES, ...PLANNER_SOURCE_CUES, 'judul', 'title'].map(escapeRegex).join('|')})\\s+)+`,
    'iu'
  )
  cleaned = cleaned.replace(
    leadingCuePattern,
    ''
  )
  cleaned = normalizePlannerWhitespace(cleaned)

  if (stripLeadingTopicCue) {
    const topicPattern = new RegExp(`^(?:${PLANNER_TOPIC_CUES.map(escapeRegex).join('|')})\\s+`, 'iu')
    cleaned = cleaned.replace(topicPattern, '')
  }

  return stripPlannerQuotes(cleaned)
}

function looksLikeExactTitleCandidate(value: string, explicitWorkHint: boolean): boolean {
  const phrase = stripPlannerQuotes(value)
  const tokens = tokenizePlannerWords(phrase)
  const detectedScript = detectPlannerScript(phrase)
  if (tokens.length < 2 && detectedScript === 'Latin') return false
  if (tokens.length > 18) return false

  if (/["'`:;]/.test(value)) return true
  if (detectedScript !== 'Latin' && detectedScript !== 'mixed-language / mixed-script' && tokens.length <= 3 && phrase.length <= 32) {
    return !looksLikeSourceName(phrase, false)
  }

  const titleCaseCount = tokens.filter((token) => /^[A-Z]/.test(token)).length
  const titleStopwordCount = tokens.filter((token) => PLANNER_TITLE_STOPWORDS.has(token.toLowerCase())).length

  if (titleCaseCount / tokens.length >= 0.6) return true
  if (explicitWorkHint && tokens.length >= 4 && titleStopwordCount >= 1) return true

  return false
}

function scoreExactTitleCandidate(value: string, startIndex: number): number {
  const tokens = tokenizePlannerWords(value)
  const titleCaseCount = tokens.filter((token) => /^[A-Z]/.test(token)).length
  const titleStopwordCount = tokens.filter((token) => PLANNER_TITLE_STOPWORDS.has(token.toLowerCase())).length
  return titleStopwordCount * 4 + titleCaseCount * 2 + Math.min(startIndex, 3) - Math.abs(tokens.length - 5)
}

function inferExactTitleCandidate(value: string, explicitWorkHint: boolean): string | undefined {
  const cleaned = stripPlannerQuotes(value)
  const tokens = tokenizePlannerWords(cleaned)
  if (tokens.length < 2) return undefined

  const candidates = explicitWorkHint
    ? tokens.map((_, index) => tokens.slice(index).join(' ')).filter((candidate) => tokenizePlannerWords(candidate).length >= 2)
    : [cleaned]

  const ranked = candidates
    .filter((candidate) => looksLikeExactTitleCandidate(candidate, explicitWorkHint))
    .map((candidate, index) => ({
      candidate,
      score: scoreExactTitleCandidate(candidate, index),
      tokenCount: tokenizePlannerWords(candidate).length,
    }))
    .sort((a, b) => b.score - a.score || b.tokenCount - a.tokenCount)

  return ranked[0]?.candidate
}

function looksLikeSourceName(value: string, explicitSourceHint: boolean): boolean {
  const cleaned = stripPlannerQuotes(value)
  const lower = cleaned.toLowerCase()
  if (!lower) return false
  if (explicitSourceHint) return true
  if (PLANNER_CANONICAL_SOURCE_NAMES.has(lower)) return true
  if (/\b(journal|review|letters|proceedings|transactions|conference|repository|archive|annals|revista|revue|zeitschrift)\b/iu.test(cleaned)) {
    return true
  }
  if (/[журналمجلة期刊雑誌저널]/u.test(cleaned)) return true
  return false
}

function looksLikeBroadTopicSearch(value: string, explicitWorkHint: boolean): boolean {
  const cleaned = stripPlannerQuotes(value)
  const lower = cleaned.toLowerCase()
  const tokens = tokenizePlannerWords(cleaned)
  const detectedScript = detectPlannerScript(cleaned)
  if (tokens.length === 0) return false
  if (looksLikeExactTitleCandidate(cleaned, explicitWorkHint)) return false
  if (PLANNER_BROAD_TOPIC_CUES.some((cue) => lower.includes(cue))) return true
  if (detectedScript !== 'Latin' && detectedScript !== 'mixed-language / mixed-script' && tokens.length >= 3) return true
  return tokens.length >= 5 && !looksLikeSourceName(cleaned, false)
}

function makePlannerConstraint(kind: OpenAlexConstraintKind, rawValue: string): PlannerConstraint {
  const normalized = cleanupPlannerFieldValue(rawValue)
  switch (kind) {
    case 'author':
      return {
        kind,
        rawValue: normalized,
        endpoint: '/authors',
        filterKey: 'authorships.author.id',
        select: OPENALEX_PLANNER_AUTHORS_SELECT,
        placeholder: '<RESOLVED_AUTHOR_ID>',
      }
    case 'institution':
      return {
        kind,
        rawValue: normalized,
        endpoint: '/institutions',
        filterKey: 'authorships.institutions.id',
        select: OPENALEX_PLANNER_INSTITUTIONS_SELECT,
        placeholder: '<RESOLVED_INSTITUTION_ID>',
      }
    case 'source':
      return {
        kind,
        rawValue: normalized,
        endpoint: '/sources',
        filterKey: 'primary_location.source.id',
        select: OPENALEX_PLANNER_SOURCES_SELECT,
        placeholder: '<RESOLVED_SOURCE_ID>',
      }
    case 'topic':
      return {
        kind,
        rawValue: normalized,
        endpoint: '/topics',
        filterKey: 'topics.id',
        select: OPENALEX_PLANNER_TOPICS_SELECT,
        placeholder: '<RESOLVED_TOPIC_ID>',
      }
    case 'publisher':
      return {
        kind,
        rawValue: normalized,
        endpoint: '/publishers',
        filterKey: 'primary_location.source.host_organization',
        select: OPENALEX_PLANNER_PUBLISHERS_SELECT,
        placeholder: '<RESOLVED_PUBLISHER_ID>',
      }
    case 'funder':
      return {
        kind,
        rawValue: normalized,
        endpoint: '/funders',
        filterKey: 'funders.id',
        select: OPENALEX_PLANNER_FUNDERS_SELECT,
        placeholder: '<RESOLVED_FUNDER_ID>',
      }
  }
}

function extractPlannerConstraint(
  input: string,
  kind: OpenAlexConstraintKind,
  patterns: RegExp[],
  existing: PlannerConstraint[]
): { remaining: string; constraints: PlannerConstraint[] } {
  if (existing.some((constraint) => constraint.kind === kind)) {
    return { remaining: input, constraints: existing }
  }

  for (const pattern of patterns) {
    const match = pattern.exec(input)
    if (!match) continue

    const value = cleanupPlannerFieldValue(match[1] || '')
    if (!value) continue

    const remaining = normalizePlannerWhitespace(
      `${input.slice(0, match.index)} ${input.slice(match.index + match[0].length)}`
    )

    return {
      remaining,
      constraints: [...existing, makePlannerConstraint(kind, value)],
    }
  }

  return { remaining: input, constraints: existing }
}

function buildPlannerRequest(
  rank: number,
  label: string,
  endpoint: string,
  params: OpenAlexPlannerRequestParams,
  notes: string
): OpenAlexPlannerRequest {
  const cleanParams: OpenAlexPlannerRequestParams = {}
  if (params.search) cleanParams.search = params.search
  if (params['search.exact']) cleanParams['search.exact'] = params['search.exact']
  if (params['search.semantic']) cleanParams['search.semantic'] = params['search.semantic']
  if (params.filter) cleanParams.filter = params.filter
  if (typeof params.per_page === 'number') cleanParams.per_page = params.per_page
  if (params.select) cleanParams.select = params.select

  return {
    rank,
    label,
    method: 'GET',
    endpoint,
    params: cleanParams,
    notes,
  }
}

function buildPlannerWorkFilters(analysis: PlannerAnalysis): string[] {
  const filters = analysis.constraints.map((constraint) => `${constraint.filterKey}:${constraint.placeholder}`)

  if (analysis.explicitBook) {
    filters.push('type:book')
  } else if (analysis.explicitArticle) {
    filters.push('type:article|review|preprint')
  }

  if (analysis.requestedLanguage) {
    filters.push(
      `language:${analysis.requestedLanguage.iso639_1 || '<RESOLVED_LANGUAGE_CODE>'}`
    )
  }

  if (analysis.yearFrom && analysis.yearTo && analysis.yearFrom === analysis.yearTo) {
    filters.push(`publication_year:${analysis.yearFrom}`)
  } else {
    if (analysis.yearFrom) filters.push(`publication_year:>=${analysis.yearFrom}`)
    if (analysis.yearTo) filters.push(`publication_year:<=${analysis.yearTo}`)
  }

  return filters
}

function buildPlannerWorkRequestParams(analysis: PlannerAnalysis): OpenAlexPlannerRequestParams {
  const params: OpenAlexPlannerRequestParams = {
    per_page: 10,
    select: OPENALEX_PLANNER_WORKS_SELECT,
  }

  const filters = buildPlannerWorkFilters(analysis)
  if (filters.length > 0) {
    params.filter = filters.join(',')
  }

  if (analysis.exactTitleCandidate) {
    params['search.exact'] = analysis.exactTitleCandidate
  } else if (analysis.coreQuery) {
    if (analysis.broadTopic) params['search.semantic'] = analysis.coreQuery
    else params.search = analysis.coreQuery
  }

  return params
}

function buildPlannerVariantWorkParams(
  analysis: PlannerAnalysis,
  variant: string,
  mode: 'search' | 'exact' | 'semantic'
): OpenAlexPlannerRequestParams {
  const params: OpenAlexPlannerRequestParams = {
    filter: buildPlannerWorkFilters(analysis).join(',') || undefined,
    per_page: 10,
    select: OPENALEX_PLANNER_WORKS_SELECT,
  }

  if (mode === 'exact') params['search.exact'] = variant
  else if (mode === 'semantic') params['search.semantic'] = variant
  else params.search = variant

  return params
}

function buildPlannerVariantSourceParams(variant: string, mode: 'search' | 'exact'): OpenAlexPlannerRequestParams {
  return {
    ...(mode === 'exact' ? { 'search.exact': variant } : { search: variant }),
    per_page: 10,
    select: OPENALEX_PLANNER_SOURCES_SELECT,
  }
}

function getPlannerSemanticFallbackVariant(analysis: PlannerAnalysis): string | undefined {
  return analysis.queryVariants.find((variant) => variant.script === 'Latin')?.variant || analysis.queryVariants[0]?.variant
}

function getPlannerPrimaryPhrase(analysis: PlannerAnalysis): string {
  return analysis.queryVariants[0]?.variant || analysis.exactTitleCandidate || analysis.coreQuery || analysis.normalizedQuery
}

function buildPlannerFallbacks(intent: OpenAlexPlannerIntent): string[] {
  if (intent === 'direct_id_lookup') {
    return [
      'If the direct lookup fails, retry with the identifier normalized: strip DOI or OpenAlex URL prefixes and restore ISSN hyphenation.',
      'If the identifier is actually a constraint ID (for example an author or source), use it inside a `/works?filter=...` request next.',
    ]
  }

  if (intent === 'constrained_work_search') {
    return [
      'If resolver results are noisy, inspect the top entity hit, substitute the correct OpenAlex ID, and rerun the final `/works` request.',
      'If the topic phrase is too broad, retry the final `/works` request with a narrower `search=` query built from the 1-3 most distinctive words.',
    ]
  }

  if (intent === 'source_lookup') {
    return [
      'If exact source matching is weak, retry with broader `search=` on the normalized source name.',
      'If the user actually meant a paper or book title, switch to `/works` with `search.exact` or `search` using the same phrase.',
    ]
  }

  if (intent === 'ambiguous') {
    return [
      'Use the highest-ranked request first, then fall through to the next candidate if the top results clearly point to the wrong entity type.',
      'If the phrase may contain typos, retry `/works?search=` using only the 1-2 most distinctive words rather than fuzzy-matching every token.',
    ]
  }

  return [
    'If exact-title results are weak, retry with `/works?search=` using the core phrase or the 2-5 most distinctive keywords.',
    'If the phrase may be a venue instead of a work, try `/sources?search=` with the same normalized query.',
  ]
}

function detectDirectOpenAlexLookup(query: string):
  | { endpoint: string; select: string; intentLabel: string; notes: string }
  | undefined {
  const normalized = normalizePlannerWhitespace(query)
  const openAlexIdMatch = normalized.match(/^(?:https?:\/\/openalex\.org\/)?([WAISTPF]\d+)$/i)
  if (openAlexIdMatch) {
    const id = `${openAlexIdMatch[1][0].toUpperCase()}${openAlexIdMatch[1].slice(1)}`
    const entity = id[0].toUpperCase()
    const endpointMap: Record<string, { endpoint: string; select: string; label: string }> = {
      W: { endpoint: `/works/${id}`, select: OPENALEX_PLANNER_WORKS_SELECT, label: 'work' },
      S: { endpoint: `/sources/${id}`, select: OPENALEX_PLANNER_SOURCES_SELECT, label: 'source' },
      A: { endpoint: `/authors/${id}`, select: OPENALEX_PLANNER_AUTHORS_SELECT, label: 'author' },
      I: { endpoint: `/institutions/${id}`, select: OPENALEX_PLANNER_INSTITUTIONS_SELECT, label: 'institution' },
      T: { endpoint: `/topics/${id}`, select: OPENALEX_PLANNER_TOPICS_SELECT, label: 'topic' },
      P: { endpoint: `/publishers/${id}`, select: OPENALEX_PLANNER_PUBLISHERS_SELECT, label: 'publisher' },
      F: { endpoint: `/funders/${id}`, select: OPENALEX_PLANNER_FUNDERS_SELECT, label: 'funder' },
    }

    const mapped = endpointMap[entity]
    if (mapped) {
      return {
        endpoint: mapped.endpoint,
        select: mapped.select,
        intentLabel: mapped.label,
        notes: `Direct OpenAlex ID detected, so a singleton lookup is more precise than keyword search for this ${mapped.label}.`,
      }
    }
  }

  const normalizedDoi = normalizeDoi(normalized)
  if (isProbablyDoi(normalizedDoi)) {
    return {
      endpoint: `/works/${encodeURIComponent(`doi:${normalizedDoi}`)}`,
      select: OPENALEX_PLANNER_WORKS_SELECT,
      intentLabel: 'work',
      notes: 'Direct DOI detected, so a singleton work lookup should be tried before any keyword search.',
    }
  }

  const pmidMatch = normalized.match(/^(?:pmid[:\s]*|https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/)(\d{4,10})\/?$/i)
  if (pmidMatch) {
    return {
      endpoint: `/works/${encodeURIComponent(`pmid:${pmidMatch[1]}`)}`,
      select: OPENALEX_PLANNER_WORKS_SELECT,
      intentLabel: 'work',
      notes: 'Direct PMID detected, so the most precise plan is a singleton work lookup.',
    }
  }

  const pmcidMatch = normalized.match(
    /^(?:pmcid[:\s]*|https?:\/\/(?:www\.)?ncbi\.nlm\.nih\.gov\/pmc\/articles\/|https?:\/\/pmc\.ncbi\.nlm\.nih\.gov\/articles\/)(PMC\d+)\/?$/i
  )
  if (pmcidMatch) {
    const pmcid = pmcidMatch[1].toUpperCase()
    return {
      endpoint: `/works/${encodeURIComponent(`pmcid:${pmcid}`)}`,
      select: OPENALEX_PLANNER_WORKS_SELECT,
      intentLabel: 'work',
      notes: 'Direct PMCID detected, so a singleton work lookup should be preferred before broader search.',
    }
  }

  const issnMatch = normalized.match(/^(?:issn[:\s]*)?(\d{4})-?(\d{3}[\dXx])$/)
  if (issnMatch) {
    const issn = `${issnMatch[1]}-${issnMatch[2].toUpperCase()}`
    return {
      endpoint: `/sources/${issn}`,
      select: OPENALEX_PLANNER_SOURCES_SELECT,
      intentLabel: 'source',
      notes: 'Direct ISSN detected, so a singleton source lookup is preferred over search.',
    }
  }

  return undefined
}

function analyzePlannerQuery(rawQuery: string): PlannerAnalysis {
  const normalizedQuery = normalizePlannerWhitespace(rawQuery)
  const strippedLeadIn = stripPlannerLeadIn(normalizedQuery)
  const detectedScript = detectPlannerScript(normalizedQuery)
  const detectedQueryLanguage = detectPlannerLanguage(normalizedQuery, detectedScript)
  const lower = stripPlannerDiacritics(normalizedQuery).toLowerCase()
  const explicitSource = new RegExp(`\\b(?:${PLANNER_SOURCE_CUES.map(escapeRegex).join('|')})\\b`, 'iu').test(lower)
  const explicitBook = /\b(book|books|buku|ebook|e-book|книга|книги|كتاب|书|書|本|책)\b/iu.test(lower)
  const explicitArticle = /\b(article|articles|artikel|paper|papers|makalah|preprint|статья|мقالة|مقالات|بحث|أبحاث|ورقة|论文|文章|論文|논문)\b/iu.test(
    lower
  )
  const explicitWork = explicitBook || explicitArticle

  let remaining = strippedLeadIn
  let constraints: PlannerConstraint[] = []
  let requestedLanguage: PlannerLanguageConstraint | undefined
  let yearFrom: number | undefined
  let yearTo: number | undefined

  ;({ remaining, requestedLanguage } = extractPlannerLanguageConstraint(remaining))
  ;({ remaining, yearFrom, yearTo } = extractPlannerYearConstraint(remaining))

  ;({ remaining, constraints } = extractPlannerConstraint(
    remaining,
    'author',
    [
      /\bauthor\s*:\s*([^,;]+?)(?=(?:\s+\b(?:institution|affiliation|journal|source|venue|topic|publisher|funder)\b\s*:)|$)/i,
      /\b(?:by|oleh|author)\s+([^,;]+?)(?=(?:\s+\b(?:from|dari|in|di|about|tentang|mengenai|on|institution|affiliation|publisher|funder|topic|topik)\b)|$)/i,
    ],
    constraints
  ))

  ;({ remaining, constraints } = extractPlannerConstraint(
    remaining,
    'institution',
    [
      /\b(?:institution|affiliation|institusi|afiliasi)\s*:\s*([^,;]+?)(?=(?:\s+\b(?:author|journal|source|venue|topic|publisher|funder)\b\s*:)|$)/i,
      /\b(?:institution|affiliation|institusi|afiliasi)\s+([^,;]+?)(?=(?:\s+\b(?:about|tentang|mengenai|on|from|dari|in|di|author|publisher|funder|topic|topik)\b)|$)/i,
    ],
    constraints
  ))

  ;({ remaining, constraints } = extractPlannerConstraint(
    remaining,
    'publisher',
    [
      /\b(?:publisher|penerbit)\s*:\s*([^,;]+?)(?=(?:\s+\b(?:author|institution|topic|funder)\b\s*:)|$)/i,
      /\b(?:published\s+by|diterbitkan\s+oleh|publisher|penerbit)\s+([^,;]+?)(?=(?:\s+\b(?:about|tentang|mengenai|on|topic|topik)\b)|$)/i,
    ],
    constraints
  ))

  ;({ remaining, constraints } = extractPlannerConstraint(
    remaining,
    'funder',
    [
      /\bfunder\s*:\s*([^,;]+?)(?=(?:\s+\b(?:author|institution|topic|publisher)\b\s*:)|$)/i,
      /\b(?:funded\s+by|didanai\s+oleh|funder)\s+([^,;]+?)(?=(?:\s+\b(?:about|tentang|mengenai|on|topic|topik)\b)|$)/i,
    ],
    constraints
  ))

  const allowSourceConstraintExtraction =
    explicitWork ||
    /\b(?:about|tentang|mengenai|topic|topik|author|by|oleh|institution|affiliation|publisher|funder)\b/.test(lower)

  if (allowSourceConstraintExtraction) {
    ;({ remaining, constraints } = extractPlannerConstraint(
      remaining,
      'source',
      [
        /\b(?:journal|jurnal|source|venue)\s*:\s*([^,;]+?)(?=(?:\s+\b(?:author|institution|topic|publisher|funder)\b\s*:)|$)/i,
        /\b(?:from|dari|in|di)\s+([^,;]+?)(?=(?:\s+\b(?:about|tentang|mengenai|topic|topik|author|by|oleh|institution|affiliation|publisher|funder)\b)|$)/i,
      ],
      constraints
    ))
  }

  const allowTopicConstraintExtraction =
    constraints.some((constraint) => constraint.kind !== 'topic') || /\btopic\s*:/i.test(remaining)

  if (allowTopicConstraintExtraction) {
    ;({ remaining, constraints } = extractPlannerConstraint(
      remaining,
      'topic',
      [
        /\b(?:topic|topik)\s*:\s*([^,;]+)$/i,
        /\b(?:about|tentang|mengenai|on|sobre|sur|über|о|про|عن|حول|关于|關於|について|に関する)\s+(.+)$/iu,
      ],
      constraints
    ))
  }

  const coreQuery = sanitizePlannerCoreQuery(remaining, explicitWork || constraints.length > 0)
  const exactTitleCandidate = inferExactTitleCandidate(coreQuery, explicitWork)
  const broadTopic = Boolean(coreQuery) && looksLikeBroadTopicSearch(coreQuery, explicitWork)
  const looksLikeSource = Boolean(coreQuery) && looksLikeSourceName(coreQuery, explicitSource)
  const looksLikeWork = Boolean(exactTitleCandidate) || explicitWork || broadTopic
  const variantSeed = coreQuery || constraints.find((constraint) => constraint.kind === 'topic')?.rawValue || normalizedQuery
  const queryVariants = buildPlannerQueryVariants(variantSeed, detectedQueryLanguage, detectedScript, exactTitleCandidate)

  return {
    rawQuery,
    normalizedQuery,
    coreQuery,
    exactTitleCandidate,
    detectedQueryLanguage,
    detectedScript,
    explicitSource,
    explicitBook,
    explicitArticle,
    broadTopic,
    looksLikeSource,
    looksLikeWork,
    queryVariants,
    requestedLanguage,
    yearFrom,
    yearTo,
    constraints,
  }
}

function buildSourceLookupPlan(analysis: PlannerAnalysis): OpenAlexPlannerResponse {
  const phrase = getPlannerPrimaryPhrase(analysis)
  const likelyExact = looksLikeSourceName(phrase, analysis.explicitSource)
  const requests: OpenAlexPlannerRequest[] = []
  const variants = analysis.queryVariants.slice(0, 2)

  variants.forEach((variant, index) => {
    const mode = likelyExact && index === 0 ? 'exact' : 'search'
    requests.push(
      buildPlannerRequest(
        index + 1,
        index === 0 ? 'best candidate' : 'fallback candidate',
        '/sources',
        buildPlannerVariantSourceParams(variant.variant, mode),
        mode === 'exact'
          ? 'Preserve the original source wording first when the phrase looks like a full journal or venue title.'
          : 'Use a broader source search as the fallback when title variants or abbreviations are possible.'
      )
    )
  })

  return {
    intent: 'source_lookup',
    detected_query_language: analysis.detectedQueryLanguage,
    detected_script: analysis.detectedScript,
    reasoning: 'The query most likely names a journal, venue, or repository rather than a specific scholarly work.',
    query_variants: analysis.queryVariants,
    requests,
    fallback_strategy: buildPlannerFallbacks('source_lookup'),
  }
}

function buildWorkLookupPlan(analysis: PlannerAnalysis): OpenAlexPlannerResponse {
  const requests: OpenAlexPlannerRequest[] = []
  const variants = analysis.queryVariants.slice(0, 3)

  if (analysis.exactTitleCandidate) {
    variants.forEach((variant, index) => {
      requests.push(
        buildPlannerRequest(
          index + 1,
          index === 0 ? 'best candidate' : index === 1 ? 'normalized exact fallback' : 'keyword fallback',
          '/works',
          buildPlannerVariantWorkParams(analysis, variant.variant, index < 2 ? 'exact' : 'search'),
          index < 2
            ? 'Exact-title matching should preserve the strongest original-script title form first, then a normalized variant.'
            : 'Keyword fallback broadens recall if the exact-title variants are slightly noisy or incomplete.'
        )
      )
    })
  } else {
    variants.forEach((variant, index) => {
      requests.push(
        buildPlannerRequest(
          index + 1,
          index === 0 ? 'best candidate' : 'keyword fallback',
          '/works',
          buildPlannerVariantWorkParams(analysis, variant.variant, 'search'),
          index === 0
            ? 'Start with the original-script or original-language wording before translating or broadening the search.'
            : 'Normalized, transliterated, or Latin fallback variants can recover additional relevant matches.'
        )
      )
    })

    if (analysis.broadTopic) {
      const semanticVariant = getPlannerSemanticFallbackVariant(analysis)
      if (semanticVariant) {
        requests.push(
          buildPlannerRequest(
            requests.length + 1,
            'semantic fallback',
            '/works',
            buildPlannerVariantWorkParams(analysis, semanticVariant, 'semantic'),
            'Semantic search is a lower-rank fallback for conceptual topic queries after the explicit multilingual keyword variants.'
          )
        )
      }
    }
  }

  return {
    intent: 'work_lookup',
    detected_query_language: analysis.detectedQueryLanguage,
    detected_script: analysis.detectedScript,
    reasoning: 'The query most likely refers to a scholarly work or to a work-focused topic rather than a source title.',
    query_variants: analysis.queryVariants,
    requests,
    fallback_strategy: buildPlannerFallbacks('work_lookup'),
  }
}

function buildConstrainedWorkPlan(analysis: PlannerAnalysis): OpenAlexPlannerResponse {
  const requests: OpenAlexPlannerRequest[] = []
  let rank = 1

  for (const constraint of analysis.constraints) {
    const useExactSourceLookup = constraint.kind === 'source' && looksLikeSourceName(constraint.rawValue, true)
    requests.push(
      buildPlannerRequest(
        rank++,
        `resolve ${constraint.kind}`,
        constraint.endpoint,
        {
          ...(useExactSourceLookup ? { 'search.exact': constraint.rawValue } : { search: constraint.rawValue }),
          per_page: 5,
          select: constraint.select,
        },
        `Resolve the ${constraint.kind} name to an OpenAlex ID before filtering works.`
      )
    )
  }

  if (analysis.requestedLanguage?.requiresResolution) {
    requests.push(
      buildPlannerRequest(
        rank++,
        'resolve language',
        '/languages',
        {
          search: analysis.requestedLanguage.normalizedName,
          per_page: 5,
          select: OPENALEX_PLANNER_LANGUAGES_SELECT,
        },
        'Resolve the requested result language to an OpenAlex language entity or ISO 639-1 code before filtering works.'
      )
    )
  }

  const primaryVariant = analysis.queryVariants[0]?.variant || analysis.coreQuery || analysis.normalizedQuery
  const workParams =
    analysis.exactTitleCandidate && analysis.coreQuery
      ? buildPlannerVariantWorkParams(analysis, primaryVariant, 'exact')
      : analysis.coreQuery
        ? buildPlannerVariantWorkParams(analysis, primaryVariant, 'search')
        : {
            filter: buildPlannerWorkFilters(analysis).join(',') || undefined,
            per_page: 10,
            select: OPENALEX_PLANNER_WORKS_SELECT,
          }
  requests.push(
    buildPlannerRequest(
      rank,
      'filtered works',
      '/works',
      workParams,
      'Use the resolved OpenAlex ID values inside the work filters so the final results stay tightly scoped.'
    )
  )

  if (analysis.broadTopic && analysis.coreQuery) {
    const semanticVariant = getPlannerSemanticFallbackVariant(analysis)
    if (semanticVariant && semanticVariant !== primaryVariant) {
      requests.push(
        buildPlannerRequest(
          rank + 1,
          'semantic filtered fallback',
          '/works',
          buildPlannerVariantWorkParams(analysis, semanticVariant, 'semantic'),
          'Keep the same filters, but broaden topic recall with a semantic fallback only after the original-script keyword variant.'
        )
      )
    }
  }

  const constrainedKinds = [
    ...analysis.constraints.map((constraint) => constraint.kind),
    ...(analysis.requestedLanguage ? ['language'] : []),
    ...(analysis.yearFrom || analysis.yearTo ? ['year'] : []),
  ].join(', ')

  return {
    intent: 'constrained_work_search',
    detected_query_language: analysis.detectedQueryLanguage,
    detected_script: analysis.detectedScript,
    reasoning: `The query combines a work search with named constraints (${constrainedKinds}), so the best plan is to resolve those entities first and then filter /works by ID.`,
    query_variants: analysis.queryVariants,
    requests,
    fallback_strategy: buildPlannerFallbacks('constrained_work_search'),
  }
}

function buildAmbiguousPlan(analysis: PlannerAnalysis): OpenAlexPlannerResponse {
  const phrase = getPlannerPrimaryPhrase(analysis)
  const requests: OpenAlexPlannerRequest[] = []

  requests.push(
    buildPlannerRequest(
      1,
      'source candidate',
      '/sources',
      buildPlannerVariantSourceParams(phrase, 'exact'),
      'This phrase could be a journal or venue title, so an exact source check is the strongest first probe.'
    )
  )

  if (analysis.exactTitleCandidate) {
    requests.push(
      buildPlannerRequest(
        2,
        'work exact-title candidate',
        '/works',
        buildPlannerVariantWorkParams(analysis, analysis.exactTitleCandidate, 'exact'),
        'The wording could also be a complete work title, so exact work search is the next-best candidate.'
      )
    )
  } else {
    requests.push(
      buildPlannerRequest(
        2,
        'work keyword candidate',
        '/works',
        buildPlannerVariantWorkParams(analysis, phrase, 'search'),
        'A work-focused keyword lookup covers the case where the phrase is a paper or book title fragment.'
      )
    )
  }

  requests.push(
    buildPlannerRequest(
      3,
      'broader work fallback',
      '/works',
      buildPlannerVariantWorkParams(analysis, analysis.queryVariants[1]?.variant || phrase, 'search'),
      'Broader keyword matching is the fallback if neither the source path nor the exact-title path is strong enough.'
    )
  )

  return {
    intent: 'ambiguous',
    detected_query_language: analysis.detectedQueryLanguage,
    detected_script: analysis.detectedScript,
    reasoning: 'The phrase could plausibly refer to either a source title or a work title, so multiple ranked request candidates are needed.',
    query_variants: analysis.queryVariants,
    requests,
    fallback_strategy: buildPlannerFallbacks('ambiguous'),
  }
}

function buildOpenAlexRequestPlan(rawQuery: string): OpenAlexPlannerResponse {
  const directLookup = detectDirectOpenAlexLookup(rawQuery)
  const analysis = analyzePlannerQuery(rawQuery)
  if (directLookup) {
    return {
      intent: 'direct_id_lookup',
      detected_query_language: analysis.detectedQueryLanguage,
      detected_script: analysis.detectedScript,
      reasoning: `The query contains a direct ${directLookup.intentLabel} identifier, so a singleton lookup is more relevant than text search.`,
      query_variants: analysis.queryVariants,
      requests: [
        buildPlannerRequest(
          1,
          'best candidate',
          directLookup.endpoint,
          { select: directLookup.select },
          directLookup.notes
        ),
      ],
      fallback_strategy: buildPlannerFallbacks('direct_id_lookup'),
    }
  }

  if (analysis.constraints.length > 0 || analysis.requestedLanguage || analysis.yearFrom || analysis.yearTo) {
    return buildConstrainedWorkPlan(analysis)
  }

  if (analysis.looksLikeSource && !analysis.looksLikeWork) {
    return buildSourceLookupPlan(analysis)
  }

  if (analysis.looksLikeWork || analysis.broadTopic || analysis.explicitBook || analysis.explicitArticle) {
    return buildWorkLookupPlan(analysis)
  }

  return buildAmbiguousPlan(analysis)
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
    phrases,
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

function buildQueryValidationGroups(processed: ProcessedQuery): QueryValidationGroup[] {
  const groups: QueryValidationGroup[] = []

  if (processed.disease) {
    groups.push({
      label: processed.disease.canonical,
      primaryTerms: [processed.disease.primaryKeyword.toLowerCase()],
      expandedTerms: [processed.disease.primaryKeyword.toLowerCase(), processed.disease.canonical.toLowerCase()],
      regex: processed.disease.validationRegex,
      required: true,
    })
  }

  if (processed.country) {
    const countryTerms = uniquePreserveOrder([processed.country.name, ...processed.country.keywords]).map((term) =>
      term.toLowerCase()
    )
    groups.push({
      label: processed.country.name,
      primaryTerms: countryTerms,
      expandedTerms: countryTerms,
    })
  }

  const diseaseTerms = new Set(
    processed.disease ? [processed.disease.primaryKeyword.toLowerCase(), processed.disease.canonical.toLowerCase()] : []
  )
  const countryTerms = new Set(processed.country ? processed.country.keywords.map((term) => term.toLowerCase()) : [])

  for (const rawKeyword of processed.extractedKeywords) {
    const keyword = rawKeyword.toLowerCase()
    if (!keyword) continue
    if (diseaseTerms.has(keyword)) continue
    if (countryTerms.has(keyword)) continue

    const translations = EPIDEMIOLOGY_TRANSLATIONS[keyword] || []
    groups.push({
      label: keyword,
      primaryTerms: [keyword],
      expandedTerms: uniquePreserveOrder([keyword, ...translations]).map((term) => term.toLowerCase()),
    })
  }

  return groups
}

function scoreArticleAgainstProcessedQuery(processed: ProcessedQuery, article: ResearchArticle): ArticleQueryMatch {
  const titleText = normalizeText(article.title || '')
  const venueText = normalizeText(article.venue || '')
  const abstractText = normalizeText(article.abstract || '')
  const fullText = [titleText, venueText, abstractText].filter(Boolean).join(' ').trim()

  const normalizedPhraseNeedles = uniquePreserveOrder(
    [
      ...processed.phrases.map((phrase) => normalizeText(phrase)).filter(Boolean),
      normalizeText(processed.cleanedQuery || processed.originalQuery),
    ].filter(Boolean)
  )

  const exactPhrase = normalizedPhraseNeedles.some((phrase) => titleText.includes(phrase) || fullText.includes(phrase))
  const normalizedFullQuery = normalizeText(processed.cleanedQuery || processed.originalQuery)
  const fullQueryInTitle = Boolean(normalizedFullQuery) && titleText.includes(normalizedFullQuery)
  const fullQueryInText = Boolean(normalizedFullQuery) && fullText.includes(normalizedFullQuery)

  let coreOk = true
  let matchedGroups = 0
  let originalMatches = 0
  let titleMatches = 0
  let score = 0

  for (const group of buildQueryValidationGroups(processed)) {
    const hasRegexTitle = group.regex ? group.regex.test(article.title || '') : false
    const hasRegexAbstract = group.regex ? group.regex.test(article.abstract || '') : false
    const matchedByRegex = hasRegexTitle || hasRegexAbstract

    const primaryInTitle = group.primaryTerms.some((term) => term && titleText.includes(term))
    const primaryInText = group.primaryTerms.some((term) => term && fullText.includes(term))
    const expandedInTitle = group.expandedTerms.some((term) => term && titleText.includes(term))
    const expandedInText = group.expandedTerms.some((term) => term && fullText.includes(term))

    const groupMatched = matchedByRegex || primaryInText || expandedInText
    const originalMatched = matchedByRegex || primaryInText
    const titleMatched = hasRegexTitle || primaryInTitle || expandedInTitle

    if (group.required && !groupMatched) coreOk = false
    if (!groupMatched) continue

    matchedGroups += 1
    if (originalMatched) originalMatches += 1
    if (titleMatched) titleMatches += 1

    if (hasRegexTitle || primaryInTitle) score += 8
    else if (expandedInTitle) score += 5
    else if (matchedByRegex || primaryInText) score += 4
    else if (expandedInText) score += 2
  }

  if (exactPhrase) score += 10
  if (fullQueryInTitle) score += 10
  if (fullQueryInText) score += 6

  return {
    coreOk,
    exactPhrase,
    fullQueryInTitle,
    fullQueryInText,
    matchedGroups,
    originalMatches,
    titleMatches,
    score,
  }
}

function isStrictArticleMatch(match: ArticleQueryMatch, groupCount: number): boolean {
  if (!match.coreOk) return false
  if (groupCount === 0) return true
  if (match.fullQueryInTitle) return true
  if (match.exactPhrase && (match.originalMatches >= 1 || match.matchedGroups >= 1)) return true

  const minGroupMatches = groupCount >= 5 ? 3 : groupCount >= 3 ? 2 : 1
  const minOriginalMatches = groupCount >= 4 ? 2 : 1
  const minTitleMatches = groupCount >= 4 ? 1 : 0

  return (
    match.matchedGroups >= minGroupMatches &&
    match.originalMatches >= minOriginalMatches &&
    match.titleMatches >= minTitleMatches
  )
}

function isSoftArticleMatch(match: ArticleQueryMatch): boolean {
  if (!match.coreOk) return false
  if (match.fullQueryInText || match.exactPhrase) return true
  return match.originalMatches >= 1 && (match.titleMatches >= 1 || match.matchedGroups >= 2 || match.score >= 8)
}

function compareArticleQueryMatch(
  a: { match: ArticleQueryMatch; relevanceScore: number },
  b: { match: ArticleQueryMatch; relevanceScore: number }
) {
  return (
    Number(b.match.fullQueryInTitle) - Number(a.match.fullQueryInTitle) ||
    Number(b.match.exactPhrase) - Number(a.match.exactPhrase) ||
    b.match.titleMatches - a.match.titleMatches ||
    b.match.originalMatches - a.match.originalMatches ||
    b.match.matchedGroups - a.match.matchedGroups ||
    b.match.score - a.match.score ||
    b.relevanceScore - a.relevanceScore
  )
}

function filterAndRankArticlesByProcessedQuery(
  processed: ProcessedQuery,
  items: Array<{ article: ResearchArticle; relevanceScore?: number }>
): ResearchArticle[] {
  const groups = buildQueryValidationGroups(processed)
  if (groups.length === 0) {
    return [...items]
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
      .map(({ article }) => article)
  }

  const scored = items.map(({ article, relevanceScore = 0 }) => ({
    article,
    relevanceScore,
    match: scoreArticleAgainstProcessedQuery(processed, article),
  }))

  const strictMatches = scored.filter(({ match }) => isStrictArticleMatch(match, groups.length))
  const chosenMatches = strictMatches.length > 0 ? strictMatches : scored.filter(({ match }) => isSoftArticleMatch(match))

  return chosenMatches.sort(compareArticleQueryMatch).map(({ article }) => article)
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
      const filteredArticles = filterAndRankArticlesByProcessedQuery(processed, validated)

      console.info('[ResearchAtlas] OpenAlexSearch', {
        originalQuery: processed.originalQuery,
        cleanedQuery: processed.cleanedQuery,
        extractedKeywords: processed.extractedKeywords,
        translatedKeywords: processed.translatedKeywords,
        attempt: attempt.name,
        urls,
        resultsReturned: filteredArticles.length,
      })

      if (filteredArticles.length > 0) {
        const totalEstimate = Math.max(
          titleOk ? (titleRes.data?.meta?.count || 0) : 0,
          abstractOk ? (abstractRes.data?.meta?.count || 0) : 0
        )
        return { articles: filteredArticles, total: totalEstimate }
      }
    }

    // If OpenAlex responded with errors for all attempts, surface it as an upstream issue.
    if (lastErrorCode) {
      return { articles: [], total: 0, errorCode: lastErrorCode }
    }

    return { articles: [], total: 0 }
  } catch (error) {
    console.error('[ResearchAtlas] OpenAlex fetch error:', error)
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
      console.info('[ResearchAtlas] OpenAlexAdvancedSearch', {
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
    console.error('[ResearchAtlas] OpenAlex advanced fetch error:', error)
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
    console.error('[ResearchAtlas] Crossref fetch error:', error)
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
    const modeParam = (searchParams.get('mode') || '').toLowerCase()
    const plannerMode =
      modeParam === 'planner' ||
      searchParams.get('plan') === 'true' ||
      (searchParams.get('response') || '').toLowerCase() === 'plan'

    if (plannerMode) {
      if (!rawQuery) {
        return json({ error: 'Please enter a search query.', code: 'EMPTY_QUERY' }, { status: 400 })
      }

      return json(buildOpenAlexRequestPlan(rawQuery))
    }

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
    combined = filterAndRankArticlesByProcessedQuery(
      processedForOpenAlex,
      combined.map((article) => ({ article }))
    )
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
    console.error('[ResearchAtlas] Search API error:', error)
    return json({ error: 'Unexpected server error while searching. Please retry.', code: 'SEARCH_FAILED' }, { status: 500 })
  }
}

export function OPTIONS(request: NextRequest) {
  return corsPreflightResponse(request)
}
