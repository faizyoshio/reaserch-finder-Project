import fs from 'node:fs'
import path from 'node:path'

const OPENALEX_ALLOWED_HOSTS = new Set(['api.openalex.org'])

const INDONESIAN_STOPWORDS = new Set([
  'dan',
  'atau',
  'yang',
  'dari',
  'di',
  'ke',
  'pada',
  'untuk',
  'dengan',
  'dalam',
  'sebagai',
  'oleh',
  'guna',
  'agar',
  'karena',
  'sehingga',
  'tersebut',
  'ini',
  'itu',
  'suatu',
  'sebuah',
  'para',
  'lebih',
  'kurang',
  'sangat',
  'juga',
  'the',
  'a',
  'an',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
])

const GENERIC_ACADEMIC_TERMS_ID = new Set([
  'analisis',
  'studi',
  'pengaruh',
  'hubungan',
  'faktor',
  'tingkat',
  'kajian',
  'bahaya',
  'terhadap',
  'penelitian',
  'metode',
  'pendekatan',
  'evaluasi',
  'tinjauan',
  'review',
  'literatur',
])

const COUNTRY_PROFILES = [
  { name: 'Indonesia', countryCode: 'ID', keywords: ['indonesia', 'indonesian'] },
]

// A small, pragmatic disease list. Extend as needed.
const DISEASE_PROFILES = [
  {
    canonical: 'HIV',
    aliases: ['hiv'],
    conceptId: 'C3013748606',
    validationRegex: /(?:\bhiv\b|h\.?i\.?v\.?|hiv-1|hiv\/aids)/i,
  },
  {
    canonical: 'Tuberculosis',
    aliases: ['tuberculosis', 'tb', 'tbc', 'tuberkulosis'],
    conceptId: 'C2781069245',
    validationRegex: /(?:\btuberculosis\b|\btb\b|\btbc\b|\btuberkulosis\b)/i,
  },
  {
    canonical: 'Dengue',
    aliases: ['dengue', 'dbd', 'demam_berdarah'],
    conceptId: 'C533803919',
    validationRegex: /(?:\bdengue\b|demam\s+berdarah|\bdbd\b)/i,
  },
  {
    canonical: 'Malaria',
    aliases: ['malaria'],
    conceptId: 'C2778048844',
    validationRegex: /\bmalaria\b/i,
  },
  {
    canonical: 'Diabetes',
    aliases: ['diabetes', 'diabetes mellitus'],
    conceptId: 'C555293320',
    validationRegex: /\bdiabetes\b/i,
  },
  {
    canonical: 'COVID-19',
    aliases: ['covid-19', 'covid', 'sars-cov-2'],
    conceptId: 'C3008058167',
    validationRegex: /(?:\bcovid-?19\b|\bsars-cov-2\b|\bcovid\b)/i,
  },
  {
    canonical: 'Hepatitis',
    aliases: ['hepatitis'],
    conceptId: 'C2776029263',
    validationRegex: /\bhepatitis\b/i,
  },
]

const EPIDEMIOLOGY_TRANSLATIONS = {
  persebaran: ['transmission', 'spread', 'prevalence'],
  penyebaran: ['transmission', 'spread', 'prevalence'],
  penularan: ['transmission'],
  prevalensi: ['prevalence'],
  angka_kejadian: ['incidence'],
  kejadian: ['incidence'],
  kematian: ['mortality'],
  epidemiologi: ['epidemiology'],
}

