'use client'

import React from 'react'

export function ResultSkeleton() {
  return (
    <div className="glass rounded-2xl p-4 sm:p-6 mb-4 animate-slide-up">
      {/* Title - larger skeleton */}
      <div className="h-7 skeleton rounded-lg mb-3 w-4/5" />

      {/* Venue/Source */}
      <div className="h-4 skeleton rounded-lg mb-2 w-1/3" />

      {/* Authors */}
      <div className="h-4 skeleton rounded-lg mb-2 w-full" />
      <div className="h-4 skeleton rounded-lg mb-4 w-2/3" />

      {/* Badges container */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="h-6 skeleton rounded-full w-16" />
        <div className="h-6 skeleton rounded-full w-14" />
        <div className="h-6 skeleton rounded-full w-20" />
      </div>

      {/* Description */}
      <div className="space-y-2 mb-4">
        <div className="h-4 skeleton rounded-lg w-full" />
        <div className="h-4 skeleton rounded-lg w-5/6" />
      </div>

      {/* Action buttons area */}
      <div className="flex gap-2 flex-wrap">
        <div className="h-9 skeleton rounded-full w-20" />
        <div className="h-9 skeleton rounded-full w-20" />
        <div className="h-9 skeleton rounded-full w-20" />
      </div>
    </div>
  )
}
