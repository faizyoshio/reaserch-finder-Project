'use client'

import React, { useState, useRef, useEffect } from 'react'
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
  const debounceTimer = useRef<NodeJS.Timeout>()
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Fetch suggestions
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    if (!value.trim() || value.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    setLoading(true)
    debounceTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/autocomplete?q=${encodeURIComponent(value)}`
        )
        const data = await response.json()
        setSuggestions(data)
        setShowSuggestions(true)
        setSelectedIndex(-1)
      } catch (error) {
        console.error('[ResearchFinder] Autocomplete error:', error)
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [value])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') {
        onSearch()
      }
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
          onSearch()
        }
        break
      case 'Escape':
        e.preventDefault()
        setShowSuggestions(false)
        break
      default:
        break
    }
  }

  const handleSelectSuggestion = (suggestion: AutocompleteResult) => {
    onChange(suggestion.title)
    setShowSuggestions(false)
    onAutocompleteSelect?.(suggestion)
  }

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative w-full">
      <div className="glass-input flex items-center gap-2 px-4 py-3 sm:py-4">
        <Search className="w-5 h-5 text-foreground/50 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Cari Jurnal... / Search Papers..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (value.length >= 2) setShowSuggestions(true)
          }}
          className="flex-1 bg-transparent text-foreground placeholder-foreground/40 focus:outline-none text-sm sm:text-base"
          aria-label="Search for academic articles"
          aria-autocomplete="list"
          aria-controls="search-suggestions"
          aria-expanded={showSuggestions && suggestions.length > 0}
        />
        {value && (
          <button
            onClick={() => {
              onChange('')
              setSuggestions([])
              setShowSuggestions(false)
              inputRef.current?.focus()
            }}
            className="text-foreground/50 hover:text-foreground transition-colors p-1"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          id="search-suggestions"
          className="absolute top-full left-0 right-0 mt-2 glass-strong rounded-xl overflow-hidden z-50 max-h-96 overflow-y-auto"
          role="listbox"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id || suggestion.title}
              onClick={() => handleSelectSuggestion(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full px-4 py-3 sm:py-4 text-left transition-colors border-b border-white/20 dark:border-blue-200/10 last:border-b-0 ${
                selectedIndex === index
                  ? 'bg-white/40 dark:bg-slate-800/50'
                  : 'hover:bg-white/20 dark:hover:bg-slate-800/30'
              }`}
              role="option"
              aria-selected={selectedIndex === index}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm sm:text-base font-medium text-foreground truncate">
                    {suggestion.title}
                  </p>
                  {suggestion.year && (
                    <p className="text-xs sm:text-sm text-foreground/60 mt-1">
                      {suggestion.year}
                      {suggestion.doi && ` • DOI: ${suggestion.doi}`}
                    </p>
                  )}
                </div>
                <ExternalLink className="w-4 h-4 text-foreground/40 flex-shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
