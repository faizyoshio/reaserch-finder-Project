import { NextRequest, NextResponse } from 'next/server'
import type { LinkCheckResult } from '@/lib/types'

const linkCheckCache = new Map<string, { result: LinkCheckResult; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

async function checkLink(url: string): Promise<LinkCheckResult> {
  const timestamp = new Date().toISOString()

  try {
    if (!isValidUrl(url) || url.length > 2048) {
      return {
        ok: false,
        statusCode: 0,
        timestamp,
        error: 'Invalid URL',
      }
    }

    // Try HEAD request first
    let response = await Promise.race([
      fetch(url, { method: 'HEAD', redirect: 'follow' }),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
    ])

    // If HEAD not allowed, try GET with range
    if (response.status === 405 || response.status === 403) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      try {
        response = await fetch(url, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
          redirect: 'follow',
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }
    }

    const ok = response.status >= 200 && response.status < 400
    const finalUrl = response.url

    return {
      ok,
      statusCode: response.status,
      finalUrl: ok ? finalUrl : undefined,
      timestamp,
    }
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      timestamp,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    // Check cache
    const cached = linkCheckCache.get(url)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.result)
    }

    // Perform check
    const result = await checkLink(url)

    // Cache result
    linkCheckCache.set(url, { result, timestamp: Date.now() })

    // Cleanup old cache entries
    if (linkCheckCache.size > 500) {
      const oldest = Array.from(linkCheckCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)[0]
      linkCheckCache.delete(oldest[0])
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[ResearchFinder] Link check error:', error)
    return NextResponse.json(
      { error: 'Link check failed' },
      { status: 500 }
    )
  }
}
