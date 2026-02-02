'use client'

import React, { useState } from 'react'
import { ExternalLink, Copy, Bookmark, BookmarkCheck, Download, AlertCircle, CheckCircle } from 'lucide-react'
import { BookMarked as BookmarkFilled } from 'lucide-react' // Import BookmarkFilled
import type { ResearchArticle, LinkCheckResult } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'

interface ResultCardProps {
  article: ResearchArticle
  isSaved?: boolean
  onSave?: (article: ResearchArticle) => void
  onUnsave?: (articleId: string) => void
}

export function ResultCard({ article, isSaved = false, onSave, onUnsave }: ResultCardProps) {
  const { toast } = useToast()
  const [linkCheckStatus, setLinkCheckStatus] = useState<LinkCheckResult | null>(null)
  const [checkingLink, setCheckingLink] = useState(false)
  const [loadingExport, setLoadingExport] = useState<'bibtex' | 'ris' | null>(null)

  const handleCheckLink = async () => {
    if (!article.url) return

    setCheckingLink(true)
    try {
      const response = await fetch('/api/linkcheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: article.url }),
      })
      const result = await response.json()
      setLinkCheckStatus(result)
    } catch (error) {
      toast({
        title: 'Error / Kesalahan',
        description: 'Failed to check link',
        variant: 'destructive',
      })
    } finally {
      setCheckingLink(false)
    }
  }

  const handleExport = async (format: 'bibtex' | 'ris') => {
    if (!article.doi) {
      toast({
        title: 'Error / Kesalahan',
        description: 'No DOI available for export',
        variant: 'destructive',
      })
      return
    }

    setLoadingExport(format)
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doi: article.doi,
          title: article.title,
          authors: article.authors,
          year: article.year,
          venue: article.venue,
          url: article.url,
          format,
        }),
      })

      if (!response.ok) throw new Error('Export failed')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${article.title.slice(0, 50)}.${format === 'bibtex' ? 'bib' : 'ris'}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: 'Tersimpan / Saved',
        description: `${format.toUpperCase()} exported successfully`,
      })
    } catch (error) {
      toast({
        title: 'Error / Kesalahan',
        description: `Failed to export ${format}`,
        variant: 'destructive',
      })
    } finally {
      setLoadingExport(null)
    }
  }

  const handleCopyDoi = async () => {
    if (!article.doi) return
    try {
      await navigator.clipboard.writeText(`https://doi.org/${article.doi}`)
      toast({
        title: 'Tersalin / Copied',
        description: 'DOI link copied to clipboard',
      })
    } catch {
      toast({
        title: 'Error / Kesalahan',
        description: 'Failed to copy DOI',
        variant: 'destructive',
      })
    }
  }

  const handleSaveToggle = () => {
    if (isSaved) {
      onUnsave?.(article.id)
      toast({
        title: 'Dihapus / Removed',
        description: 'Article removed from saved',
      })
    } else {
      onSave?.(article)
      toast({
        title: 'Tersimpan / Saved',
        description: 'Article saved successfully',
      })
    }
  }

  return (
    <div className="glass-hover glass rounded-2xl p-4 sm:p-6 animate-glass-in mb-4">
      {/* Header */}
      <div className="mb-3 sm:mb-4">
        <h3 className="text-base sm:text-lg font-bold leading-snug text-balance text-foreground mb-2">
          {article.title}
        </h3>
        <div className="text-xs sm:text-sm text-foreground/70 mb-2">
          <p className="line-clamp-2">{article.authors.slice(0, 3).join(', ')}{article.authors.length > 3 ? ' et al.' : ''}</p>
        </div>
      </div>

      {/* Metadata badges */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4">
        <div className="glass-badge">
          <span className="text-foreground/70 font-medium">{article.year}</span>
        </div>

        {article.citedBy > 0 && (
          <div className="glass-badge">
            <span className="text-foreground/70">↗ {article.citedBy}</span>
          </div>
        )}

        {article.openAccess && (
          <div className="glass-badge bg-green-500/20 border-green-400/40 dark:bg-green-500/15 dark:border-green-500/30">
            <span className="text-green-700 dark:text-green-300 font-medium">OA</span>
          </div>
        )}

        {article.venue && (
          <div className="glass-badge text-foreground/70 truncate max-w-xs">
            {article.venue}
          </div>
        )}

        {linkCheckStatus && (
          <div className={`glass-badge ${linkCheckStatus.ok ? 'bg-green-500/20 border-green-400/40 dark:bg-green-500/15 dark:border-green-500/30' : 'bg-red-500/20 border-red-400/40 dark:bg-red-500/15 dark:border-red-500/30'}`}>
            {linkCheckStatus.ok ? (
              <CheckCircle className="w-3 h-3 text-green-700 dark:text-green-300" />
            ) : (
              <AlertCircle className="w-3 h-3 text-red-700 dark:text-red-300" />
            )}
            <span className={linkCheckStatus.ok ? 'text-green-700 dark:text-green-300 text-xs' : 'text-red-700 dark:text-red-300 text-xs'}>
              {linkCheckStatus.ok ? 'Valid' : 'Error'}
            </span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-3 border-t border-white/20 dark:border-blue-200/10">
        {/* Open button */}
        {article.url && (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-button inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Buka / Open</span>
            <span className="sm:hidden">Open</span>
          </a>
        )}

        {/* DOI button */}
        {article.doi && (
          <button
            onClick={handleCopyDoi}
            className="glass-button inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">DOI</span>
            <span className="sm:hidden">Copy</span>
          </button>
        )}

        {/* Save button */}
        <button
          onClick={handleSaveToggle}
          className={`glass-button inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm ${
            isSaved ? 'ring-2 ring-blue-500' : ''
          }`}
        >
          {isSaved ? (
            <BookmarkCheck className="w-3.5 h-3.5" />
          ) : (
            <Bookmark className="w-3.5 h-3.5" />
          )}
          <span className="hidden sm:inline">{isSaved ? 'Disimpan / Saved' : 'Simpan / Save'}</span>
          <span className="sm:hidden">{isSaved ? 'Saved' : 'Save'}</span>
        </button>

        {/* Export buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('bibtex')}
            disabled={loadingExport === 'bibtex' || !article.doi}
            className="glass-button inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">BibTeX</span>
            <span className="sm:hidden">BT</span>
          </button>

          <button
            onClick={() => handleExport('ris')}
            disabled={loadingExport === 'ris' || !article.doi}
            className="glass-button inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">RIS</span>
            <span className="sm:hidden">RIS</span>
          </button>
        </div>

        {/* Check link button */}
        {article.url && (
          <button
            onClick={handleCheckLink}
            disabled={checkingLink}
            className="glass-button inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
          >
            {checkingLink ? (
              <div className="w-3.5 h-3.5 rounded-full border 2 border-transparent border-t-foreground animate-spin" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Cek Link / Check Link</span>
            <span className="sm:hidden">Check</span>
          </button>
        )}
      </div>
    </div>
  )
}
