'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Search, X, ExternalLink } from 'lucide-react'
import type { AutocompleteResult } from '@/lib/types'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onSearch: () => void
  onAutocompleteSelect?: (result: AutocompleteResult) => void
}

export function SearchInput({
  value,
  onChange,
  onSearch,
  onAutocompleteSelect,
}: SearchInputProps) {
  const [suggestions, setSuggestions] = useState<AutocompleteResult[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [minQueryError, setMinQueryError] = useState<string | null>(null)

  // Minimum query length for searching (in words)
  const MIN_WORDS = 5
  const countWords = (text: string) => {
    const t = text.trim()
    if (!t) return 0
    let count = 0
    let inWord = false
    for (let i = 0; i < t.length; i++) {
      const ch = t[i]
      const isWs = ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r'
      if (isWs) {
        inWord = false
      } else if (!inWord) {
        inWord = true
        count++
      }
    }
    return count
  }

  const wordCount = countWords(value)
  const meetsMinWords = wordCount >= MIN_WORDS

  const triggerSearchIfValid = () => {
    if (!meetsMinWords) {
      setMinQueryError(`Minimum ${MIN_WORDS} kata untuk melakukan pencarian.`)
      setShowSuggestions(false)
      setSelectedIndex(-1)
      return
    }
    setMinQueryError(null)
    setShowSuggestions(false)
    setSelectedIndex(-1)
    onSearch()
  }

  // Use a browser-safe timer type (works in Next.js client components)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Fetch suggestions
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    if (!value.trim() || value.trim().length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      setLoading(false)
      setSelectedIndex(-1)
      return
    }

    setLoading(true)
    debounceTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/autocomplete?q=${encodeURIComponent(value)}`
        )
        const data = await response.json()
        setSuggestions(Array.isArray(data) ? data : [])
        setShowSuggestions(true)
        setSelectedIndex(-1)
      } catch (error) {
        console.error('[ResearchFinder] Autocomplete error:', error)
        setSuggestions([])
        setShowSuggestions(false)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [value])

  const handleSelectSuggestion = (suggestion: AutocompleteResult) => {
    onChange(suggestion.title)
    setShowSuggestions(false)
    setSelectedIndex(-1)
    onAutocompleteSelect?.(suggestion)
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // If dropdown isn't open, Enter triggers search
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') triggerSearchIfValid()
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0) {
          handleSelectSuggestion(suggestions[selectedIndex])
        } else {
          triggerSearchIfValid()
        }
        break
      case 'Escape':
        e.preventDefault()
        setShowSuggestions(false)
        setSelectedIndex(-1)
        break
      default:
        break
    }
  }

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node

      const clickedSuggestions =
        suggestionsRef.current && suggestionsRef.current.contains(target)
      const clickedInput = inputRef.current && inputRef.current.contains(target)

      if (!clickedSuggestions && !clickedInput) {
        setShowSuggestions(false)
        setSelectedIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keep active option in view when navigating with keyboard
  useEffect(() => {
    if (!showSuggestions) return
    if (selectedIndex < 0) return

    const container = suggestionsRef.current
    if (!container) return

    const items = container.querySelectorAll<HTMLButtonElement>('[role="option"]')
    const active = items[selectedIndex]
    if (!active) return

    // Only scroll if needed
    const cTop = container.scrollTop
    const cBottom = cTop + container.clientHeight
    const aTop = active.offsetTop
    const aBottom = aTop + active.offsetHeight

    if (aTop < cTop) container.scrollTop = aTop
    else if (aBottom > cBottom) container.scrollTop = aBottom - container.clientHeight
  }, [selectedIndex, showSuggestions])

  return (
    <div className="relative w-full">
      <div className="glass-input flex items-center gap-2 px-4 py-3 sm:py-4">
        <Search className="w-5 h-5 text-foreground/50 flex-shrink-0" />

        <input
          ref={inputRef}
          type="text"
          placeholder="Cari Jurnal... / Search Papers..."
          value={value}
          onChange={(e) => onChange(e.target.value)
          if (minQueryError) setMinQueryError(null)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (value.trim().length >= 2 && suggestions.length > 0) {
              setShowSuggestions(true)
            }
          }}
          className="flex-1 bg-transparent text-foreground placeholder-foreground/40 focus:outline-none text-sm sm:text-base"
          aria-label="Search for academic articles"
          aria-autocomplete="list"
          aria-controls="search-suggestions"
          aria-expanded={showSuggestions && suggestions.length > 0}
          aria-activedescendant={
            selectedIndex >= 0 && suggestions[selectedIndex]?.id
              ? `rf-suggestion-${suggestions[selectedIndex]!.id}`
              : undefined
          }
        />

        {/* Loading indicator (optional) */}
        {/* Word counter */}
        <span
          className={`text-[11px] sm:text-xs tabular-nums ${
            meetsMinWords ? 'text-foreground/50' : 'text-amber-600/90'
          }`}
          aria-label="Word count"
          title={`Minimal ${MIN_WORDS} kata untuk search`}
        >
          {wordCount}/{MIN_WORDS}
        </span>

        {loading && (
          <span
            className="text-foreground/40 text-xs sm:text-sm"
            aria-label="Loading suggestions"
          >
            …
          </span>
        )}

        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('')
              setSuggestions([])
              setShowSuggestions(false)
              setSelectedIndex(-1)
              inputRef.current?.focus()
            }}
            className="text-foreground/50 hover:text-foreground transition-colors p-1"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {minQueryError && (
        <p className="mt-2 text-xs sm:text-sm text-amber-600/90 px-1">
          {minQueryError}
        </p>
      )}

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          id="search-suggestions"
          className="absolute top-full left-0 right-0 mt-2 glass-strong rounded-xl overflow-hidden z-50 max-h-96 overflow-y-auto"
          role="listbox"
        >
          {suggestions.map((suggestion, index) => {
            const isActive = selectedIndex === index
            const optionId = suggestion.id ? `rf-suggestion-${suggestion.id}` : undefined

            return (
              <button
                key={suggestion.id || suggestion.title}
                id={optionId}
                type="button"
                onClick={() => handleSelectSuggestion(suggestion)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`w-full px-4 py-3 sm:py-4 text-left transition-colors border-b border-white/20 dark:border-blue-200/10 last:border-b-0 ${
                  isActive
                    ? 'bg-white/40 dark:bg-slate-800/50'
                    : 'hover:bg-white/20 dark:hover:bg-slate-800/30'
                }`}
                role="option"
                aria-selected={isActive}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-base font-medium text-foreground truncate">
                      {suggestion.title}
                    </p>
                    {(suggestion.year || suggestion.doi) && (
                      <p className="text-xs sm:text-sm text-foreground/60 mt-1">
                        {suggestion.year ? suggestion.year : ''}
                        {suggestion.year && suggestion.doi ? ' • ' : ''}
                        {suggestion.doi ? `DOI: ${suggestion.doi}` : ''}
                      </p>
                    )}
                  </div>
                  <ExternalLink className="w-4 h-4 text-foreground/40 flex-shrink-0 mt-1" />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