function normalizeQueryForKeywords(input) {
  return (input || '')
    .toLowerCase()
    .replace(/\bangka\s+kejadian\b/g, 'angka_kejadian')
    .replace(/\bdemam\s+berdarah\b/g, 'demam_berdarah')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeKeywords(input) {
  return (input || '')
    .replace(/[^a-z0-9_\s-]+/gi, ' ')
    .replace(/[-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean)
}

function uniquePreserveOrder(items) {
  const out = []
  const seen = new Set()
  for (const item of items) {
    const key = String(item || '').toLowerCase()
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(String(item))
  }
  return out
}

function detectCountry(extractedKeywords) {
  const lower = extractedKeywords.map((k) => k.toLowerCase())
  return COUNTRY_PROFILES.find((profile) => profile.keywords.some((kw) => lower.includes(kw)))
}

function detectDisease(extractedKeywords) {
  const lower = extractedKeywords.map((k) => k.toLowerCase())
  return DISEASE_PROFILES.find((profile) => profile.aliases.some((alias) => lower.includes(alias)))
}

function normalizeKeywordToken(token) {
  const cleaned = String(token || '').trim()
  if (!cleaned) return ''
  const lower = cleaned.toLowerCase()
  if (lower === 'hiv') return 'HIV'
  return lower
}

function scoreSecondaryGroup(sourceKeyword) {
  const lower = String(sourceKeyword || '').toLowerCase()
  let score = 0
  if (EPIDEMIOLOGY_TRANSLATIONS[lower]) score += 10
  if (lower.length >= 7) score += 2
  if (/\d/.test(lower)) score -= 2
  return score
}

function buildSecondaryGroups(extractedKeywords, disease, country) {
  const secondarySource = extractedKeywords.filter((k) => {
    const lower = k.toLowerCase()
    if (disease && disease.aliases.includes(lower)) return false
    if (country && country.keywords.includes(lower)) return false
    return true
  })

  const rankedSecondary = [...secondarySource].sort((a, b) => scoreSecondaryGroup(b) - scoreSecondaryGroup(a))
  return rankedSecondary.slice(0, 2).map((keyword) => {
    const lower = keyword.toLowerCase()
    const translations = EPIDEMIOLOGY_TRANSLATIONS[lower] || []
    const group = uniquePreserveOrder([lower, ...translations])
    return group.map(normalizeKeywordToken).filter(Boolean)
  })
}

function processQuery(originalQuery) {
  const cleanedQuery = normalizeQueryForKeywords(originalQuery)
  const tokens = tokenizeKeywords(cleanedQuery)
  let extracted = uniquePreserveOrder(
    tokens
      .map((t) => t.toLowerCase())
      .filter((t) => t.length >= 2)
      .filter((t) => !INDONESIAN_STOPWORDS.has(t))
      .filter((t) => !GENERIC_ACADEMIC_TERMS_ID.has(t))
  )

  const disease = detectDisease(extracted)
  const country = detectCountry(extracted)

  if (disease) {
    const primary = disease.aliases[0]
    const rest = extracted.filter((k) => !disease.aliases.includes(k.toLowerCase()))
    extracted = [primary, ...rest]
  }
  if (country) {
    const countrySet = new Set(country.keywords.map((k) => k.toLowerCase()))
    const nonCountry = extracted.filter((k) => !countrySet.has(k.toLowerCase()))
    const onlyCountry = extracted.filter((k) => countrySet.has(k.toLowerCase()))
    extracted = [...nonCountry, ...onlyCountry]
  }

  const secondaryGroups = buildSecondaryGroups(extracted, disease, country)

  const translatedKeywords = uniquePreserveOrder([
    ...extracted.map(normalizeKeywordToken).filter(Boolean),
    ...secondaryGroups.flat(),
    ...(country ? [country.name] : []),
    ...(disease ? [disease.canonical] : []),
  ])

  return {
    originalQuery,
    cleanedQuery,
    extractedKeywords: extracted,
    translatedKeywords,
    disease,
    country,
    secondaryGroups,
  }
}

function buildAbstractFromInvertedIndex(index) {
  if (!index) return undefined
  const wordsByPos = []
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) {
      if (!Number.isFinite(pos)) continue
      wordsByPos[pos] = word
    }
  }
  const abstract = wordsByPos.filter(Boolean).join(' ').trim()
  return abstract || undefined
}

function pickBestAttempt(attemptResults) {
  for (const r of attemptResults) {
    if (r.validated && r.validated.length > 0) return r
  }
  return attemptResults[attemptResults.length - 1] || null
}

