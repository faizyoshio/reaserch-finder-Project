export interface ResearchArticle {
  id: string
  title: string
  authors: string[]
  year: number
  venue?: string
  doi?: string
  url?: string
  documentType?: string
  citedBy: number
  openAccess: boolean
  source: 'openAlex' | 'crossref' | 'combined'
  abstract?: string
  relevanceReasons?: string[]
}

export interface SearchParams {
  q: string
  page: number
  perPage: number
  yearFrom?: number
  yearTo?: number
  oaOnly: boolean
  sort: 'relevance' | 'year' | 'citedBy'
  sortDir?: 'asc' | 'desc'
  documentType?: string
  language?: string
}

export interface SearchResponse {
  articles: ResearchArticle[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
  warnings?: string[]
}

export interface ExportFormat {
  format: 'bibtex' | 'ris'
  content: string
  filename: string
}

export interface SavedArticle extends ResearchArticle {
  savedAt: string
}
