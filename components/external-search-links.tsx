'use client'

import React from 'react'
import { ExternalLink } from 'lucide-react'

interface ExternalSearchLinksProps {
  query: string
}

export function ExternalSearchLinks({ query }: ExternalSearchLinksProps) {
  if (!query || query.length < 2) return null

  const garrudaUrl = `https://garuda.kemdikbud.go.id/documents?q=${encodeURIComponent(query)}`
  const sintaUrl = `https://sinta.kemdikbud.go.id/articles?q=${encodeURIComponent(query)}`

  return (
    <div className="glass rounded-2xl p-4 sm:p-6 mb-6">
      <p className="text-xs sm:text-sm text-foreground/60 mb-3 font-medium">
        Cari di sumber Indonesia / Search Indonesian sources
      </p>
      <div className="flex flex-wrap gap-2 sm:gap-3">
        <a
          href={garrudaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="glass-button inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm hover:shadow-lg transition-all duration-200"
        >
          <span>Garuda</span>
          <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
        </a>

        <a
          href={sintaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="glass-button inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm hover:shadow-lg transition-all duration-200"
        >
          <span>SINTA</span>
          <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
        </a>
      </div>
    </div>
  )
}
