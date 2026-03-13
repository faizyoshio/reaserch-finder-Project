'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { Sparkles } from 'lucide-react'
import RouteLoading from './loading'
import { TopBar } from '@/components/top-bar'
import { Footer } from '@/components/footer'
import { SearchInput } from '@/components/search-input'
import { AdvancedSearchInput, type AdvancedSearchFields } from '@/components/advanced-search-input'
import { SearchFilters } from '@/components/search-filters'
import { ResultCard } from '@/components/result-card'
import { SearchStats } from '@/components/search-stats'
import { ResultSkeleton } from '@/components/result-skeleton'
import { Button } from '@/components/ui/button'
import { FilterToggleButton, FilterPanel } from '@/components/search-filters'
import type { ResearchArticle, SearchParams, SearchResponse, SavedArticle } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import { validation, safeHttpUrl } from '@/lib/utils'

type SearchMode = 'basic' | 'advanced'

type SearchRequest =
  | { mode: 'basic'; q: string }
  | { mode: 'advanced'; fields: AdvancedSearchFields }

function normalizeDoiInput(doi: string): string {
  return doi
    .trim()
    .replace(/\s+/g, '')
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:/i, '')
}

function isProbablyDoiInput(doi: string): boolean {
  if (!doi) return false
  if (doi.length > 200) return false
  if (/[\r\n\t]/.test(doi)) return false
  return /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(doi)
}

function hasAnyAdvancedField(fields: AdvancedSearchFields): boolean {
  return Boolean(fields.author.trim() || fields.title.trim() || fields.doi.trim() || fields.affiliation.trim())
}

