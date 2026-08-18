import { analyzeMatchHtml } from './analyzer.js'
import type { MatchAnalysis } from './types.js'

export const UPLOADED_HTML_FETCH_MODE = 'Uploaded HTML analyzed directly in the browser.'

function withFetchMode(analysis: MatchAnalysis, fetchMode: string): MatchAnalysis {
  return {
    ...analysis,
    summary: {
      ...analysis.summary,
      fetchMode,
    },
  }
}

export async function analyzeMatchInput({ uploadedHtml }: { uploadedHtml: string }) {
  const trimmedHtml = uploadedHtml.trim()

  if (!trimmedHtml) {
    throw new Error('Upload a play-by-play HTML file.')
  }

  return withFetchMode(analyzeMatchHtml(trimmedHtml), UPLOADED_HTML_FETCH_MODE)
}
