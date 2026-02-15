"use client"

import React from 'react'
import type { ResearchArticle } from '@/lib/types'

interface Props {
  results: ResearchArticle[]
}

export function SearchStats({ results }: Props) {
  if (!results || results.length === 0) return null

  // Year distribution
  const countsByYear = results.reduce((acc: Record<string, number>, r) => {
    const y = (r.year || new Date().getFullYear()).toString()
    acc[y] = (acc[y] || 0) + 1
    return acc
  }, {})

  const years = Object.keys(countsByYear).map((y) => parseInt(y)).sort((a, b) => a - b)
  const minYear = years[0]
  const maxYear = years[years.length - 1]

  // Prepare a compact series (limit to last 12 years if large)
  const span = Math.min(12, Math.max(1, maxYear - minYear + 1))
  const startYear = maxYear - span + 1
  const series = Array.from({ length: span }, (_, i) => {
    const y = startYear + i
    return { year: y, count: countsByYear[y] || 0 }
  })

  const maxCount = Math.max(...series.map((s) => s.count), 1)

  // Top venues
  const venueCounts = results.reduce((acc: Record<string, number>, r) => {
    const v = r.venue || 'Unknown'
    acc[v] = (acc[v] || 0) + 1
    return acc
  }, {})
  const topVenues = Object.entries(venueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return (
    <div className="glass rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold">Search stats</h4>
        <div className="text-xs text-foreground/60">{results.length} results</div>
      </div>

      <div className="flex gap-4 items-center">
        {/* */}
        <svg width={220} height={48} viewBox={`0 0 220 48`} className="shrink-0">
          {series.map((s, i) => {
            const w = 16
            const gap = 2
            const x = i * (w + gap)
            const h = Math.round((s.count / maxCount) * 36)
            const y = 44 - h
            return (
              <g key={s.year}>
                <rect x={x} y={y} width={w} height={h} rx={2} fill="rgba(59,130,246,0.18)" stroke="rgba(59,130,246,0.25)" />
                <text x={x + w / 2} y={46} fontSize={8} fill="var(--foreground)" textAnchor="middle">{String(s.year).slice(2)}</text>
              </g>
            )
          })}
        </svg>

        {/* */}
        <div className="flex-1">
          <div className="text-xs text-foreground/60 mb-1">Top venues</div>
          <div className="flex flex-wrap gap-2">
            {topVenues.map(([venue, cnt]) => (
              <div key={venue} className="glass-badge text-xs">
                <span className="font-medium truncate max-w-xs">{venue}</span>
                <span className="text-foreground/60 ml-2">{cnt}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SearchStats
