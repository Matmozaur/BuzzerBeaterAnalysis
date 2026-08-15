import cors from 'cors'
import express from 'express'
import { analyzeMatchHtml } from '../src/lib/analyzer.js'

const PORT = Number(process.env.PORT ?? 3001)
const REQUEST_TIMEOUT_MS = 20_000
const LOCAL_ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
])

class ClientInputError extends Error {}
class UpstreamFetchError extends Error {}
const MAX_UPLOADED_HTML_LENGTH = 2_000_000

function parseMatchIdFromUrl(input: string) {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(input)
  } catch {
    throw new ClientInputError('Please provide a valid BuzzerBeater play-by-play URL.')
  }

  if (!/^www\d*\.buzzerbeater\.(com|org)$/i.test(parsedUrl.hostname) && !/^buzzerbeater\.(com|org)$/i.test(parsedUrl.hostname)) {
    throw new ClientInputError(
      'Only buzzerbeater.com and buzzerbeater.org play-by-play URLs are supported.',
    )
  }

  if (!/\/match\/\d+\/pbp\.aspx$/i.test(parsedUrl.pathname)) {
    throw new ClientInputError('The URL must look like /match/{id}/pbp.aspx.')
  }

  const matchId = parsedUrl.pathname.match(/\/match\/(\d+)\/pbp\.aspx$/i)?.[1]
  if (!matchId) {
    throw new ClientInputError('Could not extract a match id from the URL.')
  }

  const numericMatchId = Number.parseInt(matchId, 10)
  if (!Number.isSafeInteger(numericMatchId) || numericMatchId <= 0) {
    throw new ClientInputError('The URL does not contain a valid numeric match id.')
  }

  return numericMatchId
}

function resolveAllowedOrigins() {
  const configuredOrigins = process.env.CORS_ORIGIN?.split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (configuredOrigins && configuredOrigins.length > 0) {
    return new Set(configuredOrigins)
  }

  return process.env.NODE_ENV === 'production' ? new Set<string>() : LOCAL_ALLOWED_ORIGINS
}

async function fetchMatchHtml(matchId: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const url = new URL(`/match/${matchId.toString(10)}/pbp.aspx`, 'https://www.buzzerbeater.com/')

  try {
    let response: Response

    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'BuzzerBeaterAnalysis/1.0 (+https://github.com/Matmozaur/BuzzerBeaterAnalysis)',
        },
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new UpstreamFetchError('Timed out while fetching the BuzzerBeater page.')
      }

      throw new UpstreamFetchError('Could not reach BuzzerBeater from the backend API.')
    }

    if (!response.ok) {
      throw new UpstreamFetchError(`BuzzerBeater responded with HTTP ${response.status}.`)
    }

    const html = await response.text()
    if (!html.includes('aspnetForm') || !html.includes('ctl00_cphContent_text')) {
      throw new UpstreamFetchError(
        'The fetched page did not contain the expected play-by-play markup. The match may require login or Supporter access.',
      )
    }

    return html
  } finally {
    clearTimeout(timeout)
  }
}

function parseUploadedHtml(input: unknown) {
  if (typeof input !== 'string') {
    return null
  }

  const html = input.trim()
  if (html.length === 0) {
    return null
  }

  if (html.length > MAX_UPLOADED_HTML_LENGTH) {
    throw new ClientInputError('Uploaded HTML is too large.')
  }

  return html
}

const app = express()
const allowedOrigins = resolveAllowedOrigins()

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true)
        return
      }

      callback(new ClientInputError('Origin is not allowed to call this API.'))
    },
  }),
)
app.use(express.json({ limit: '3mb' }))

app.get('/health', (_request, response) => {
  response.json({ ok: true })
})

app.post('/api/analyze', async (request, response) => {
  try {
    const uploadedHtml = parseUploadedHtml(request.body?.html)
    let analysis

    if (uploadedHtml) {
      try {
        analysis = analyzeMatchHtml(uploadedHtml)
      } catch (error) {
        throw new ClientInputError(
          error instanceof Error ? error.message : 'Could not parse the uploaded HTML file.',
        )
      }
      analysis.summary.fetchMode = 'Uploaded HTML analyzed through the Node API.'
    } else {
      const matchId = parseMatchIdFromUrl(String(request.body?.url ?? ''))
      const html = await fetchMatchHtml(matchId)
      analysis = analyzeMatchHtml(html)
    }

    response.json({ analysis })
  } catch (error) {
    const status =
      error instanceof ClientInputError ? 400 : error instanceof UpstreamFetchError ? 502 : 500

    response.status(status).json({
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
