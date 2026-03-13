import type { Metadata } from 'next'
import HomePageClient from './home-page-client'
import { firstSearchParam } from '@/lib/seo'

type SearchParamMap = Record<string, string | string[] | undefined>

type HomePageProps = {
  searchParams: Promise<SearchParamMap>
}

const SEO_QUERY_KEYS = ['q', 'author', 'title', 'doi', 'affiliation', 'mode', 'yearFrom', 'yearTo', 'documentType', 'language'] as const

function hasSearchState(params: SearchParamMap): boolean {
  return SEO_QUERY_KEYS.some((key) => firstSearchParam(params[key]).trim().length > 0)
}

function resolveQueryLabel(params: SearchParamMap): string {
  return (
    firstSearchParam(params.q).trim() ||
    firstSearchParam(params.title).trim() ||
    firstSearchParam(params.author).trim() ||
    firstSearchParam(params.doi).trim() ||
    firstSearchParam(params.affiliation).trim()
  )
}

export async function generateMetadata({ searchParams }: HomePageProps): Promise<Metadata> {
  const params = await searchParams
  const queryLabel = resolveQueryLabel(params)
  const page = Number.parseInt(firstSearchParam(params.page), 10)
  const isPaginated = Number.isFinite(page) && page > 1
  const hasQueryState = hasSearchState(params) || isPaginated

  if (hasQueryState) {
    const resultTitle = queryLabel ? `Search results for "${queryLabel}"` : 'Search results'
    const resultDescription = queryLabel
      ? `Browse research search results for ${queryLabel} across journals, books, e-books, and open web sources.`
      : 'Browse research search results across journals, books, e-books, and open web sources.'

    return {
      title: resultTitle,
      description: resultDescription,
      alternates: {
        canonical: '/',
      },
      robots: {
        index: false,
        follow: true,
        googleBot: {
          index: false,
          follow: true,
          'max-image-preview': 'large',
          'max-video-preview': -1,
          'max-snippet': -1,
        },
      },
      openGraph: {
        title: resultTitle,
        description: resultDescription,
        url: '/',
      },
      twitter: {
        title: resultTitle,
        description: resultDescription,
      },
    }
  }

  return {
    alternates: {
      canonical: '/',
    },
  }
}

export default function HomePage() {
  return <HomePageClient />
}
