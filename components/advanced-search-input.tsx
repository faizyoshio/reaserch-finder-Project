'use client'

import React from 'react'
import { AlertCircle, X } from 'lucide-react'

export type AdvancedSearchFields = {
  author: string
  title: string
  doi: string
  affiliation: string
}

interface AdvancedSearchInputProps {
  fields: AdvancedSearchFields
  onChange: (changes: Partial<AdvancedSearchFields>) => void
  onSearch: () => void
  doiError?: string | null
}

export function AdvancedSearchInput({ fields, onChange, onSearch, doiError }: AdvancedSearchInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSearch()
    }
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-foreground/60 mb-1">Author Name</div>
          <div className="glass-input flex items-center gap-2 px-4 py-3 sm:py-4">
            <input
              type="text"
              value={fields.author}
              onChange={(e) => onChange({ author: e.target.value })}
              onKeyDown={handleKeyDown}
              placeholder="e.g., John Smith"
              className="flex-1 bg-transparent text-foreground placeholder-foreground/40 focus:outline-none text-sm sm:text-base"
              aria-label="Advanced search: Author Name"
              data-search-primary="advanced"
            />
            {fields.author && (
              <button
                onClick={() => onChange({ author: '' })}
                className="text-foreground/50 hover:text-foreground transition-colors p-1"
                aria-label="Clear author name"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs text-foreground/60 mb-1">Title</div>
          <div className="glass-input flex items-center gap-2 px-4 py-3 sm:py-4">
            <input
              type="text"
              value={fields.title}
              onChange={(e) => onChange({ title: e.target.value })}
              onKeyDown={handleKeyDown}
              placeholder="Title keywords"
              className="flex-1 bg-transparent text-foreground placeholder-foreground/40 focus:outline-none text-sm sm:text-base"
              aria-label="Advanced search: Title"
            />
            {fields.title && (
              <button
                onClick={() => onChange({ title: '' })}
                className="text-foreground/50 hover:text-foreground transition-colors p-1"
                aria-label="Clear title"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs text-foreground/60 mb-1">DOI</div>
          <div className="glass-input flex items-center gap-2 px-4 py-3 sm:py-4">
            <input
              type="text"
              value={fields.doi}
              onChange={(e) => onChange({ doi: e.target.value })}
              onKeyDown={handleKeyDown}
              placeholder="10.xxxx/xxxxx"
              className="flex-1 bg-transparent text-foreground placeholder-foreground/40 focus:outline-none text-sm sm:text-base"
              aria-label="Advanced search: DOI"
            />
            {fields.doi && (
              <button
                onClick={() => onChange({ doi: '' })}
                className="text-foreground/50 hover:text-foreground transition-colors p-1"
                aria-label="Clear DOI"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {doiError ? (
            <div className="mt-2 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{doiError}</span>
            </div>
          ) : null}
        </div>

        <div>
          <div className="text-xs text-foreground/60 mb-1">Institution / Affiliation</div>
          <div className="glass-input flex items-center gap-2 px-4 py-3 sm:py-4">
            <input
              type="text"
              value={fields.affiliation}
              onChange={(e) => onChange({ affiliation: e.target.value })}
              onKeyDown={handleKeyDown}
              placeholder="e.g., Universitas Indonesia"
              className="flex-1 bg-transparent text-foreground placeholder-foreground/40 focus:outline-none text-sm sm:text-base"
              aria-label="Advanced search: Institution / Affiliation"
            />
            {fields.affiliation && (
              <button
                onClick={() => onChange({ affiliation: '' })}
                className="text-foreground/50 hover:text-foreground transition-colors p-1"
                aria-label="Clear affiliation"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