function buildAdvancedDisplayQuery(fields: AdvancedSearchFields): string {
  const parts = [fields.title, fields.author, fields.affiliation, fields.doi].map((p) => (p || '').trim()).filter(Boolean)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

const ADVANCED_FIELD_MAX = 300

function formatErrorMessage(message: string, details: { status?: number; code?: string } = {}) {
  const tags: string[] = []
  if (details.status) tags.push(`HTTP ${details.status}`)
  if (details.code) tags.push(details.code)
  return tags.length > 0 ? `${message} (${tags.join(' / ')})` : message
}

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  // Search state
  const initialUrlRef = React.useRef<{
    advancedFields: AdvancedSearchFields
    mode: SearchMode
    q: string
  } | null>(null)

  if (!initialUrlRef.current) {
    const advanced: AdvancedSearchFields = {
      author: searchParams.get('author') || '',
      title: searchParams.get('title') || '',
      doi: searchParams.get('doi') || '',
      affiliation: searchParams.get('affiliation') || '',
    }

    const modeParam = (searchParams.get('mode') || '').toLowerCase()
    const mode: SearchMode = modeParam === 'advanced' || hasAnyAdvancedField(advanced) ? 'advanced' : 'basic'

    initialUrlRef.current = {
      advancedFields: advanced,
      mode,
      q: searchParams.get('q') || '',
    }
  }

  const initialAdvancedFields = initialUrlRef.current.advancedFields
  const initialMode = initialUrlRef.current.mode
  const initialQ = initialUrlRef.current.q

  const [searchMode, setSearchMode] = useState<SearchMode>(initialMode)
  const [advancedFields, setAdvancedFields] = useState<AdvancedSearchFields>(initialAdvancedFields)
  const [lastRequest, setLastRequest] = useState<SearchRequest | null>(() => {
    if (initialMode === 'advanced' && hasAnyAdvancedField(initialAdvancedFields)) {
      return { mode: 'advanced', fields: initialAdvancedFields }
    }
    if (initialQ) {
      return { mode: 'basic', q: initialQ }
    }
    return null
  })
  const [doiError, setDoiError] = useState<string | null>(null)
  const [advancedError, setAdvancedError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [params, setParams] = useState<SearchParams>({
    q: initialQ,
    page: parseInt(searchParams.get('page') || '1'),
    perPage: 25,
    yearFrom: searchParams.get('yearFrom') ? parseInt(searchParams.get('yearFrom')!) : undefined,
    yearTo: searchParams.get('yearTo') ? parseInt(searchParams.get('yearTo')!) : undefined,
    oaOnly: searchParams.get('oaOnly') === 'true',
    sort: (searchParams.get('sort') as 'relevance' | 'year' | 'citedBy') || 'relevance',
    sortDir: (searchParams.get('sortDir') as 'asc' | 'desc') || 'desc',
    documentType: searchParams.get('documentType') || undefined,
    language: searchParams.get('language') || undefined,
  })

  const [results, setResults] = useState<ResearchArticle[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showIntro, setShowIntro] = useState(true)
  const [hasSearched, setHasSearched] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>([])
  const [statusMessage, setStatusMessage] = useState('Ready to discover sources.')

  const [recentSearches, setRecentSearches] = useState<string[]>([])

  const [filtersVisible, setFiltersVisible] = useState(false)
  const toggleFilters = () => setFiltersVisible((v) => !v)

  // Load saved articles from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('researchfinder-saved')
    if (saved) {
      try {
        setSavedArticles(JSON.parse(saved))
      } catch {
        console.error('[ResearchAtlas] Failed to load saved articles')
      }
    }
  }, []) 

  // Load recent searches
  useEffect(() => {
    const recent = localStorage.getItem('researchfinder-recent')
    if (recent) {
      try {
        setRecentSearches(JSON.parse(recent))
      } catch {
        // ignore
      }
    }
  }, [])

  // Perform search
  const performSearch = React.useCallback(
    async (request: SearchRequest, searchParams: SearchParams) => {
      let displayQuery = ''
      let normalizedRequest: SearchRequest = request

      if (request.mode === 'basic') {
        setAdvancedError(null)
        displayQuery = request.q
        if (!validation.isValidSearchQuery(displayQuery)) {
          const message = validation.getValidationMessage(displayQuery)
          setStatusMessage(message)
          toast({
            title: 'Warning',
            description: message,
            variant: 'destructive',
          })
          return
        }
      } else {
        const trimmedFields: AdvancedSearchFields = {
          author: request.fields.author.trim(),
          title: request.fields.title.trim(),
          doi: request.fields.doi.trim(),
          affiliation: request.fields.affiliation.trim(),
        }
        normalizedRequest = { mode: 'advanced', fields: trimmedFields }
        displayQuery = buildAdvancedDisplayQuery(trimmedFields)
        setAdvancedError(null)

        if (!hasAnyAdvancedField(trimmedFields)) {
          const message = 'Enter at least one advanced field.'
          const formatted = formatErrorMessage(message, { code: 'ADVANCED_EMPTY' })
          setAdvancedError(formatted)
          setStatusMessage(formatted)
          toast({
            title: 'Warning',
            description: formatted,
            variant: 'destructive',
          })
          return
        }

        const fieldEntries = Object.entries(trimmedFields) as Array<[keyof AdvancedSearchFields, string]>
        const tooLong = fieldEntries.find(([, value]) => value.length > ADVANCED_FIELD_MAX)
        if (tooLong) {
          const [key] = tooLong
          const message = `Advanced field too long: ${key}`
          const formatted = formatErrorMessage(message, { code: 'ADVANCED_FIELD_TOO_LONG' })
          setAdvancedError(formatted)
          setStatusMessage(formatted)
          toast({
            title: 'Warning',
            description: formatted,
            variant: 'destructive',
          })
          return
        }

        if (trimmedFields.doi) {
          const normalized = normalizeDoiInput(trimmedFields.doi)
          if (!isProbablyDoiInput(normalized)) {
            const message = 'Invalid DOI format.'
            const formatted = formatErrorMessage(message, { code: 'INVALID_DOI' })
            setDoiError('Invalid DOI format. Example: 10.1234/abcd')
            setStatusMessage(formatted)
            toast({
              title: 'Warning',
              description: formatted,
              variant: 'destructive',
            })
            return
          }
        }

        setDoiError(null)
      }

      setLastRequest(normalizedRequest)
      setLoading(true)
      setShowIntro(false)
      setHasSearched(true)

      try {
        const queryString = new URLSearchParams()
        queryString.set('page', searchParams.page.toString())
        queryString.set('perPage', searchParams.perPage.toString())
        queryString.set('oaOnly', searchParams.oaOnly.toString())
        queryString.set('sort', searchParams.sort)
        if (searchParams.sortDir) queryString.set('sortDir', searchParams.sortDir)
        if (searchParams.yearFrom) queryString.set('yearFrom', searchParams.yearFrom.toString())
        if (searchParams.yearTo) queryString.set('yearTo', searchParams.yearTo.toString())
        if (searchParams.documentType) queryString.set('documentType', searchParams.documentType)
        if (searchParams.language) queryString.set('language', searchParams.language)

        if (normalizedRequest.mode === 'basic') {
          queryString.set('q', normalizedRequest.q)
        } else {
          queryString.set('mode', 'advanced')
          const fields = normalizedRequest.fields
          if (fields.author) queryString.set('author', fields.author)
          if (fields.title) queryString.set('title', fields.title)
          if (fields.doi) queryString.set('doi', fields.doi)
          if (fields.affiliation) queryString.set('affiliation', fields.affiliation)
        }

        const response = await fetch(`/api/search?${queryString}`)
        if (!response.ok) {
          let message = 'Search failed'
          let code: string | undefined
          try {
            const payload = await response.json()
            message = payload.error || message
            code = payload.code
          } catch {
            // ignore parse error
          }
          const formatted = formatErrorMessage(message, { status: response.status, code })
          if (normalizedRequest.mode === 'advanced') setAdvancedError(formatted)
          throw new Error(formatted)
        }

        const data: SearchResponse = await response.json()
        setResults(data.articles)
        setTotal(data.total)
        setHasMore(Boolean(data.hasMore))
        if (data.warnings && data.warnings.length > 0) {
          toast({
            title: 'Partial Results',
            description: data.warnings.join(' '),
          })
        }
        setStatusMessage(
          data.articles.length > 0
            ? `${data.total.toLocaleString()} results found.`
            : normalizedRequest.mode === 'advanced' && normalizedRequest.fields.doi
              ? 'No result found for this DOI.'
              : `No results found for "${displayQuery}".`
        )

        // Update URL
        router.push(`/?${queryString}`)
      } catch (error) {
        console.error('[ResearchAtlas] Search error')
        const errorMessage = error instanceof Error ? error.message : 'Search failed'
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        })
        setStatusMessage(errorMessage)
        setResults([])
      } finally {
        setLoading(false)
      }
    },
    [router, toast]
  )

  // Perform initial search if query in URL
  useEffect(() => {
    if (hasSearched) return

    if (initialMode === 'advanced' && hasAnyAdvancedField(initialAdvancedFields)) {
      const fields = initialAdvancedFields
      const display = buildAdvancedDisplayQuery(fields)
      const newParams: SearchParams = { ...params, q: display }
      setParams(newParams)
      performSearch({ mode: 'advanced', fields }, newParams)
      setHasSearched(true)
      setShowIntro(false)
      return
    }

    if (params.q) {
      setQuery(params.q)
      performSearch({ mode: 'basic', q: params.q }, params)
      setHasSearched(true)
    }
  }, [hasSearched, initialAdvancedFields, initialMode, params, performSearch])

  const handleSearch = () => {
    const newParams: SearchParams = {
      ...params,
      q: query,
      page: 1,
    }
    setParams(newParams)
    performSearch({ mode: 'basic', q: query }, newParams)
  }

  const handleAdvancedSearch = () => {
    const trimmed: AdvancedSearchFields = {
      author: advancedFields.author.trim(),
      title: advancedFields.title.trim(),
      doi: advancedFields.doi.trim(),
      affiliation: advancedFields.affiliation.trim(),
    }

    const display = buildAdvancedDisplayQuery(trimmed)
    const newParams: SearchParams = {
      ...params,
      q: display,
      page: 1,
    }

    setParams(newParams)
    performSearch({ mode: 'advanced', fields: trimmed }, newParams)
  }

  const handleAdvancedFieldsChange = (changes: Partial<AdvancedSearchFields>) => {
    setAdvancedFields((prev) => ({ ...prev, ...changes }))
    if (typeof changes.doi === 'string') setDoiError(null)
    setAdvancedError(null)
  }

  const rerunLastSearch = (newParams: SearchParams) => {
    if (!lastRequest) return
    if (lastRequest.mode === 'basic' && !lastRequest.q.trim()) return
    if (lastRequest.mode === 'advanced' && !hasAnyAdvancedField(lastRequest.fields)) return
    performSearch(lastRequest, newParams)
  }

  const handleParamsChange = (changes: Partial<SearchParams>) => {
    const newParams = { ...params, ...changes }
    setParams(newParams)

    rerunLastSearch(newParams)
  }

  const handleSaveArticle = (article: ResearchArticle) => {
    const existingSaved = savedArticles.find(
      (s) => s.doi === article.doi || (s.source === article.source && s.id === article.id)
    )

    if (!existingSaved) {
      const newSavedArticle: SavedArticle = {
        ...article,
        savedAt: new Date().toISOString(),
      }
      const updated = [...savedArticles, newSavedArticle]
      setSavedArticles(updated)
      localStorage.setItem('researchfinder-saved', JSON.stringify(updated))
    }
  }

  const handleUnsaveArticle = (articleKey: string) => {
    const updated = savedArticles.filter((s) => (s.doi || `${s.source}-${s.id}`) !== articleKey)
    setSavedArticles(updated)
    localStorage.setItem('researchfinder-saved', JSON.stringify(updated))
  }

  const isSaved = (article: ResearchArticle) =>
    savedArticles.some((s) => s.doi === article.doi || (s.source === article.source && s.id === article.id))

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())
  const getSelectedArticles = () =>
    results.filter((article) => {
      const key = article.doi || `${article.source}-${article.id}`
      return selectedIds.has(key)
    })

  const saveSelectedArticles = () => {
    const selectedArticles = getSelectedArticles()
    if (selectedArticles.length === 0) return

    let added = 0
    const merged = [...savedArticles]
    selectedArticles.forEach((article) => {
      const exists = merged.some(
        (saved) => saved.doi === article.doi || (saved.source === article.source && saved.id === article.id)
      )
      if (exists) return
      merged.push({ ...article, savedAt: new Date().toISOString() })
      added += 1
    })

    setSavedArticles(merged)
    localStorage.setItem('researchfinder-saved', JSON.stringify(merged))
    toast({
      title: 'Saved',
      description: `${added} source${added === 1 ? '' : 's'} added to Saved.`,
    })
  }

  const exportSelectedBibtex = () => {
    if (selectedIds.size === 0) return
    // build simple BibTeX entries from current results
    const entries: string[] = []
    results.forEach((article) => {
      const idKey = article.doi || `${article.source}-${article.id}`
      if (!selectedIds.has(idKey)) return
      const escapeBibTeX = (value: string) =>
        value
          .replace(/[\r\n]+/g, ' ')
          .replace(/\\/g, '\\\\')
          .replace(/[{}]/g, (m) => `\\${m}`)
          .trim()
      const citeKey = (article.doi || article.id || article.title).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
      const authors = escapeBibTeX((article.authors || []).join(' and ') || 'Unknown')
      const title = escapeBibTeX(article.title || 'Untitled')
      const url = safeHttpUrl(article.url) || ''
      entries.push(`@article{${citeKey},\n  title = {${title}},\n  author = {${authors}},\n  year = {${article.year || ''}},\n  url = {${url}}\n}`)
    })

    const blob = new Blob([entries.join('\n\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `researchatlas-export.bib`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    clearSelection()
  }

  const exportSelectedRis = () => {
    if (selectedIds.size === 0) return
    const selectedArticles = getSelectedArticles()
    const entries = selectedArticles.map((article) => {
      const sanitizeRisValue = (value: string) => value.replace(/[\r\n]+/g, ' ').trim()
      const authorLines = (article.authors || []).map((author) => `AU  - ${sanitizeRisValue(author)}`).join('\n')
      const url = safeHttpUrl(article.url)
      return [
        'TY  - JOUR',
        `TI  - ${sanitizeRisValue(article.title || 'Untitled')}`,
        authorLines,
        `PY  - ${article.year || ''}`,
        article.venue ? `JO  - ${sanitizeRisValue(article.venue)}` : '',
        article.doi ? `DO  - ${sanitizeRisValue(article.doi)}` : '',
        url ? `UR  - ${url}` : '',
        'ER  - ',
      ]
        .filter(Boolean)
        .join('\n')
    })

    const blob = new Blob([entries.join('\n\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'researchatlas-export.ris'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    clearSelection()
  }

  const openSelectedDoi = () => {
    const selectedWithDoi = getSelectedArticles().filter((article) => article.doi)
    if (selectedWithDoi.length === 0) {
      toast({
        title: 'No DOI',
        description: 'Selected sources do not have DOI links.',
      })
      return
    }

    const maxTabs = 8
    selectedWithDoi.slice(0, maxTabs).forEach((article) => {
      window.open(`https://doi.org/${article.doi}`, '_blank', 'noopener,noreferrer')
    })

    if (selectedWithDoi.length > maxTabs) {
      toast({
        title: 'Open limit applied',
        description: `Opened first ${maxTabs} DOI links for safety.`,
      })
    }
  }

  // Keyboard shortcuts: '/' focus search, 'n' next, 'p' prev
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ignore when typing in inputs
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) return

      if (e.key === '/') {
        e.preventDefault()
        const selector =
          searchMode === 'advanced'
            ? 'input[data-search-primary="advanced"]'
            : 'input[aria-label="Search journals, research books, e-books, or web books"]'
        const el = document.querySelector(selector) as HTMLInputElement | null
        el?.focus()
      }
      if (e.key === 'n') {
        if (hasMore) {
          const newParams = { ...params, page: params.page + 1 }
          setParams(newParams)
          if (lastRequest) performSearch(lastRequest, newParams)
        }
      }
      if (e.key === 'p') {
        if (params.page > 1) {
          const newParams = { ...params, page: Math.max(1, params.page - 1) }
          setParams(newParams)
          if (lastRequest) performSearch(lastRequest, newParams)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [hasMore, lastRequest, params, performSearch, searchMode])


  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />

      <main id="main-content" aria-busy={loading} className="flex-1 px-2 sm:px-4 py-4 sm:py-6 max-w-5xl mx-auto w-full">
        <div className="sr-only" role="status" aria-live="polite">
          {loading ? 'Searching sources...' : statusMessage}
        </div>
        {/* */}
        <div className="search-toggle-stack sticky top-2 z-40 mb-4 rounded-2xl bg-background/80 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex-1">
            {searchMode === 'advanced' ? (
              <AdvancedSearchInput
                fields={advancedFields}
                onChange={handleAdvancedFieldsChange}
                onSearch={handleAdvancedSearch}
                doiError={doiError}
                validationMessage={advancedError}
              />
            ) : (
              <SearchInput value={query} onChange={setQuery} onSearch={handleSearch} />
            )}
          </div>
          <div className="sm:ml-2 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => {
                setSearchMode((prev) => (prev === 'advanced' ? 'basic' : 'advanced'))
                setDoiError(null)
                setAdvancedError(null)
              }}
              aria-pressed={searchMode === 'advanced'}
              className={`glass-button px-4 py-2 text-sm font-medium transition-all hover:ring-2 hover:ring-foreground/20 ${searchMode === 'advanced' ? 'ring-2 ring-emerald-500/60' : ''}`}
            >
              <span className="inline-flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Advanced
              </span>
            </button>
            <FilterToggleButton
              isVisible={filtersVisible}
              onClick={toggleFilters}
            />
          </div>
        </div>

        {/* */}
        <FilterPanel isVisible={filtersVisible}>
          <SearchFilters params={params} onParamsChange={handleParamsChange} />
        </FilterPanel>

        {/* */}
        {showIntro && (
          <div className="glass rounded-2xl p-6 sm:p-8 mb-8 text-center animate-glass-in">
            <div className="relative h-[clamp(3rem,11vw,4.25rem)] w-[clamp(3rem,11vw,4.25rem)] rounded-2xl glass-button p-0 flex items-center justify-center mx-auto mb-4 overflow-hidden">
              <Image
                src="/researchatlas-icon.png"
                alt="ResearchAtlas icon"
                fill
                sizes="(max-width: 640px) 40px, 52px"
                className="rounded-xl object-contain p-2 sm:p-2.5"
                priority
              />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-balance">
              Discover Research Resources
            </h2>
            <p className="text-sm sm:text-base text-foreground/70 leading-relaxed max-w-2xl mx-auto text-pretty">
              ResearchAtlas helps you find journals, research books, e-books, and trusted web publications from open,
              legal, and academic-friendly sources. Use one workspace to explore references for coursework, writing,
              and long-form study.
            </p>
            <p className="text-xs sm:text-sm text-foreground/50 mt-4">
              One search flow for journals, books, and open knowledge on the web
            </p>
          </div>
        )}

        {/* */}
        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <ResultSkeleton key={i} />
            ))}
          </div>
        )}

        {!loading && hasSearched && results.length === 0 && (
          <div className="glass rounded-2xl p-6 sm:p-8 mb-6">
            <h3 className="text-lg font-bold mb-2">No sources found for &quot;{params.q}&quot;</h3>
            <p className="text-sm text-foreground/70 mb-3">
              {searchMode === 'advanced'
                ? 'Try relaxing fields, correcting DOI, or clearing filters.'
                : 'Try different keywords, broaden the query, or clear filters.'}
            </p>

            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              {(params.yearFrom || params.yearTo) && (
                <Button
                  onClick={() => {
                    const newParams: SearchParams = { ...params, yearFrom: undefined, yearTo: undefined, page: 1 }
                    setParams(newParams)
                    rerunLastSearch(newParams)
                  }}
                  className="glass-button"
                >
                  Remove Year Filter
                </Button>
              )}

              {params.oaOnly && (
                <Button
                  onClick={() => {
                    const newParams: SearchParams = { ...params, oaOnly: false, page: 1 }
                    setParams(newParams)
                    rerunLastSearch(newParams)
                  }}
                  className="glass-button"
                >
                  Disable OA-only
                </Button>
              )}

              {searchMode === 'basic' && (
                <Button
                  onClick={() => {
                    // Broaden search by reducing phrase specificity.
                    const parts = (params.q || '').trim().split(/\s+/).filter(Boolean)
                    const newQuery = parts.length > 2 ? parts.slice(0, 2).join(' ') : params.q
                    const newParams: SearchParams = { ...params, q: newQuery, page: 1 }
                    setQuery(newQuery)
                    setParams(newParams)
                    performSearch({ mode: 'basic', q: newQuery }, newParams)
                  }}
                  className="glass-button"
                >
                  Try Broader Keywords
                </Button>
              )}

              <Button
                onClick={() => {
                  const newParams: SearchParams = {
                    ...params,
                    yearFrom: undefined,
                    yearTo: undefined,
                    documentType: undefined,
                    language: undefined,
                    oaOnly: false,
                    sort: 'relevance',
                    sortDir: 'desc',
                    page: 1,
                  }
                  setParams(newParams)
                  rerunLastSearch(newParams)
                }}
                className="glass-button"
              >
                Reset All Filters
              </Button>
            </div>

            {searchMode === 'basic' && recentSearches.length > 0 && (
              <div className="mb-3">
                <div className="text-sm text-foreground/60 mb-2">Recent searches</div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        const newParams = { ...params, q: r, page: 1 }
                        setQuery(r)
                        setParams(newParams)
                        performSearch({ mode: 'basic', q: r }, newParams)
                      }}
                      className="glass-badge text-sm"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && results.length > 0 && (
          <div>
            {/* */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-sm text-foreground/60">
                <span className="font-medium">
                  {((params.page - 1) * params.perPage) + 1}-{((params.page - 1) * params.perPage) + results.length}
                </span>
                <span> of </span>
                <span className="font-medium">{total.toLocaleString()}</span>
                <span> results</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-sm text-foreground/50 mr-2">
                  Page <span className="font-medium text-foreground">{params.page}</span>
                </div>

                {/* */}
                <label className="text-sm text-foreground/60 flex items-center gap-2">
                  <span className="text-foreground/50">Sort:</span>
                  <select
                    aria-label="Sort results"
                    value={params.sort}
                    onChange={(e) => {
                      const newSort = e.target.value as 'relevance' | 'year' | 'citedBy'
                      const newParams = { ...params, sort: newSort, page: 1 }
                      setParams(newParams)
                      rerunLastSearch(newParams)
                    }}
                    className="glass-button px-2 py-1 text-sm"
                  >
                    <option value="relevance">Relevance</option>
                    <option value="year">Year</option>
                    <option value="citedBy">Cited By</option>
                  </select>

                {/* */}
                <button
                  aria-label="Toggle sort direction"
                  title={params.sortDir === 'asc' ? 'Ascending' : 'Descending'}
                  onClick={() => {
                    const newDir: NonNullable<SearchParams['sortDir']> = params.sortDir === 'asc' ? 'desc' : 'asc'
                    const newParams: SearchParams = { ...params, sortDir: newDir, page: 1 }
                    setParams(newParams)
                    rerunLastSearch(newParams)
                  }}
                    className="glass-button px-2 py-1 text-sm"
                  >
                    {params.sortDir === 'asc' ? 'Up' : 'Down'}
                  </button>
                </label>
              </div>
            </div>

            {/* */}
            <SearchStats results={results} />

            {/* */}
            <div className="mb-4 text-sm text-foreground/50">Atlas &gt; Search</div>

            {/* */}
            <div className="result-list">
              {results.map((article) => {
                const idKey = article.doi || `${article.source}-${article.id}`
                return (
                  <ResultCard
                    key={idKey}
                    article={article}
                    query={params.q}
                    isSaved={isSaved(article)}
                    onSave={handleSaveArticle}
                    onUnsave={handleUnsaveArticle}
                    selectable
                    selected={selectedIds.has(idKey)}
                    onToggleSelect={toggleSelect}
                  />
                )
              })}
            </div>

            {/* */}
            {(hasMore || params.page > 1 || selectedIds.size > 0) && (
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 glass rounded-2xl p-6">
                <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                  {selectedIds.size > 0 && (
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                      <span className="text-sm text-foreground/70">{selectedIds.size} selected</span>
                      <Button onClick={saveSelectedArticles} className="glass-button">
                        Save Selected
                      </Button>
                      <Button onClick={exportSelectedBibtex} className="glass-button">
                        Export BibTeX
                      </Button>
                      <Button onClick={exportSelectedRis} className="glass-button">
                        Export RIS
                      </Button>
                      <Button onClick={openSelectedDoi} className="glass-button">
                        Open DOI Links
                      </Button>
                    </div>
                  )}

                  {(hasMore || params.page > 1) && (
                    <>
                      <Button
                        onClick={() => {
                          const newParams = { ...params, page: Math.max(1, params.page - 1) }
                          setParams(newParams)
                          rerunLastSearch(newParams)
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                        disabled={params.page === 1}
                        className="glass-button w-full sm:w-auto"
                      >
                        Previous Page
                      </Button>

                      <div className="text-center">
                        <div className="text-sm text-foreground/70">
                          Page <span className="font-bold text-foreground">{params.page}</span>
                        </div>
                        {total > 0 && (
                          <div className="text-xs text-foreground/50">
                            {Math.ceil(total / params.perPage)} pages total
                          </div>
                        )}
                      </div>

                      <Button
                        onClick={() => {
                          const newParams = { ...params, page: params.page + 1 }
                          setParams(newParams)
                          rerunLastSearch(newParams)
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                        disabled={!hasMore}
                        className="glass-button w-full sm:w-auto"
                        style={{ opacity: hasMore ? 1 : 0.5, cursor: hasMore ? 'pointer' : 'not-allowed' }}
                      >
                        Next Page
                      </Button>
                    </>
                  )}

                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <HomeContent />
    </Suspense>
  )
}
