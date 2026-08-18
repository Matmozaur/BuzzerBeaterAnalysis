# BuzzerBeater Match Analyzer MVP

One-page web app for deterministic analysis of saved BuzzerBeater play-by-play HTML files.

## Architecture

- **Frontend:** React + Vite static app that analyzes uploaded HTML locally in the browser.
- **Backend:** small Express API kept in the repo for server-side fetch workflows.
- **Shared logic:** `src/lib/analyzer.ts` parses the real ASP.NET play-by-play structure and computes all metrics.

The current UI only accepts uploaded HTML files, so analysis runs directly against the saved play-by-play markup.

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
- total rebounds
- eFG%
- TS%
- efficiency
- stocks
- defensive plays

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

```bash
npm run dev
```

Frontend dev server: `http://localhost:5173`

If you want to exercise the optional backend API, run it separately:

```bash
npm run dev:server
```

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

No backend base URL is required for the current upload-only UI.

### Backend

The backend remains available if you want to re-enable server-side URL fetching later.

Render configuration is included in `render.yaml`.

The backend exposes:

- `GET /health`
- `POST /api/analyze`

Request body:

```json
{
  "html": "<!doctype html>..."
}
```

## Error handling

The UI/API returns explicit errors for:

- missing uploaded HTML
- unexpected/missing play-by-play markup
- likely login / Supporter-only access issues

## Notes and limitations

- All parsing and calculations are deterministic.
- No LLM or AI is used for match analysis.
- Assist parsing falls back to inline passer detection when the play log does not include separate `ASSIST` rows.
- Rebound offense/defense classification is inferred from the immediately preceding missed shot/free throw context.
