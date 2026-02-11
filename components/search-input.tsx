'use client'

import React, { useRef } from 'react'
import { Search, X, AlertCircle } from 'lucide-react'
import { validation } from '@/lib/utils'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onSearch: () => void
}

export function SearchInput({ value, onChange, onSearch }: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSearch()
    }
  }

  return (
    <div className="relative w-full">
      <div className="glass-input flex items-center gap-2 px-4 py-3 sm:py-4">
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
