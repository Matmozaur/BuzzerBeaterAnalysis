import { analyzeMatchHtml } from './analyzer.js'
import type { MatchAnalysis } from './types.js'

export const UPLOADED_HTML_FETCH_MODE = 'Uploaded HTML analyzed directly in the browser.'
export const UNEXPECTED_API_RESPONSE_ERROR =
  'The API returned an unexpected response. The backend server may be unavailable or VITE_API_BASE_URL may not be configured.'

function withFetchMode(analysis: MatchAnalysis, fetchMode: string): MatchAnalysis {
  return {
    ...analysis,
    summary: {
      ...analysis.summary,
      fetchMode,
    },
  }
}

export function buildApiUrl(path: string, baseUrl?: string) {
  const base = baseUrl?.replace(/\/$/, '') ?? ''
  return `${base}${path}`
}

export async function analyzeMatchInput({
  url,
  uploadedHtml,
  apiBaseUrl,
  fetchImpl = fetch,
}: {
  url: string
  uploadedHtml: string
  apiBaseUrl?: string
  fetchImpl?: typeof fetch
}) {
  const trimmedUrl = url.trim()
  const trimmedHtml = uploadedHtml.trim()

  if (!trimmedHtml && !trimmedUrl) {
    throw new Error('Paste a play-by-play URL or upload an HTML file.')
  }

  if (trimmedHtml) {
    return withFetchMode(analyzeMatchHtml(trimmedHtml), UPLOADED_HTML_FETCH_MODE)
  }

  const response = await fetchImpl(buildApiUrl('/api/analyze', apiBaseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: trimmedUrl }),
  })

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      throw new Error(`The backend API returned HTTP ${response.status}.`)
    }

    throw new Error(UNEXPECTED_API_RESPONSE_ERROR)
  }

  const payload = (await response.json()) as { error?: string; analysis?: MatchAnalysis }
  if (!response.ok || !payload.analysis) {
    throw new Error(payload.error ?? 'Analysis failed.')
  }

  return payload.analysis
}
