import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { UPLOADED_HTML_FETCH_MODE, analyzeMatchInput } from '../src/lib/analysis'

const fixture = readFileSync(join(process.cwd(), 'tests/fixtures/sample-pbp.html'), 'utf8')

describe('analyzeMatchInput', () => {
  it('analyzes uploaded html locally without calling an API', async () => {
    const analysis = await analyzeMatchInput({ uploadedHtml: fixture })

    expect(analysis.summary.fetchMode).toBe(UPLOADED_HTML_FETCH_MODE)
    expect(analysis.summary.matchId).toBe('140140858')
    expect(analysis.summary.homeTeam.points).toBe(7)
  })

  it('rejects empty submissions', async () => {
    await expect(analyzeMatchInput({ uploadedHtml: '   ' })).rejects.toThrow(
      'Upload a play-by-play HTML file.',
    )
  })
})
