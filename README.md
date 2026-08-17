# BuzzerBeater Match Analyzer MVP

One-page web app for deterministic analysis of BuzzerBeater play-by-play pages.

## Architecture

- **Frontend:** React + Vite static app.
- **Backend:** small Express API that fetches the play-by-play HTML and runs deterministic parsing/stat calculations.
- **Shared logic:** `src/lib/analyzer.ts` parses the real ASP.NET play-by-play structure and computes all metrics.

The backend is required because direct browser fetches to BuzzerBeater cannot be relied on:

- the public evidence for `pbp.aspx` shows an ASP.NET WebForms page with `aspnetForm`, `#cbPbp`, and `#ctl00_cphContent_text`
- BuzzerBeater tooling in the wild uses authenticated server-side scrapers/proxies
- static browser apps cannot safely assume cross-origin access to the page

## Real page structure used by the parser

The parser is designed around observed BuzzerBeater selectors, not invented ones:

- `form#aspnetForm[action="/match/{id}/pbp.aspx"]`
- saved exports with `form#form1[action="https://www.buzzerbeater.com/match/{id}/pbp.aspx"]`
- `#cbPbp a[href*="/player/"][href$="/overview.aspx"]` for roster/link extraction
- `#ctl00_cphContent_text table tr[class]` or `#cphContent_text table tr[class]` for play rows
- row cells interpreted as:
  1. quarter
  2. clock
  3. score
  4. event text with player links

The implementation also uses real known `<tr class="...">` play types such as `WING`, `CORNER_THREE`, `FREE_THROW_MADE`, `REBOUND`, `STEAL`, `BAD_PASS`, and `SUBSTITUTION`.

## MVP calculations

Player metrics:

- minutes
- points
- FGM/FGA
- 3PM/3PA
- FTM/FTA
- offensive rebounds
- defensive rebounds
- assists
- steals
- blocks
- turnovers
- personal fouls
- plus/minus

Team metrics:

- estimated possessions = `FGA - ORB + TOV + 0.44 * FTA`
- offensive rating per 100 possessions
- defensive rating per 100 possessions
- eFG%
- TS%

## Local development

### Prerequisites

- Node.js 22+
- npm 10+

### Install

```bash
npm ci
```

### Run locally

In terminal 1:

```bash
npm run dev
```

In terminal 2:

```bash
npm run dev:server
```

Frontend dev server: `http://localhost:5173`  
Backend API: `http://localhost:3001`

## Scripts

```bash
npm run lint
npm test
npm run build
npm run build:client
npm run build:server
npm run start
```

## Tests

Automated tests cover:

- parsing the real observed ASP.NET container structure
- deterministic stat aggregation
- minutes / substitution handling
- plus/minus and advanced metric calculations

Fixture HTML is stored in `tests/fixtures/sample-pbp.html`.

## Deployment

### Frontend

GitHub Pages deploys only the static Vite build from `dist/`.

Workflow:

- `.github/workflows/deploy-pages.yml`

Required repository variable:

- `VITE_API_BASE_URL` = public URL of the deployed backend API

If that variable is not set on GitHub Pages, the frontend falls back to the default Render service URL from `render.yaml`.

### Backend

Render configuration is included in `render.yaml`.

The backend exposes:

- `GET /health`
- `POST /api/analyze`

Request body:

```json
{
  "url": "https://www.buzzerbeater.com/match/140140858/pbp.aspx"
}
```

## Error handling

The UI/API returns explicit errors for:

- invalid URLs
- non-BuzzerBeater domains
- unexpected/missing play-by-play markup
- likely login / Supporter-only access issues

## Notes and limitations

- All parsing and calculations are deterministic.
- No LLM or AI is used for match analysis.
- Assist parsing falls back to inline passer detection when the play log does not include separate `ASSIST` rows.
- Rebound offense/defense classification is inferred from the immediately preceding missed shot/free throw context.
