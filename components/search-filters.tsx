'use client'

import React from 'react'
import { ChevronDown } from 'lucide-react'
import type { SearchParams } from '@/lib/types'

interface SearchFiltersProps {
  params: SearchParams
  onParamsChange: (params: Partial<SearchParams>) => void
}

const sortOptions = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'year', label: 'Newest' },
  { value: 'citedBy', label: 'Most Cited' },
]

const documentTypeOptions = [
  { value: 'journal', label: 'Journal' },
  { value: 'conference', label: 'Conference' },
  { value: 'preprint', label: 'Preprint' },
  { value: 'book', label: 'Book' },
]

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'id', label: 'Indonesian' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
]

export function SearchFilters({ params, onParamsChange }: SearchFiltersProps) {
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 30 }, (_, i) => currentYear - i)

  return (
    <div className="glass rounded-2xl p-4 sm:p-6 mb-6">
      <div className="space-y-4">
        {/* Open Access Filter */}
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">Open Access</label>
          <button
            onClick={() => onParamsChange({ oaOnly: !params.oaOnly })}
            className={`glass-badge px-3 py-1.5 cursor-pointer transition-all ${
              params.oaOnly
                ? 'ring-2 ring-green-500 bg-green-500/20 border-green-400/40 dark:bg-green-500/15 dark:border-green-500/30'
                : 'hover:ring-2 hover:ring-foreground/20'
            }`}
          >
            <span className={params.oaOnly ? 'text-green-700 dark:text-green-300 font-semibold' : 'text-foreground/60'}>
              {params.oaOnly ? 'Yes' : 'All'}
            </span>
          </button>
        </div>

        {/* Document Type Filter */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-2">
            Document Type
          </label>
          <div className="relative">
            <select
              value={params.documentType || ''}
              onChange={(e) =>
                onParamsChange({
                  documentType: e.target.value || undefined,
                  page: 1,
                })
              }
              className="glass-input w-full text-sm text-foreground appearance-none pr-8"
              style={{ color: 'var(--foreground)' }}
            >
              <option className="text-foreground" value="">All Types</option>
              {documentTypeOptions.map((option) => (
                <option className="text-foreground" key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/50 pointer-events-none" />
          </div>
        </div>

        {/* Language Filter */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-2">
            Language
          </label>
          <div className="relative">
            <select
              value={params.language || ''}
              onChange={(e) =>
                onParamsChange({
                  language: e.target.value || undefined,
                  page: 1,
                })
              }
              className="glass-input w-full text-sm text-foreground appearance-none pr-8"
              style={{ color: 'var(--foreground)' }}
            >
              <option className="text-foreground" value="">All Languages</option>
              {languageOptions.map((option) => (
                <option className="text-foreground" key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/50 pointer-events-none" />
          </div>
        </div>

        {/* Year Filter */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {/* Year From */}
          <div>
            <label className="text-xs sm:text-sm font-medium text-foreground/70 block mb-2">
              From
            </label>
            <select
              value={params.yearFrom || ''}
              onChange={(e) =>
                onParamsChange({
                  yearFrom: e.target.value ? parseInt(e.target.value) : undefined,
                  page: 1,
                })
              }
              className="glass-input w-full text-sm text-foreground"
              style={{ color: 'var(--foreground)' }}
            >
              <option className="text-foreground" value="">Select</option>
              {yearOptions.map((year) => (
                <option className="text-foreground" key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Year To */}
          <div>
            <label className="text-xs sm:text-sm font-medium text-foreground/70 block mb-2">
              To
            </label>
            <select
              value={params.yearTo || ''}
              onChange={(e) =>
                onParamsChange({
                  yearTo: e.target.value ? parseInt(e.target.value) : undefined,
                  page: 1,
                })
              }
              className="glass-input w-full text-sm text-foreground"
              style={{ color: 'var(--foreground)' }}
            >
              <option className="text-foreground" value="">Select</option>
              {yearOptions.map((year) => (
                <option className="text-foreground" key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sort Options */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-2">
            Sort
          </label>
          <div className="relative">
            <select
              value={params.sort}
              onChange={(e) =>
                onParamsChange({
                  sort: e.target.value as 'relevance' | 'year' | 'citedBy',
                  page: 1,
                })
              }
              className="glass-input w-full text-sm text-foreground appearance-none pr-8"
              style={{ color: 'var(--foreground)' }}
            >
              {sortOptions.map((option) => (
                <option className="text-foreground" key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/50 pointer-events-none" />
          </div>
        </div>

        {/* Reset Filters */}
        {(params.yearFrom || params.yearTo || params.oaOnly || params.documentType || params.language || params.sort !== 'relevance') && (
          <button
            onClick={() =>
              onParamsChange({
                yearFrom: undefined,
                yearTo: undefined,
                oaOnly: false,
                documentType: undefined,
                language: undefined,
                sort: 'relevance',
                page: 1,
              })
            }
            className="w-full glass-button text-sm font-medium py-2 text-foreground/70 hover:text-foreground"
          >
            Reset Filters
          </button>
        )}
      </div>
    </div>
  )
}

export function FilterToggleButton({ isVisible, onClick }: { isVisible: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="glass-button px-4 py-2 text-sm font-medium transition-all hover:ring-2 hover:ring-foreground/20"
    >
      {isVisible ? 'Hide Filters' : 'Show Filters'}
    </button>
  )
}

export function FilterPanel({ isVisible, children }: { isVisible: boolean; children?: React.ReactNode }) {
  return (
    <div
      className={`filter-panel ${isVisible ? 'max-h-screen opacity-100 pointer-events-auto' : 'max-h-0 opacity-0 pointer-events-none'}`}
    >
      {children}
    </div>
  )
}
