import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  UNEXPECTED_API_RESPONSE_ERROR,
  UPLOADED_HTML_FETCH_MODE,
  analyzeMatchInput,
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
})