async function fetchWithRedirectAllowlist(url, init, allowedHosts, maxRedirects = 2) {
  let currentUrl = url
  for (let i = 0; i <= maxRedirects; i += 1) {
    const response = await fetch(currentUrl, { ...(init || {}), redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response
    }

    const location = response.headers.get('location')
    if (response.body) response.body.cancel()
    if (!location) throw new Error('Redirect received without Location header')

    const nextUrl = new URL(location, currentUrl)
    if (nextUrl.protocol !== 'https:') throw new Error('Redirect to non-HTTPS blocked')
    if (!allowedHosts.has(nextUrl.hostname.toLowerCase())) throw new Error(`Redirect to disallowed host: ${nextUrl.hostname}`)
    currentUrl = nextUrl.toString()
  }
  throw new Error('Too many redirects')
}

function generateHtmlReport(summary) {
  const esc = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;')

  const rows = (summary.validated || [])
    .slice(0, 10)
    .map((a, idx) => {
      const kw = (a.keywordMatches || []).join(', ')
      const miss = (a.keywordMissing || []).join(', ')
      const abs = a.abstract ? a.abstract.slice(0, 280) : ''
      return `<tr>
        <td>${idx + 1}</td>
        <td>
          <div class="title">${esc(a.title)}</div>
          <div class="meta">${esc(a.venue || '')} (${esc(a.year)})</div>
          <div class="meta">matches: <b>${esc(kw)}</b></div>
          <div class="meta">missing: ${esc(miss)}</div>
          ${abs ? `<div class="abs">${esc(abs)}...</div>` : ''}
        </td>
      </tr>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Search Audit</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 24px; }
      .card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
      h1 { font-size: 18px; margin: 0 0 8px 0; }
      .kv { font-size: 12px; color: #333; line-height: 1.6; }
      code { background: #f6f6f6; padding: 2px 6px; border-radius: 6px; }
      table { width: 100%; border-collapse: collapse; }
      td { vertical-align: top; border-top: 1px solid #eee; padding: 10px 8px; }
      td:first-child { width: 36px; color: #666; }
      .title { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
      .meta { font-size: 12px; color: #555; margin-bottom: 2px; }
      .abs { margin-top: 8px; font-size: 12px; color: #222; background: #fafafa; border: 1px solid #eee; padding: 8px; border-radius: 10px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Query</h1>
      <div class="kv"><b>original</b>: <code>${esc(summary.processed.originalQuery)}</code></div>
      <div class="kv"><b>cleaned</b>: <code>${esc(summary.processed.cleanedQuery)}</code></div>
      <div class="kv"><b>extracted</b>: ${esc(summary.processed.extractedKeywords.join(', '))}</div>
      <div class="kv"><b>translated</b>: ${esc(summary.processed.translatedKeywords.join(', '))}</div>
      <div class="kv"><b>attempt</b>: ${esc(summary.attempt || '')}</div>
      <div class="kv"><b>openalex urls</b>:<br/>${(summary.urls || []).map((u) => `<code>${esc(u)}</code>`).join('<br/>')}</div>
      <div class="kv"><b>results returned</b>: ${esc(summary.validated ? summary.validated.length : 0)}</div>
    </div>

    <div class="card">
      <h1>Top Results (Validated)</h1>
      <table>
        <tbody>
          ${rows || '<tr><td>1</td><td>No validated results.</td></tr>'}
        </tbody>
      </table>
    </div>
  </body>
</html>`
}

function buildValidationGroups(processed) {
  const groups = []

  if (processed.disease) {
    groups.push({
      label: processed.disease.canonical,
      regex: processed.disease.validationRegex,
      terms: [],
    })
  }

  if (processed.country) {
    groups.push({
      label: processed.country.name,
      terms: uniquePreserveOrder([processed.country.name, ...processed.country.keywords]).map((t) => t.toLowerCase()),
    })
  }

  const diseaseAliasSet = new Set(processed.disease ? processed.disease.aliases.map((a) => a.toLowerCase()) : [])
  const countryKwSet = new Set(processed.country ? processed.country.keywords.map((k) => k.toLowerCase()) : [])

  for (const raw of processed.extractedKeywords || []) {
    const keyword = String(raw || '').toLowerCase()
    if (!keyword) continue
    if (diseaseAliasSet.has(keyword)) continue
    if (countryKwSet.has(keyword)) continue

    const translations = EPIDEMIOLOGY_TRANSLATIONS[keyword] || []
    const terms = uniquePreserveOrder([keyword, ...translations]).map((t) => String(t).toLowerCase())
    groups.push({ label: keyword, terms })
  }

  return groups
}

function validateArticle(processed, article) {
  const text = `${article.title || ''}\n${article.abstract || ''}`.toLowerCase()
  const groups = buildValidationGroups(processed)

  const matches = []
  const missing = []
  let coreOk = true

  for (const g of groups) {
    if (g.regex) {
      const ok = g.regex.test(article.title || '') || g.regex.test(article.abstract || '')
      if (processed.disease && g.label === processed.disease.canonical) coreOk = ok
      if (ok) matches.push(g.label)
      else missing.push(g.label)
      continue
    }

    const hit = (g.terms || []).find((term) => term && term.length >= 2 && text.includes(term))
    if (hit) matches.push(`${g.label}:${hit}`)
    else missing.push(g.label)
  }

  return {
    coreOk,
    keywordMatches: matches,
    keywordMissing: missing,
    keywordMatchRate: groups.length > 0 ? matches.length / groups.length : 0,
  }
}

async function openAlexSearch(processed, opts) {
  const perPage = opts.perPage || 10
  const page = opts.page || 1

  const baseFilters = []
  if (processed.disease && processed.disease.conceptId && opts.useConcept) {
    baseFilters.push(`concept.id:${processed.disease.conceptId}`)
  }
  if (processed.country && opts.useInstitutionsCountryCode) {
    baseFilters.push(`institutions.country_code:${processed.country.countryCode}`)
  }
  if (processed.country && opts.requireCountryInAbstract) {
    baseFilters.push(`abstract.search:${processed.country.name}`)
  }
  if (opts.includeSecondaryGroups) {
    for (const group of processed.secondaryGroups || []) {
      if (!group || group.length === 0) continue
      baseFilters.push(`abstract.search:${group.join('|')}`)
    }
  }

  const select = [
    'id',
    'title',
    'authorships',
    'publication_year',
    'host_venue',
    'doi',
    'open_access',
    'cited_by_count',
    'landing_page_url',
    'abstract_inverted_index',
    'relevance_score',
    'type',
  ].join(',')

  const keywordString =
    (processed.translatedKeywords || []).filter((t) => t && String(t).length >= 2).slice(0, 6).join(' ').trim() ||
    processed.cleanedQuery

  const fieldQuery = processed.disease ? processed.disease.canonical : keywordString

  const buildUrl = (filters) => {
    const sp = new URLSearchParams()
    sp.set('page', String(page))
    sp.set('per-page', String(perPage))
    sp.set('sort', 'relevance_score:desc')
    sp.set('select', select)
    sp.set('filter', filters.join(','))
    return `https://api.openalex.org/works?${sp.toString()}`
  }

  const titleUrl = buildUrl([`title.search:${fieldQuery}`, ...baseFilters])
  const absUrl = buildUrl([`abstract.search:${fieldQuery}`, ...baseFilters])

  const [titleRes, absRes] = await Promise.all([
    fetchWithRedirectAllowlist(titleUrl, {}, OPENALEX_ALLOWED_HOSTS, 2),
    fetchWithRedirectAllowlist(absUrl, {}, OPENALEX_ALLOWED_HOSTS, 2),
  ])

  if (!titleRes.ok && !absRes.ok) {
    return { ok: false, errorCode: titleRes.status === 429 || absRes.status === 429 ? 'rate_limit' : 'upstream', urls: [titleUrl, absUrl] }
  }

  const titleJson = titleRes.ok ? await titleRes.json() : { results: [], meta: { count: 0 } }
  const absJson = absRes.ok ? await absRes.json() : { results: [], meta: { count: 0 } }

  const merged = []
  const seen = new Set()
  for (const work of [...(titleJson.results || []), ...(absJson.results || [])]) {
    const key = work.id || work.doi || work.title
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)

    const abstract = buildAbstractFromInvertedIndex(work.abstract_inverted_index)
    merged.push({
      id: work.id,
      title: work.title,
      authors: (work.authorships || []).slice(0, 5).map((a) => a.author?.display_name).filter(Boolean),
      year: work.publication_year,
      venue: work.host_venue?.display_name,
      doi: work.doi,
      url: work.landing_page_url,
      citedBy: work.cited_by_count || 0,
      openAccess: Boolean(work.open_access?.is_oa),
      source: 'openAlex',
      abstract,
      relevanceScore: typeof work.relevance_score === 'number' ? work.relevance_score : 0,
    })
  }

  // Strict disease validation (if detected)
  const validatedCore = processed.disease
    ? merged.filter((a) => processed.disease.validationRegex.test(a.title || '') || processed.disease.validationRegex.test(a.abstract || ''))
    : merged

  validatedCore.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
  const totalEstimate = Math.max(Number(titleJson.meta?.count || 0), Number(absJson.meta?.count || 0))

  return {
    ok: true,
    urls: [titleUrl, absUrl],
    totalEstimate,
    merged,
    validatedCore,
  }
}

function nowStamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function readQueries(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
}

async function maybeTakeScreenshot(html, outPath) {
  let chromium
  try {
    const pw = await import('playwright')
    chromium = pw.chromium
  } catch {
    return { ok: false, reason: 'playwright_not_installed' }
  }

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    await page.setContent(html, { waitUntil: 'load' })
    await page.waitForTimeout(50)
    await page.screenshot({ path: outPath, fullPage: true })
    return { ok: true }
  } finally {
    await browser.close()
  }
}

async function main() {
  const root = process.cwd()
  const queriesFile = process.argv[2] || path.join(root, 'scripts', 'search-queries.txt')
  const queries = readQueries(queriesFile)

  if (queries.length < 25) {
    console.error(`Need 25 queries, found ${queries.length}. Fill ${path.relative(root, queriesFile)} with 25 lines.`)
    process.exitCode = 1
    return
  }

  const runQueries = queries.slice(0, 25)
  const outDir = path.join(root, 'artifacts', 'search-audit', nowStamp())
  const jsonDir = path.join(outDir, 'json')
  const htmlDir = path.join(outDir, 'html')
  const screenshotDir = path.join(outDir, 'screenshots')

  fs.mkdirSync(jsonDir, { recursive: true })
  fs.mkdirSync(htmlDir, { recursive: true })
  fs.mkdirSync(screenshotDir, { recursive: true })

  const index = []

  for (let i = 0; i < runQueries.length; i += 1) {
    const q = runQueries[i]
    const processed = processQuery(q)

    const attempts = []
    const hasDisease = Boolean(processed.disease)
    const hasCountry = Boolean(processed.country)

    if (hasDisease && hasCountry) {
      attempts.push({ name: 'strict', requireCountryInAbstract: true, useInstitutionsCountryCode: false, useConcept: true, includeSecondaryGroups: processed.secondaryGroups.length > 0 })
      attempts.push({ name: 'relax_secondary', requireCountryInAbstract: true, useInstitutionsCountryCode: false, useConcept: true, includeSecondaryGroups: false })
      attempts.push({ name: 'geo_institution', requireCountryInAbstract: false, useInstitutionsCountryCode: true, useConcept: true, includeSecondaryGroups: false })
      attempts.push({ name: 'relax_concept', requireCountryInAbstract: true, useInstitutionsCountryCode: false, useConcept: false, includeSecondaryGroups: false })
      attempts.push({ name: 'geo_institution_no_concept', requireCountryInAbstract: false, useInstitutionsCountryCode: true, useConcept: false, includeSecondaryGroups: false })
    } else if (hasDisease) {
      attempts.push({ name: 'strict', requireCountryInAbstract: false, useInstitutionsCountryCode: false, useConcept: true, includeSecondaryGroups: processed.secondaryGroups.length > 0 })
      attempts.push({ name: 'relax_secondary', requireCountryInAbstract: false, useInstitutionsCountryCode: false, useConcept: true, includeSecondaryGroups: false })
      attempts.push({ name: 'relax_concept', requireCountryInAbstract: false, useInstitutionsCountryCode: false, useConcept: false, includeSecondaryGroups: false })
    } else if (hasCountry) {
      attempts.push({ name: 'keywords', requireCountryInAbstract: true, useInstitutionsCountryCode: false, useConcept: false, includeSecondaryGroups: false })
      attempts.push({ name: 'keywords_geo_institution', requireCountryInAbstract: false, useInstitutionsCountryCode: true, useConcept: false, includeSecondaryGroups: false })
    } else {
      attempts.push({ name: 'keywords', requireCountryInAbstract: false, useInstitutionsCountryCode: false, useConcept: false, includeSecondaryGroups: false })
    }

    const attemptResults = []
    for (const a of attempts) {
      const r = await openAlexSearch(processed, { perPage: 25, ...a })
      if (!r.ok) {
        attemptResults.push({ attempt: a.name, urls: r.urls, errorCode: r.errorCode, merged: [], validated: [] })
        continue
      }

      const validated = r.validatedCore.map((article) => {
        const v = validateArticle(processed, article)
        return { ...article, ...v }
      })

      attemptResults.push({
        attempt: a.name,
        urls: r.urls,
        totalEstimate: r.totalEstimate,
        mergedCount: r.merged.length,
        validated,
      })

      if (validated.length > 0) break
    }

    const best = pickBestAttempt(attemptResults)
    const n = String(i + 1).padStart(2, '0')

    const summary = {
      processed,
      attempt: best ? best.attempt : null,
      urls: best ? best.urls : [],
      validated: best ? best.validated : [],
      attempts: attemptResults,
    }

    const jsonPath = path.join(jsonDir, `search-${n}.json`)
    const htmlPath = path.join(htmlDir, `search-${n}.html`)
    const pngPath = path.join(screenshotDir, `search-${n}.png`)

    fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), 'utf8')

    const html = generateHtmlReport(summary)
    fs.writeFileSync(htmlPath, html, 'utf8')

    const ss = await maybeTakeScreenshot(html, pngPath)

    index.push({
      n,
      query: q,
      disease: processed.disease ? processed.disease.canonical : null,
      country: processed.country ? processed.country.name : null,
      attempt: summary.attempt,
      results: summary.validated.length,
      html: path.relative(outDir, htmlPath).replace(/\\/g, '/'),
      json: path.relative(outDir, jsonPath).replace(/\\/g, '/'),
      screenshot: ss.ok ? path.relative(outDir, pngPath).replace(/\\/g, '/') : null,
      screenshotStatus: ss.ok ? 'ok' : ss.reason,
    })

    console.log(`[${n}/25] ${q} -> ${summary.validated.length} results (attempt=${summary.attempt || 'none'})`)
  }

  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8')
  fs.writeFileSync(
    path.join(outDir, 'README.txt'),
    [
      'Search audit generated by scripts/search-audit.mjs',
      '',
      `Queries: ${path.relative(root, queriesFile)}`,
      `Output: ${path.relative(root, outDir)}`,
      '',
      'If screenshots are missing, install Playwright + Chromium:',
      '  npm i -D playwright',
      '  npx playwright install chromium',
      '',
    ].join('\n'),
    'utf8'
  )

  console.log(`\nDone. Output folder: ${path.relative(root, outDir)}`)
}

main().catch((err) => {
  console.error('audit failed:', err)
  process.exitCode = 1
})
