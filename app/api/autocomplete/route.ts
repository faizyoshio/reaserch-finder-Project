import { NextRequest, NextResponse } from 'next/server'
import type { AutocompleteResult } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q')?.trim()

    if (!q || q.length < 2) {
      return NextResponse.json([])
    }

    // Fetch from OpenAlex autocomplete endpoint
    const response = await fetch(
      `https://api.openalex.org/autocomplete/works?q=${encodeURIComponent(q)}&per_page=8`,
      { next: { revalidate: 60 } }
    )

    if (!response.ok) {
      return NextResponse.json([])
    }

    const data = await response.json()

    const results: AutocompleteResult[] = (data.results || []).map(
      (item: { display_name: string; id: string; doi?: string; publication_year?: number }) => ({
        title: item.display_name,
        id: item.id,
        doi: item.doi,
        year: item.publication_year,
      })
    )

    return NextResponse.json(results)
  } catch (error) {
    console.error('[ResearchFinder] Autocomplete API error:', error)
    return NextResponse.json([])
  }
}
