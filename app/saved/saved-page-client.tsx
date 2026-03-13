'use client'

import React, { useState, useSyncExternalStore } from 'react'
import { Bookmark } from 'lucide-react'
import { TopBar } from '@/components/top-bar'
import { Footer } from '@/components/footer'
import { ResultCard } from '@/components/result-card'
import type { SavedArticle } from '@/lib/types'

interface SavedDisplayArticle extends SavedArticle {
  duplicateCount: number
  dedupeKey: string
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function getDedupeKey(article: SavedArticle): string {
  if (article.doi) return `doi:${article.doi}`
  return `title:${normalizeText(article.title)}:${article.year}`
}

function loadSavedArticles(): { articles: SavedDisplayArticle[]; mergedDuplicates: number } {
  if (typeof window === 'undefined') return { articles: [], mergedDuplicates: 0 }

  const saved = localStorage.getItem('researchfinder-saved')
  if (!saved) return { articles: [], mergedDuplicates: 0 }

  try {
    const articles = JSON.parse(saved) as SavedArticle[]
    const deduped = new Map<string, SavedDisplayArticle>()
    let duplicates = 0

    for (const article of articles) {
      const key = getDedupeKey(article)
      const existing = deduped.get(key)
      if (!existing) {
        deduped.set(key, { ...article, duplicateCount: 1, dedupeKey: key })
      } else {
        duplicates += 1
        const currentSavedAt = new Date(existing.savedAt).getTime()
        const incomingSavedAt = new Date(article.savedAt).getTime()
        const preferred = incomingSavedAt > currentSavedAt ? article : existing
        deduped.set(key, {
          ...preferred,
          duplicateCount: existing.duplicateCount + 1,
          dedupeKey: key,
        })
      }
    }

    return {
      articles: Array.from(deduped.values()).sort(
        (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
      ),
      mergedDuplicates: duplicates,
    }
  } catch {
    console.error('[ResearchAtlas] Failed to load saved articles')
    return { articles: [], mergedDuplicates: 0 }
  }
}

export default function SavedPage() {
  const [savedState, setSavedState] = useState(() => loadSavedArticles())
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const handleUnsave = (dedupeKey: string) => {
    const raw = localStorage.getItem('researchfinder-saved')
    if (!raw) return

    try {
      const articles = JSON.parse(raw) as SavedArticle[]
      const updated = articles.filter((article) => getDedupeKey(article) !== dedupeKey)
      localStorage.setItem('researchfinder-saved', JSON.stringify(updated))
      setSavedState(loadSavedArticles())
    } catch {
      console.error('[ResearchAtlas] Failed to remove saved article')
    }
  }

  if (!mounted) {
    return (
      <div className="min-h-screen flex flex-col">
        <TopBar />
        <main id="main-content" className="flex-1 px-4 py-6 flex items-center justify-center">
          <div className="text-foreground/50">Loading...</div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />

      <main id="main-content" className="flex-1 px-2 sm:px-4 py-4 sm:py-6 max-w-5xl mx-auto w-full">
        <div className="glass rounded-2xl p-6 sm:p-8 mb-8 animate-glass-in">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg glass-button flex items-center justify-center">
              <Bookmark className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-700 dark:text-emerald-300" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">Saved</h1>
          </div>
          <p className="text-sm sm:text-base text-foreground/70">
            {savedState.articles.length} unique sources saved
          </p>
          {savedState.mergedDuplicates > 0 && (
            <p className="text-xs sm:text-sm text-foreground/55 mt-1">
              Auto-merged {savedState.mergedDuplicates} duplicate entr{savedState.mergedDuplicates === 1 ? 'y' : 'ies'}.
            </p>
          )}
        </div>

        {savedState.articles.length === 0 && (
          <div className="glass rounded-2xl p-8 sm:p-12 text-center">
            <Bookmark className="w-12 h-12 sm:w-16 sm:h-16 text-foreground/20 mx-auto mb-4" />
            <h2 className="text-lg sm:text-xl font-semibold text-foreground/70 mb-2">No saved sources</h2>
            <p className="text-sm text-foreground/50">
              Start discovering and save your favorite journals, research books, e-books, or web resources.
            </p>
          </div>
        )}

        {savedState.articles.length > 0 && (
          <div className="result-list">
            {savedState.articles.map((article) => (
              <div key={article.dedupeKey}>
                {article.duplicateCount > 1 && (
                  <div className="mb-2 text-xs text-foreground/60">
                    Merged {article.duplicateCount} duplicates for this entry.
                  </div>
                )}
                <ResultCard
                  article={article}
                  isSaved={true}
                  onUnsave={() => handleUnsave(article.dedupeKey)}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
