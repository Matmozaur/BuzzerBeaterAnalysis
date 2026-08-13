import cors from 'cors'
import express from 'express'
import { analyzeMatchHtml } from '../src/lib/analyzer.js'

const PORT = Number(process.env.PORT ?? 3001)
const REQUEST_TIMEOUT_MS = 20_000

function assertBuzzerBeaterUrl(input: string) {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(input)
  } catch {
    throw new Error('Please provide a valid BuzzerBeater play-by-play URL.')
  }

  if (!/^www\d*\.?buzzerbeater\.(com|org)$/i.test(parsedUrl.hostname) && !/^buzzerbeater\.(com|org)$/i.test(parsedUrl.hostname)) {
    throw new Error('Only buzzerbeater.com and buzzerbeater.org play-by-play URLs are supported.')
  }

  if (!/\/match\/\d+\/pbp\.aspx$/i.test(parsedUrl.pathname)) {
    throw new Error('The URL must look like /match/{id}/pbp.aspx.')
  }

  return parsedUrl.toString()
}

async function fetchMatchHtml(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'BuzzerBeaterAnalysis/1.0 (+https://github.com/Matmozaur/BuzzerBeaterAnalysis)',
      },
    })

    if (!response.ok) {
      throw new Error(`BuzzerBeater responded with HTTP ${response.status}.`)
    }

    const html = await response.text()
    if (!html.includes('aspnetForm') || !html.includes('ctl00_cphContent_text')) {
      throw new Error(
        'The fetched page did not contain the expected play-by-play markup. The match may require login or Supporter access.',
      )
    }

    return html
  } finally {
    clearTimeout(timeout)
  }
}

const app = express()

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',').map((value) => value.trim()) ?? true,
  }),
)
app.use(express.json())

app.get('/health', (_request, response) => {
  response.json({ ok: true })
})

app.post('/api/analyze', async (request, response) => {
  try {
    const url = assertBuzzerBeaterUrl(String(request.body?.url ?? ''))
    const html = await fetchMatchHtml(url)
    const analysis = analyzeMatchHtml(html)
    response.json({ analysis })
  } catch (error) {
    response.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : 'The analyzer could not process that match.',
    })
  }
})

app.listen(PORT, () => {
  console.log(`BuzzerBeater analysis API listening on ${PORT}`)
})
