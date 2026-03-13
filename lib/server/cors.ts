import { NextRequest, NextResponse } from 'next/server'

const PROD_PRIMARY_ORIGIN = 'https://researchatlas.faizyoshio.my.id'
const PROD_LEGACY_ORIGIN = 'https://research-finder.faizyoshio.my.id'
const DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000']

function buildAllowedOrigins(): Set<string> {
  if (process.env.NODE_ENV === 'production') {
    return new Set([PROD_PRIMARY_ORIGIN, PROD_LEGACY_ORIGIN])
  }

  // In local/dev, allow localhost so same-origin API calls keep working.
  return new Set([PROD_PRIMARY_ORIGIN, PROD_LEGACY_ORIGIN, ...DEV_ORIGINS])
}

const ALLOWED_ORIGINS = buildAllowedOrigins()

function appendVary(headers: Headers, value: string) {
  const existing = headers.get('Vary')
  if (!existing) {
    headers.set('Vary', value)
    return
  }

  const existingParts = existing
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)

  const normalized = value.trim().toLowerCase()
  if (!existingParts.includes(normalized)) {
    headers.set('Vary', `${existing}, ${value}`)
  }
}

export function getAllowedCorsOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin')
  if (!origin) return null
  if (!ALLOWED_ORIGINS.has(origin)) return null
  return origin
}

export function rejectIfCorsDisallowed(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin')
  if (!origin) return null
  if (ALLOWED_ORIGINS.has(origin)) return null

  // Intentionally generic: do not leak policy details to clients.
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

function setCorsHeaders(
  response: NextResponse,
  origin: string,
  requestedHeaders: string | null,
  requestedMethod: string | null
) {
  response.headers.set('Access-Control-Allow-Origin', origin)
  appendVary(response.headers, 'Origin')

  response.headers.set('Access-Control-Allow-Methods', requestedMethod ? `OPTIONS, ${requestedMethod}` : 'OPTIONS, GET, POST')
  response.headers.set('Access-Control-Allow-Headers', requestedHeaders || 'Content-Type, Authorization')
  response.headers.set('Access-Control-Max-Age', '86400')
}

export function withCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = getAllowedCorsOrigin(request)
  if (!origin) return response
  const requestedHeaders = request.headers.get('access-control-request-headers')
  const requestedMethod = request.headers.get('access-control-request-method')
  setCorsHeaders(response, origin, requestedHeaders, requestedMethod)
  return response
}

export function corsPreflightResponse(request: NextRequest): NextResponse {
  const origin = getAllowedCorsOrigin(request)
  if (!origin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const requestedHeaders = request.headers.get('access-control-request-headers')
  const requestedMethod = request.headers.get('access-control-request-method')
  const response = new NextResponse(null, { status: 204 })
  setCorsHeaders(response, origin, requestedHeaders, requestedMethod)
  return response
}

