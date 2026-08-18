import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { ChangeEvent } from 'react'
import { analyzeMatchInput } from './lib/analysis'
import type { MatchAnalysis } from './lib/types'

type Status = 'idle' | 'loading' | 'error' | 'success'

function formatNumber(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—'
}

function formatMinutes(value: number) {
  const wholeMinutes = Math.floor(value)
  const seconds = Math.round((value - wholeMinutes) * 60)
  return `${wholeMinutes}:${String(seconds).padStart(2, '0')}`
}

function App() {
  const [uploadedHtml, setUploadedHtml] = useState('')
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('loading')
    setError('')

    try {
      const nextAnalysis = await analyzeMatchInput({ uploadedHtml })

      setAnalysis(nextAnalysis)
      setStatus('success')
    } catch (submissionError) {
      setAnalysis(null)
      setStatus('error')
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'The analyzer could not load this match.',
      )
    }
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      setUploadedHtml('')
      setUploadedFileName('')
      return
    }

    const html = await file.text()
    setUploadedHtml(html)
    setUploadedFileName(file.name)
    setStatus('idle')
    setError('')
  }

  const teams = useMemo(() => analysis?.teams ?? [], [analysis])

  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">BuzzerBeater analytics</p>
        <h1>BuzzerBeater Match Analyzer</h1>
        <p className="hero-copy">
          Upload a saved BuzzerBeater play-by-play HTML file to get team box scores, player
          stats, and advanced player metrics.
        </p>

        <form className="analyze-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Play-by-play HTML</span>
            <input type="file" accept=".html,text/html" onChange={onFileChange} />
          </label>
          <p className="hint">
            {uploadedFileName ? `Using uploaded file: ${uploadedFileName}` : 'Choose an exported HTML file to begin.'}
          </p>
          <button type="submit" disabled={status === 'loading' || !uploadedHtml}>
            {status === 'loading' ? 'Analyzing…' : 'Analyze'}
          </button>
        </form>

        {status === 'error' ? <div className="message error">{error}</div> : null}
      </section>

      {analysis ? (
        <>
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Game summary</p>
                <h2>
                  {analysis.summary.awayTeam.name} {analysis.summary.awayTeam.points} –{' '}
                  {analysis.summary.homeTeam.points} {analysis.summary.homeTeam.name}
                </h2>
              </div>
              <div className="badge-row">
                <span className="badge">Match #{analysis.summary.matchId}</span>
                <span className="badge">{analysis.summary.periods} period(s)</span>
                <span className="badge">{analysis.summary.totalPlays} plays</span>
              </div>
            </div>
            <div className="summary-grid">
              <article>
                <h3>Analysis mode</h3>
                <p>{analysis.summary.fetchMode}</p>
              </article>
              <article>
                <h3>Parser evidence</h3>
                <p>{analysis.summary.parserEvidence}</p>
              </article>
              <article>
                <h3>Warnings</h3>
                <ul>
                  {analysis.summary.warnings.length > 0 ? (
                    analysis.summary.warnings.map((warning) => <li key={warning}>{warning}</li>)
                  ) : (
                    <li>No parser warnings.</li>
                  )}
                </ul>
              </article>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Team statistics</p>
                <h2>Box score and efficiency</h2>
              </div>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>PTS</th>
                    <th>FG</th>
                    <th>3PT</th>
                    <th>FT</th>
                    <th>ORB</th>
                    <th>DRB</th>
                    <th>AST</th>
                    <th>STL</th>
                    <th>BLK</th>
                    <th>TO</th>
                    <th>PF</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <tr key={team.side}>
                      <th>{team.name}</th>
                      <td>{team.stats.points}</td>
                      <td>
                        {team.stats.fgm}/{team.stats.fga}
                      </td>
                      <td>
                        {team.stats.threePm}/{team.stats.threePa}
                      </td>
                      <td>
                        {team.stats.ftm}/{team.stats.fta}
                      </td>
                      <td>{team.stats.offensiveRebounds}</td>
                      <td>{team.stats.defensiveRebounds}</td>
                      <td>{team.stats.assists}</td>
                      <td>{team.stats.steals}</td>
                      <td>{team.stats.blocks}</td>
                      <td>{team.stats.turnovers}</td>
                      <td>{team.stats.personalFouls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Advanced metrics</p>
                <h2>Per-team efficiency</h2>
              </div>
            </div>
            <div className="metrics-grid">
              {teams.map((team) => (
                <article className="metric-card" key={team.side}>
                  <h3>{team.name}</h3>
                  <dl>
                    <div>
                      <dt>Estimated possessions</dt>
                      <dd>{formatNumber(team.advanced.estimatedPossessions, 2)}</dd>
                    </div>
                    <div>
                      <dt>Offensive rating</dt>
                      <dd>{formatNumber(team.advanced.offensiveRating, 1)}</dd>
                    </div>
                    <div>
                      <dt>Defensive rating</dt>
                      <dd>{formatNumber(team.advanced.defensiveRating, 1)}</dd>
                    </div>
                    <div>
                      <dt>eFG%</dt>
                      <dd>{formatNumber(team.advanced.effectiveFieldGoalPercentage, 1)}%</dd>
                    </div>
                    <div>
                      <dt>TS%</dt>
                      <dd>{formatNumber(team.advanced.trueShootingPercentage, 1)}%</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section className="player-section">
            {teams.map((team) => (
              <section className="panel" key={`${team.side}-players`}>
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Player box score</p>
                    <h2>{team.name}</h2>
                  </div>
                </div>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>MIN</th>
                        <th>PTS</th>
                        <th>FG</th>
                        <th>3PT</th>
                        <th>FT</th>
                        <th>ORB</th>
                        <th>DRB</th>
                        <th>AST</th>
                        <th>STL</th>
                        <th>BLK</th>
                        <th>TO</th>
                        <th>PF</th>
                        <th>+/-</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.players.map((player) => (
                        <tr key={player.id}>
                          <th>
                            {player.name}
                            {player.isStarter ? <span className="starter-tag">Starter</span> : null}
                          </th>
                          <td>{formatMinutes(player.minutes)}</td>
                          <td>{player.points}</td>
                          <td>
                            {player.fgm}/{player.fga}
                          </td>
                          <td>
                            {player.threePm}/{player.threePa}
                          </td>
                          <td>
                            {player.ftm}/{player.fta}
                          </td>
                          <td>{player.offensiveRebounds}</td>
                          <td>{player.defensiveRebounds}</td>
                          <td>{player.assists}</td>
                          <td>{player.steals}</td>
                          <td>{player.blocks}</td>
                          <td>{player.turnovers}</td>
                          <td>{player.personalFouls}</td>
                          <td>{player.plusMinus >= 0 ? `+${player.plusMinus}` : player.plusMinus}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>TRB</th>
                        <th>eFG%</th>
                        <th>TS%</th>
                        <th>EFF</th>
                        <th>Stocks</th>
                        <th>Def plays</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.players.map((player) => (
                        <tr key={`${player.id}-advanced`}>
                          <th>{player.name}</th>
                          <td>{player.advanced.totalRebounds}</td>
                          <td>{formatNumber(player.advanced.effectiveFieldGoalPercentage, 1)}%</td>
                          <td>{formatNumber(player.advanced.trueShootingPercentage, 1)}%</td>
                          <td>{player.advanced.efficiency}</td>
                          <td>{player.advanced.stocks}</td>
                          <td>{player.advanced.defensivePlays}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </section>
        </>
      ) : null}
    </main>
  )
}

export default App
