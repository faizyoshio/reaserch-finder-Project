'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import RouteLoading from './loading'
import { TopBar } from '@/components/top-bar'
import { Footer } from '@/components/footer'
import { SearchInput } from '@/components/search-input'
import { SearchFilters } from '@/components/search-filters'
import { ResultCard } from '@/components/result-card'
import { ResultSkeleton } from '@/components/result-skeleton'
import { Button } from '@/components/ui/button'
import { FilterToggleButton, FilterPanel } from '@/components/search-filters'
import type { ResearchArticle, SearchParams, SearchResponse, SavedArticle } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import { validation } from '@/lib/utils'

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  // Search state
  const [query, setQuery] = useState('')
  const [params, setParams] = useState<SearchParams>({
    q: searchParams.get('q') || '',
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
  const [statusMessage, setStatusMessage] = useState('Ready to search.')

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
        console.error('[ResearchFinder] Failed to load saved articles')
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
    async (searchQuery: string, searchParams: SearchParams) => {
      if (!validation.isValidSearchQuery(searchQuery)) {
        setStatusMessage(validation.getValidationMessage(searchQuery))
        toast({
          title: 'Warning',
          description: validation.getValidationMessage(searchQuery),
          variant: 'destructive',
        })
        return
      }

      setLoading(true)
      setShowIntro(false)
      setHasSearched(true)

      try {
        const queryString = new URLSearchParams({
          q: searchQuery,
          page: searchParams.page.toString(),
          perPage: searchParams.perPage.toString(),
          oaOnly: searchParams.oaOnly.toString(),
          sort: searchParams.sort,
          ...(searchParams.sortDir && { sortDir: searchParams.sortDir }),
          ...(searchParams.yearFrom && { yearFrom: searchParams.yearFrom.toString() }),
          ...(searchParams.yearTo && { yearTo: searchParams.yearTo.toString() }),
          ...(searchParams.documentType && { documentType: searchParams.documentType }),
          ...(searchParams.language && { language: searchParams.language }),
        })

        const response = await fetch(`/api/search?${queryString}`)
        if (!response.ok) {
          let message = 'Search failed'
          try {
            const payload = await response.json()
            message = payload.error || message
          } catch {
            // ignore parse error
          }
          throw new Error(message)
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
            : `No results found for "${searchQuery}".`
        )

        // Update URL
        router.push(`/?${queryString}`)
      } catch (error) {
        console.error('[ResearchFinder] Search error:', error)
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
    if (params.q && !hasSearched) {
      setQuery(params.q)
      performSearch(params.q, params)
      setHasSearched(true)
    }
  }, [hasSearched, params, performSearch])

  const handleSearch = () => {
    const newParams: SearchParams = {
      ...params,
      q: query,
      page: 1,
    }
    setParams(newParams)
    performSearch(query, newParams)
  }

  const handleParamsChange = (changes: Partial<SearchParams>) => {
    const newParams = { ...params, ...changes }
    setParams(newParams)

    if (params.q) {
      performSearch(params.q, newParams)
    }
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
      description: `${added} article${added === 1 ? '' : 's'} added to Saved.`,
    })
  }

  const exportSelectedBibtex = () => {
    if (selectedIds.size === 0) return
    // build simple BibTeX entries from current results
    const entries: string[] = []
    results.forEach((article) => {
      const idKey = article.doi || `${article.source}-${article.id}`
      if (!selectedIds.has(idKey)) return
      const citeKey = (article.doi || article.id || article.title).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
      const authors = (article.authors || []).join(' and ')
      entries.push(`@article{${citeKey},\n  title = {${article.title}},\n  author = {${authors}},\n  year = {${article.year || ''}},\n  url = {${article.url || ''}}\n}`)
    })

    const blob = new Blob([entries.join('\n\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `researchfinder-export.bib`
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
      const authorLines = (article.authors || []).map((author) => `AU  - ${author}`).join('\n')
      return [
        'TY  - JOUR',
        `TI  - ${article.title}`,
        authorLines,
        `PY  - ${article.year || ''}`,
        article.venue ? `JO  - ${article.venue}` : '',
        article.doi ? `DO  - ${article.doi}` : '',
        article.url ? `UR  - ${article.url}` : '',
        'ER  - ',
      ]
        .filter(Boolean)
        .join('\n')
    })

    const blob = new Blob([entries.join('\n\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'researchfinder-export.ris'
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
        description: 'Selected articles do not have DOI links.',
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
        const el = document.querySelector('input[aria-label="Search for academic articles"]') as HTMLInputElement | null
        el?.focus()
      }
      if (e.key === 'n') {
        if (hasMore) {
          const newParams = { ...params, page: params.page + 1 }
          setParams(newParams)
          performSearch(params.q, newParams)
        }
      }
      if (e.key === 'p') {
        if (params.page > 1) {
          const newParams = { ...params, page: Math.max(1, params.page - 1) }
          setParams(newParams)
          performSearch(params.q, newParams)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [hasMore, params, performSearch])


  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />

      <main id="main-content" aria-busy={loading} className="flex-1 px-2 sm:px-4 py-4 sm:py-6 max-w-5xl mx-auto w-full">
        <div className="sr-only" role="status" aria-live="polite">
          {loading ? 'Searching articles...' : statusMessage}
        </div>
        {/* Search & Filter Toggle */}
        <div className="flex items-center gap-2 mb-4 search-toggle-stack">
          <div className="flex-1">
            <SearchInput
              value={query}
              onChange={setQuery}
              onSearch={handleSearch}
            />
          </div>
          <div className="ml-2">
            <FilterToggleButton
              isVisible={filtersVisible}
              onClick={toggleFilters}
            />
          </div>
        </div>

        {/* Filter Panel with animation */}
        <FilterPanel isVisible={filtersVisible}>
          <SearchFilters params={params} onParamsChange={handleParamsChange} />
        </FilterPanel>


        {/* Intro Section */}
        {showIntro && (
          <div className="glass rounded-2xl p-6 sm:p-8 mb-8 text-center animate-glass-in">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl glass-button flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-balance">
              Find Your Research
            </h2>
            <p className="text-sm sm:text-base text-foreground/70 leading-relaxed max-w-2xl mx-auto text-pretty">
              ResearchFinder is a dedicated scholarly platform designed to streamline the discovery of academic
              literature and research publications. By providing an intuitive interface for accessing credible journals
              and data, we empower researchers and students to build a solid foundation for their scientific inquiries.
            </p>
            <p className="text-xs sm:text-sm text-foreground/50 mt-4">
              Access global academic journals and research
            </p>
          </div>
        )}

        {/* Results */}
        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <ResultSkeleton key={i} />
            ))}
          </div>
        )}

        {!loading && hasSearched && results.length === 0 && (
          <div className="glass rounded-2xl p-6 sm:p-8 mb-6">
            <h3 className="text-lg font-bold mb-2">No results for &quot;{params.q}&quot;</h3>
            <p className="text-sm text-foreground/70 mb-3">Try different keywords, broaden the query, or clear filters.</p>

            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              {(params.yearFrom || params.yearTo) && (
                <Button
                  onClick={() => {
                    const newParams: SearchParams = { ...params, yearFrom: undefined, yearTo: undefined, page: 1 }
                    setParams(newParams)
                    if (params.q) performSearch(params.q, newParams)
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
                    if (params.q) performSearch(params.q, newParams)
                  }}
                  className="glass-button"
                >
                  Disable OA-only
                </Button>
              )}

              <Button
                onClick={() => {
                  // Broaden search by reducing phrase specificity.
                  const parts = (params.q || '').trim().split(/\s+/).filter(Boolean)
                  const newQuery = parts.length > 2 ? parts.slice(0, 2).join(' ') : params.q
                  const newParams: SearchParams = { ...params, q: newQuery, page: 1 }
                  setQuery(newQuery)
                  setParams(newParams)
                  performSearch(newQuery, newParams)
                }}
                className="glass-button"
              >
                Try Broader Keywords
              </Button>

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
                  if (params.q) performSearch(params.q, newParams)
                }}
                className="glass-button"
              >
                Reset All Filters
              </Button>
            </div>

            {recentSearches.length > 0 && (
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
                        performSearch(r, newParams)
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
            {/* Results Info */}
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

                {/* Sort order selector */}
                <label className="text-sm text-foreground/60 flex items-center gap-2">
                  <span className="text-foreground/50">Sort:</span>
                  <select
                    aria-label="Sort results"
                    value={params.sort}
                    onChange={(e) => {
                      const newSort = e.target.value as 'relevance' | 'year' | 'citedBy'
                      const newParams = { ...params, sort: newSort, page: 1 }
                      setParams(newParams)
                      if (params.q) performSearch(params.q, newParams)
                    }}
                    className="glass-button px-2 py-1 text-sm"
                  >
                    <option value="relevance">Relevance</option>
                    <option value="year">Year</option>
                    <option value="citedBy">Cited By</option>
                  </select>

                  {/* Sort direction toggle */}
                  <button
                    aria-label="Toggle sort direction"
                    title={params.sortDir === 'asc' ? 'Ascending' : 'Descending'}
                    onClick={() => {
                      const newDir: NonNullable<SearchParams['sortDir']> = params.sortDir === 'asc' ? 'desc' : 'asc'
                      const newParams: SearchParams = { ...params, sortDir: newDir, page: 1 }
                      setParams(newParams)
                      if (params.q) performSearch(params.q, newParams)
                    }}
                    className="glass-button px-2 py-1 text-sm"
                  >
                    {params.sortDir === 'asc' ? '↑' : '↓'}
                  </button>
                </label>
              </div>
            </div>

            {/* Breadcrumb */}
            <div className="mb-4 text-sm text-foreground/50">Home &gt; Search</div>

            {/* Results List */}
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

            {/* Pagination Controls */}
            {(hasMore || params.page > 1 || selectedIds.size > 0) && (
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 glass rounded-2xl p-6">
                <div className="flex items-center gap-3">
                  {selectedIds.size > 0 && (
                    <div className="flex items-center gap-2">
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
                        Open DOI
                      </Button>
                    </div>
                  )}

                  {(hasMore || params.page > 1) && (
                    <>
                      <Button
                        onClick={() => {
                          const newParams = { ...params, page: Math.max(1, params.page - 1) }
                          setParams(newParams)
                          performSearch(params.q, newParams)
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
                          performSearch(params.q, newParams)
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
