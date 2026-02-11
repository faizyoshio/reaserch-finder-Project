'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { TopBar } from '@/components/top-bar'
import { Footer } from '@/components/footer'
import { SearchInput } from '@/components/search-input'
import { SearchFilters } from '@/components/search-filters'
import { ResultCard } from '@/components/result-card'
import { ResultSkeleton } from '@/components/result-skeleton'
import { ExternalSearchLinks } from '@/components/external-search-links'
import { Button } from '@/components/ui/button'
import type { ResearchArticle, SearchParams, SearchResponse, AutocompleteResult, SavedArticle } from '@/lib/types'
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
    perPage: 0,
    yearFrom: searchParams.get('yearFrom') ? parseInt(searchParams.get('yearFrom')!) : undefined,
    yearTo: searchParams.get('yearTo') ? parseInt(searchParams.get('yearTo')!) : undefined,
    oaOnly: searchParams.get('oaOnly') === 'true',
    sort: (searchParams.get('sort') as 'relevance' | 'year' | 'citedBy') || 'relevance',
    documentType: searchParams.get('documentType') || undefined,
    language: searchParams.get('language') || undefined,
  })

  const [results, setResults] = useState<ResearchArticle[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showIntro, setShowIntro] = useState(true)
  const [hasSearched, setHasSearched] = useState(!!params.q)
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>([])

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

  // Perform search
  const performSearch = React.useCallback(
    async (searchQuery: string, searchParams: SearchParams) => {
      if (!validation.isValidSearchQuery(searchQuery)) {
        toast({
          title: 'Warning',
          description: validation.getValidationMessage(searchQuery),
          variant: 'destructive',
        })
        return
      }

      setLoading(true)
      setShowIntro(false)

      try {
        const queryString = new URLSearchParams({
          q: searchQuery,
          page: searchParams.page.toString(),
          perPage: searchParams.perPage.toString(),
          oaOnly: searchParams.oaOnly.toString(),
          sort: searchParams.sort,
          ...(searchParams.yearFrom && { yearFrom: searchParams.yearFrom.toString() }),
          ...(searchParams.yearTo && { yearTo: searchParams.yearTo.toString() }),
          ...(searchParams.documentType && { documentType: searchParams.documentType }),
          ...(searchParams.language && { language: searchParams.language }),
        })

        const response = await fetch(`/api/search?${queryString}`)
        if (!response.ok) throw new Error('Search failed')

        const data: SearchResponse = await response.json()
        setResults(data.articles)
        setTotal(data.total)

        // Update URL
        router.push(`/?${queryString}`)
      } catch (error) {
        console.error('[ResearchFinder] Search error:', error)
        toast({
          title: 'Error',
          description: 'Search failed',
          variant: 'destructive',
        })
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
  }, [])

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
    const key = article.doi || `${article.source}-${article.id}`
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

  const handleUnsaveArticle = (articleId: string) => {
    const updated = savedArticles.filter((s) => s.id !== articleId)
    setSavedArticles(updated)
    localStorage.setItem('researchfinder-saved', JSON.stringify(updated))
  }

  const isSaved = (article: ResearchArticle) =>
    savedArticles.some((s) => s.doi === article.doi || (s.source === article.source && s.id === article.id))

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />

      <main className="flex-1 px-2 sm:px-4 py-4 sm:py-6 max-w-5xl mx-auto w-full">
        {/* Search Panel */}
        <div className="glass rounded-2xl p-4 sm:p-6 mb-6 animate-glass-in">
          <SearchInput
            value={query}
            onChange={setQuery}
            onSearch={handleSearch}
          />
        </div>

        {/* External Search Links */}
        {hasSearched && <ExternalSearchLinks query={params.q} />}

        {/* Filters */}
        {hasSearched && <SearchFilters params={params} onParamsChange={handleParamsChange} />}

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
          <div className="glass rounded-2xl p-8 text-center">
            <p className="text-foreground/70 text-lg">
              No results found
            </p>
            <p className="text-sm text-foreground/50 mt-2">
              Try with different keywords
            </p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div>
            {/* Results Info */}
            <div className="mb-4 text-sm text-foreground/60">
              Showing {results.length} of {total} results
            </div>

            {/* Results List */}
            <div className="space-y-4">
              {results.map((article) => (
                <ResultCard
                  key={article.doi || `${article.source}-${article.id}`}
                  article={article}
                  isSaved={isSaved(article)}
                  onSave={handleSaveArticle}
                  onUnsave={handleUnsaveArticle}
                />
              ))}
            </div>

            {/* Pagination */}
            {total > params.perPage && (
              <div className="flex justify-center gap-2 mt-8">
                <Button
                  onClick={() => {
                    const newParams = { ...params, page: Math.max(1, params.page - 1) }
                    setParams(newParams)
                    performSearch(params.q, newParams)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  disabled={params.page === 1}
                  className="glass-button"
                >
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground/70">
                    Page {params.page}
                  </span>
                </div>

                <Button
                  onClick={() => {
                    const newParams = { ...params, page: params.page + 1 }
                    setParams(newParams)
                    performSearch(params.q, newParams)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  disabled={!total || params.page * params.perPage >= total}
                  className="glass-button"
                >
                  Next
                </Button>
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
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-foreground/50">Loading...</div></div>}>
      <HomeContent />
    </Suspense>
  )
}
