import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PRODUCTION_API_BASE_URL,
  UNEXPECTED_API_RESPONSE_ERROR,
  UPLOADED_HTML_FETCH_MODE,
  analyzeMatchInput,
  buildApiUrl,
} from '../src/lib/analysis'

const fixture = readFileSync(join(process.cwd(), 'tests/fixtures/sample-pbp.html'), 'utf8')

describe('analyzeMatchInput', () => {
  it('analyzes uploaded html locally without calling the API', async () => {
    const fetchImpl = vi.fn<typeof fetch>()

    const analysis = await analyzeMatchInput({
      url: 'https://www.buzzerbeater.com/match/140140858/pbp.aspx',
      uploadedHtml: fixture,
      fetchImpl,
    })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(analysis.summary.fetchMode).toBe(UPLOADED_HTML_FETCH_MODE)
    expect(analysis.summary.matchId).toBe('140140858')
    expect(analysis.summary.homeTeam.points).toBe(7)
  })

  it('keeps using the api for url-based analysis', async () => {
    const analysis = { summary: { matchId: '140140858' } }
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json; charset=utf-8' }),
      json: async () => ({ analysis }),
    } as Response)

    const result = await analyzeMatchInput({
      url: 'https://www.buzzerbeater.com/match/140140858/pbp.aspx',
      uploadedHtml: '',
      apiBaseUrl: 'https://api.example.com/',
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.com/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://www.buzzerbeater.com/match/140140858/pbp.aspx',
      }),
    })
    expect(result).toBe(analysis)
  })

  it('raises the current backend configuration error for non-json api responses', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      json: async () => ({}),
    } as Response)

    await expect(
      analyzeMatchInput({
        url: 'https://www.buzzerbeater.com/match/140140858/pbp.aspx',
        uploadedHtml: '',
        fetchImpl,
      }),
    ).rejects.toThrow(UNEXPECTED_API_RESPONSE_ERROR)
  })

  it('surfaces non-json http failures with their status code', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      json: async () => ({}),
    } as Response)

    await expect(
      analyzeMatchInput({
        url: 'https://www.buzzerbeater.com/match/140140858/pbp.aspx',
        uploadedHtml: '',
        fetchImpl,
      }),
    ).rejects.toThrow('The backend API returned HTTP 502.')
  })
})

describe('buildApiUrl', () => {
  it('falls back to the deployed Render API on GitHub Pages when no base url is configured', () => {
    try {
      vi.stubGlobal('location', new URL('https://matmozaur.github.io/BuzzerBeaterAnalysis/'))

      expect(buildApiUrl('/api/analyze')).toBe(`${DEFAULT_PRODUCTION_API_BASE_URL}/api/analyze`)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
