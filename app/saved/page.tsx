import type { Metadata } from 'next'
import SavedPageClient from './saved-page-client'

export const metadata: Metadata = {
  title: 'Saved Sources',
  description: 'Personal saved sources workspace for ResearchAtlas.',
  alternates: {
    canonical: '/saved',
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
}

export default function SavedPage() {
  return <SavedPageClient />
}
