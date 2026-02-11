'use client'

import React, { useRef, useState } from 'react'
import { Search, X, AlertCircle } from 'lucide-react'
import { validation } from '@/lib/utils'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onSearch: () => void
}

export function SearchInput({ value, onChange, onSearch }: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [suggestions, setSuggestions] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []

    const recent = localStorage.getItem('researchfinder-recent')
    if (!recent) return []

    try {
      return JSON.parse(recent) as string[]
    } catch {
      return []
    }
  })
  const [showSuggestions, setShowSuggestions] = useState(false)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      performSearch()
    }
  }

  const performSearch = () => {
    const q = inputRef.current?.value.trim() || ''
    if (!q) return
    // save recent
    try {
      const cur = JSON.parse(localStorage.getItem('researchfinder-recent') || '[]') as string[]
      const dedup = [q, ...cur.filter((s) => s !== q)].slice(0, 10)
      localStorage.setItem('researchfinder-recent', JSON.stringify(dedup))
      setSuggestions(dedup)
    } catch {
      localStorage.setItem('researchfinder-recent', JSON.stringify([q]))
      setSuggestions([q])
    }
    onChange(q)
    onSearch()
    setShowSuggestions(false)
  }

  const onSuggestionClick = (s: string) => {
    onChange(s)
    onSearch()
    setShowSuggestions(false)
  }

  const insertSyntaxToken = (token: string) => {
    const next = value.trim() ? `${value.trim()} ${token}` : token
    onChange(next)
    inputRef.current?.focus()
  }

  return (
    <div className="relative w-full">
      <div className="glass-input flex items-center gap-2 px-4 py-3 sm:py-4" onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}>
        <Search className="w-5 h-5 text-foreground/50 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search papers..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-foreground placeholder-foreground/40 focus:outline-none text-sm sm:text-base"
          aria-label="Search for academic articles"
          aria-describedby="search-syntax-helper"
        />
        {value && (
          <button
            onClick={() => {
              onChange('')
              inputRef.current?.focus()
            }}
            className="text-foreground/50 hover:text-foreground transition-colors p-1"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Suggestions + Recent Searches */}
      {showSuggestions && (suggestions?.length ?? 0) > 0 && (
        <div className="absolute left-0 right-0 mt-2 glass rounded-xl p-2 z-40">
          <div className="text-xs text-foreground/60 mb-2 px-2">Recent searches</div>
          <div className="flex flex-col gap-1">
            {suggestions.map((s) => (
              <button key={s} onMouseDown={() => onSuggestionClick(s)} className="text-left px-3 py-2 rounded hover:bg-foreground/5">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div id="search-syntax-helper" className="mt-2">
        <div className="text-xs text-foreground/55 mb-1.5">Advanced syntax</div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => insertSyntaxToken('"machine learning"')}
            className="glass-badge text-xs px-2 py-1 hover:ring-2 hover:ring-foreground/20"
          >
            &quot;exact phrase&quot;
          </button>
          <button
            type="button"
            onClick={() => insertSyntaxToken('author:"Andrew Ng"')}
            className="glass-badge text-xs px-2 py-1 hover:ring-2 hover:ring-foreground/20"
          >
            author:&quot;name&quot;
          </button>
          <button
            type="button"
            onClick={() => insertSyntaxToken('year:>=2020')}
            className="glass-badge text-xs px-2 py-1 hover:ring-2 hover:ring-foreground/20"
          >
            year:&gt;=2020
          </button>
          <button
            type="button"
            onClick={() => insertSyntaxToken('year:<=2023')}
            className="glass-badge text-xs px-2 py-1 hover:ring-2 hover:ring-foreground/20"
          >
            year:&lt;=2023
          </button>
        </div>
      </div>

      {/* Validation Message */}
      {value && !validation.isValidSearchQuery(value) && (
        <div className="mt-2 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{validation.getValidationMessage(value)}</span>
        </div>
      )}
    </div>
  )
}
