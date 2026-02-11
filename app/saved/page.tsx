'use client'

import React, { useState, useSyncExternalStore } from 'react'
import { Bookmark } from 'lucide-react'
import { TopBar } from '@/components/top-bar'
import { Footer } from '@/components/footer'
import { ResultCard } from '@/components/result-card'
import type { SavedArticle } from '@/lib/types'

function loadSavedArticles(): SavedArticle[] {
  if (typeof window === 'undefined') return []

  const saved = localStorage.getItem('researchfinder-saved')
  if (!saved) return []

  try {
    const articles = JSON.parse(saved) as SavedArticle[]
    return articles.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
  } catch {
    console.error('[ResearchFinder] Failed to load saved articles')
    return []
  }
}

export default function SavedPage() {
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>(() => loadSavedArticles())
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const handleUnsave = (articleId: string) => {
    const updated = savedArticles.filter((a) => a.id !== articleId)
    setSavedArticles(updated)
    localStorage.setItem('researchfinder-saved', JSON.stringify(updated))
  }

  if (!mounted) {
    return (
      <div className="min-h-screen flex flex-col">
        <TopBar />
        <main className="flex-1 px-4 py-6 flex items-center justify-center">
          <div className="text-foreground/50">Loading...</div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />

      <main className="flex-1 px-2 sm:px-4 py-4 sm:py-6 max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="glass rounded-2xl p-6 sm:p-8 mb-8 animate-glass-in">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg glass-button flex items-center justify-center">
              <Bookmark className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              Saved
            </h1>
          </div>
          <p className="text-sm sm:text-base text-foreground/70">
            {savedArticles.length} articles saved
          </p>
        </div>

        {/* Empty State */}
        {savedArticles.length === 0 && (
          <div className="glass rounded-2xl p-8 sm:p-12 text-center">
            <Bookmark className="w-12 h-12 sm:w-16 sm:h-16 text-foreground/20 mx-auto mb-4" />
            <h2 className="text-lg sm:text-xl font-semibold text-foreground/70 mb-2">
              No saved articles
            </h2>
            <p className="text-sm text-foreground/50">
              Start searching and save your favorite articles
            </p>
          </div>
        )}

        {/* Saved Articles List */}
        {savedArticles.length > 0 && (
          <div className="result-list">
            {savedArticles.map((article) => (
              <ResultCard
                key={article.id}
                article={article}
                isSaved={true}
                onUnsave={() => handleUnsave(article.id)}
              />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
