import { ImageResponse } from 'next/og'
import { SITE_NAME } from '@/lib/seo'

export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background:
            'radial-gradient(circle at 12% 15%, rgba(45,212,191,.25), transparent 40%), radial-gradient(circle at 86% 22%, rgba(245,158,11,.25), transparent 38%), linear-gradient(135deg, #0f2a27 0%, #163631 45%, #4a3214 100%)',
          color: '#f8f6ef',
          padding: '64px',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            border: '1px solid rgba(248,246,239,.35)',
            borderRadius: '999px',
            padding: '10px 18px',
            fontSize: 26,
            letterSpacing: 1,
          }}
        >
          Research Discovery Platform
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.02 }}>{SITE_NAME}</div>
          <div
            style={{
              marginTop: 16,
              fontSize: 36,
              lineHeight: 1.25,
              opacity: 0.95,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span>Find journals, research books, e-books,</span>
            <span>and open web knowledge in one place.</span>
          </div>
        </div>

        <div style={{ fontSize: 24, opacity: 0.88 }}>research-finder.faizyoshio.my.id</div>
      </div>
    ),
    size
  )
}
