'use client'

import React, { useState, useEffect } from 'react'
import { Bookmark, Lock, Loader } from 'lucide-react'
import Link from 'next/link'
import { TopBar } from '@/components/top-bar'
import { Footer } from '@/components/footer'
import { ResultCard } from '@/components/result-card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/auth-provider'
import type { SavedArticle } from '@/lib/types'

export default function SavedPage() {
  const { user, isLoading, isAuthenticated } = useAuth()
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>([])
  const [mounted, setMounted] = useState(false)
  const [loadingArticles, setLoadingArticles] = useState(false)

  // Load saved articles from database if authenticated
  useEffect(() => {
    setMounted(true)

    if (!isLoading && isAuthenticated && user) {
      loadSavedArticles()
    }
  }, [isLoading, isAuthenticated, user])

  const loadSavedArticles = async () => {
    if (!user?.id) return

    setLoadingArticles(true)
    try {
      const response = await fetch(`/api/saved-articles?userId=${user.id}`)
      const data = await response.json()

      if (data.articles) {
        const sortedArticles = data.articles.sort(
          (a: SavedArticle, b: SavedArticle) =>
            new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
        )
        setSavedArticles(sortedArticles)
      }
    } catch (error) {
      console.error('[ResearchFinder] Failed to load saved articles:', error)
      // Fallback to localStorage
      const saved = localStorage.getItem('researchfinder-saved')
      if (saved) {
        try {
          const articles = JSON.parse(saved) as SavedArticle[]
          setSavedArticles(articles.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()))
        } catch {
          console.error('[ResearchFinder] Failed to parse saved articles')
        }
      }
    } finally {
      setLoadingArticles(false)
    }
  }

  const handleUnsave = async (articleId: string) => {
    if (!user?.id) return

    try {
      const response = await fetch('/api/saved-articles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, articleId }),
      })

      if (response.ok) {
        const updated = savedArticles.filter((a) => a.id !== articleId)
        setSavedArticles(updated)
      }
    } catch (error) {
      console.error('[ResearchFinder] Failed to remove article:', error)
    }
  }

  // Show loading state while checking authentication
  if (!mounted || (isLoading && !isAuthenticated)) {
    return (
      <div className="min-h-screen flex flex-col">
        <TopBar />
        <main className="flex-1 px-4 py-6 flex items-center justify-center">
          <Loader className="w-8 h-8 animate-spin text-foreground/50" />
        </main>
        <Footer />
      </div>
    )
  }

  // Show login prompt if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col">
        <TopBar />
        <main className="flex-1 px-2 sm:px-4 py-4 sm:py-6 max-w-5xl mx-auto w-full flex items-center justify-center">
          <div className="glass rounded-2xl p-8 sm:p-12 text-center max-w-md w-full">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">Sign in to view saved articles</h2>
            <p className="text-sm text-foreground/60 mb-6">
              Create an account or log in to securely save and manage your research articles.
            </p>
            <div className="flex flex-col gap-3">
              <Link href="/auth/login" className="w-full">
                <Button className="w-full">Log in</Button>
              </Link>
              <Link href="/auth/signup" className="w-full">
                <Button variant="outline" className="w-full">
                  Create Account
                </Button>
              </Link>
            </div>
          </div>
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
              Tersimpan / Saved
            </h1>
          </div>
          <p className="text-sm sm:text-base text-foreground/70">
            {savedArticles.length} artikel tersimpan / {savedArticles.length} articles saved
          </p>
        </div>

        {/* Empty State */}
        {savedArticles.length === 0 && (
          <div className="glass rounded-2xl p-8 sm:p-12 text-center">
            <Bookmark className="w-12 h-12 sm:w-16 sm:h-16 text-foreground/20 mx-auto mb-4" />
            <h2 className="text-lg sm:text-xl font-semibold text-foreground/70 mb-2">
              Belum ada artikel / No saved articles
            </h2>
            <p className="text-sm text-foreground/50">
              Mulai cari dan simpan artikel favorit Anda / Start searching and save your favorite articles
            </p>
          </div>
        )}

        {/* Saved Articles List */}
        {savedArticles.length > 0 && (
          <div className="space-y-4">
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
