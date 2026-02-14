export interface RedirectAllowlistOptions {
  allowedHosts: readonly string[]
  maxRedirects?: number
}

function isRedirectStatus(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

function getAllowedHostSet(options: RedirectAllowlistOptions) {
  return new Set(options.allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean))
}

export async function fetchWithRedirectAllowlist(
  input: string,
  init: RequestInit,
  options: RedirectAllowlistOptions
): Promise<Response> {
  const allowedHosts = getAllowedHostSet(options)
  const maxRedirects = options.maxRedirects ?? 5

  let currentUrl = input

  for (let i = 0; i <= maxRedirects; i += 1) {
    const response = await fetch(currentUrl, { ...init, redirect: 'manual' })

    if (!isRedirectStatus(response.status)) {
      return response
    }

    const location = response.headers.get('location')
    if (response.body) response.body.cancel()
    if (!location) {
      throw new Error('Redirect received without Location header')
    }

    const nextUrl = new URL(location, currentUrl)

    if (nextUrl.username || nextUrl.password) {
      throw new Error('Redirect with credentials blocked')
    }

    if (nextUrl.protocol !== 'https:') {
      throw new Error('Redirect to non-HTTPS destination blocked')
    }

    if (!allowedHosts.has(nextUrl.hostname.toLowerCase())) {
      throw new Error(`Redirect to disallowed host blocked: ${nextUrl.hostname}`)
    }

    currentUrl = nextUrl.toString()
  }

  throw new Error('Too many redirects')
}
