'use client'

import React, { useState } from 'react'
import { ExternalLink, Copy, Bookmark, BookmarkCheck, Download } from 'lucide-react'
import type { ResearchArticle } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'

interface ResultCardProps {
  article: ResearchArticle
  isSaved?: boolean
  onSave?: (article: ResearchArticle) => void
  onUnsave?: (articleId: string) => void
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}

export function ResultCard({ article, isSaved = false, onSave, onUnsave, selectable = false, selected = false, onToggleSelect }: ResultCardProps) {
  const { toast } = useToast()
  const [loadingExport, setLoadingExport] = useState<'bibtex' | 'ris' | null>(null)

  const handleExport = async (format: 'bibtex' | 'ris') => {
    if (!article.doi) {
      toast({
        title: 'Error',
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
        title: 'Saved',
        description: `${format.toUpperCase()} exported successfully`,
      })
    } catch {
      toast({
        title: 'Error',
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
        title: 'Copied',
        description: 'DOI link copied to clipboard',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to copy DOI',
        variant: 'destructive',
      })
    }
  }

  const handleSaveToggle = () => {
    if (isSaved) {
      onUnsave?.(article.id)
      toast({
        title: 'Removed',
        description: 'Article removed from saved',
      })
    } else {
      onSave?.(article)
      toast({
        title: 'Saved',
        description: 'Article saved successfully',
      })
    }
  }

  // Get badge color based on document type
  const getDocumentTypeColor = () => {
    switch (article.documentType?.toLowerCase()) {
      case 'journal':
        return 'bg-blue-500/20 border-blue-400/40 dark:bg-blue-500/15 dark:border-blue-500/30 text-blue-700 dark:text-blue-300'
      case 'conference':
        return 'bg-purple-500/20 border-purple-400/40 dark:bg-purple-500/15 dark:border-purple-500/30 text-purple-700 dark:text-purple-300'
      case 'preprint':
        return 'bg-orange-500/20 border-orange-400/40 dark:bg-orange-500/15 dark:border-orange-500/30 text-orange-700 dark:text-orange-300'
      case 'book':
        return 'bg-indigo-500/20 border-indigo-400/40 dark:bg-indigo-500/15 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300'
      default:
        return 'bg-slate-500/20 border-slate-400/40 dark:bg-slate-500/15 dark:border-slate-500/30'
    }
  }

  // Get citation level badge
  const getCitationLevelBadge = () => {
    if (article.citedBy >= 100) return { label: '🏆 Highly Cited', color: 'bg-yellow-500/20 border-yellow-400/40 dark:bg-yellow-500/15 dark:border-yellow-500/30 text-yellow-700 dark:text-yellow-300' }
    if (article.citedBy >= 50) return { label: '🥈 Cited', color: 'bg-slate-500/20 border-slate-400/40 dark:bg-slate-500/15 dark:border-slate-500/30 text-slate-700 dark:text-slate-300' }
    if (article.citedBy >= 10) return { label: '🥉 Referenced', color: 'bg-orange-500/20 border-orange-400/40 dark:bg-orange-500/15 dark:border-orange-500/30 text-orange-700 dark:text-orange-300' }
    return null
  }

  const idKey = article.doi || `${article.source}-${article.id}`

  return (
    <div className="relative">
      {selectable && (
        <label className="absolute top-3 left-3 z-20">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(idKey)}
            className="form-checkbox w-4 h-4 accent-primary"
            aria-label="Select article"
          />
        </label>
      )}

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

        {/* Document type badge with color */}
        {article.documentType && (
          <div className={`glass-badge ${getDocumentTypeColor()}`}>
            <span className="font-medium capitalize">{article.documentType}</span>
          </div>
        )}

        {/* Citation level badge */}
        {getCitationLevelBadge() && (
          <div className={`glass-badge ${getCitationLevelBadge()?.color}`}>
            <span className="font-medium">{getCitationLevelBadge()?.label}</span>
          </div>
        )}

        {article.openAccess && (
          <div className="glass-badge bg-green-500/20 border-green-400/40 dark:bg-green-500/15 dark:border-green-500/30">
            <span className="text-green-700 dark:text-green-300 font-medium">✓ Open Access</span>
          </div>
        )}

        {article.venue && (
          <div className="glass-badge text-foreground/70 truncate max-w-xs">
            {article.venue}
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
            <span className="hidden sm:inline">Open</span>
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
          <span className="hidden sm:inline">{isSaved ? 'Saved' : 'Save'}</span>
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
      </div>
      </div>
    </div>
  )
}
