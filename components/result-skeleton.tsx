'use client'

import React from 'react'

export function ResultSkeleton() {
  return (
    <div className="glass rounded-2xl p-4 sm:p-6 mb-4 animate-pulse">
      {/* Title */}
      <div className="h-6 bg-white/20 dark:bg-slate-700/20 rounded-lg mb-3 w-3/4" />

      {/* Authors */}
      <div className="h-4 bg-white/15 dark:bg-slate-700/15 rounded-lg mb-3 w-full" />
      <div className="h-4 bg-white/15 dark:bg-slate-700/15 rounded-lg mb-4 w-2/3" />

      {/* Badges */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="h-5 bg-white/20 dark:bg-slate-700/20 rounded-full w-12" />
        <div className="h-5 bg-white/20 dark:bg-slate-700/20 rounded-full w-12" />
        <div className="h-5 bg-white/20 dark:bg-slate-700/20 rounded-full w-16" />
      </div>

      {/* Action buttons area */}
      <div className="h-8 bg-white/15 dark:bg-slate-700/15 rounded-lg" />
    </div>
  )
}
