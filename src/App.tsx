import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { ChangeEvent } from 'react'
import { analyzeMatchInput } from './lib/analysis'
import type { MatchAnalysis, PlayerBoxScore, TeamAnalysis } from './lib/types'

type Status = 'idle' | 'loading' | 'error' | 'success'
type SortDirection = 'asc' | 'desc'
type PlayerSortKey =
  | 'name'
  | 'minutes'
  | 'points'
  | 'fgm'
  | 'fga'
  | 'threePm'
  | 'threePa'
  | 'ftm'
  | 'fta'
  | 'offensiveRebounds'
  | 'defensiveRebounds'
  | 'assists'
  | 'steals'
  | 'blocks'
  | 'turnovers'
  | 'personalFouls'
  | 'plusMinus'
  | 'totalRebounds'
  | 'effectiveFieldGoalPercentage'
  | 'trueShootingPercentage'
  | 'efficiency'
  | 'stocks'
  | 'defensivePlays'
  | 'pointsPer48'
  | 'assistsPer48'
  | 'blocksPer48'
  | 'stealsPer48'
  | 'reboundsPer48'

interface SortConfig {
  key: PlayerSortKey
  direction: SortDirection
}

function formatNumber(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—'
}

function formatMinutes(value: number) {
  const wholeMinutes = Math.floor(value)
  const seconds = Math.round((value - wholeMinutes) * 60)
  return `${wholeMinutes}:${String(seconds).padStart(2, '0')}`
}

function per48(stat: number, minutes: number) {
  if (!Number.isFinite(stat) || !Number.isFinite(minutes) || minutes <= 0) {
    return 0
  }

  return (stat * 48) / minutes
}

function playerSortValue(player: PlayerBoxScore, key: PlayerSortKey) {
  switch (key) {
    case 'name':
      return player.name.toLowerCase()
    case 'minutes':
      return player.minutes
    case 'points':
      return player.points
    case 'fgm':
      return player.fgm
    case 'fga':
      return player.fga
    case 'threePm':
      return player.threePm
    case 'threePa':
      return player.threePa
    case 'ftm':
      return player.ftm
    case 'fta':
      return player.fta
    case 'offensiveRebounds':
      return player.offensiveRebounds
    case 'defensiveRebounds':
      return player.defensiveRebounds
    case 'assists':
      return player.assists
    case 'steals':
      return player.steals
    case 'blocks':
      return player.blocks
    case 'turnovers':
      return player.turnovers
    case 'personalFouls':
      return player.personalFouls
    case 'plusMinus':
      return player.plusMinus
    case 'totalRebounds':
      return player.advanced.totalRebounds
    case 'effectiveFieldGoalPercentage':
      return player.advanced.effectiveFieldGoalPercentage
    case 'trueShootingPercentage':
      return player.advanced.trueShootingPercentage
    case 'efficiency':
      return player.advanced.efficiency
    case 'stocks':
      return player.advanced.stocks
    case 'defensivePlays':
      return player.advanced.defensivePlays
    case 'pointsPer48':
      return per48(player.points, player.minutes)
    case 'assistsPer48':
      return per48(player.assists, player.minutes)
    case 'blocksPer48':
      return per48(player.blocks, player.minutes)
    case 'stealsPer48':
      return per48(player.steals, player.minutes)
    case 'reboundsPer48':
      return per48(player.advanced.totalRebounds, player.minutes)
  }
}

function sortPlayers(team: TeamAnalysis, sortConfig: SortConfig) {
  const { key, direction } = sortConfig
  const directionFactor = direction === 'asc' ? 1 : -1

  return [...team.players].sort((left, right) => {
    const leftValue = playerSortValue(left, key)
    const rightValue = playerSortValue(right, key)

    if (typeof leftValue === 'string' && typeof rightValue === 'string') {
      const stringOrder = leftValue.localeCompare(rightValue)
      if (stringOrder !== 0) {
        return stringOrder * directionFactor
      }
    } else if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      const numericOrder = leftValue - rightValue
      if (numericOrder !== 0) {
        return numericOrder * directionFactor
      }
    }

    return left.name.localeCompare(right.name)
  })
}

function App() {
  const [uploadedHtml, setUploadedHtml] = useState('')
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(null)
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'minutes',
    direction: 'desc',
  })

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
  const sortedTeams = useMemo(
    () =>
      teams.map((team) => ({
        ...team,
        players: sortPlayers(team, sortConfig),
      })),
    [teams, sortConfig],
  )

  function toggleSort(nextKey: PlayerSortKey) {
    setSortConfig((current) => ({
      key: nextKey,
      direction: current.key === nextKey && current.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

  function sortIndicator(key: PlayerSortKey) {
    if (sortConfig.key !== key) {
      return ''
    }

    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓'
  }

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
            {sortedTeams.map((team) => (
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
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('name')}>
                            Player{sortIndicator('name')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('minutes')}>
                            MIN{sortIndicator('minutes')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('points')}>
                            PTS{sortIndicator('points')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('fgm')}>
                            FGM{sortIndicator('fgm')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('fga')}>
                            FGA{sortIndicator('fga')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('threePm')}>
                            3PM{sortIndicator('threePm')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('threePa')}>
                            3PA{sortIndicator('threePa')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('ftm')}>
                            FTM{sortIndicator('ftm')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('fta')}>
                            FTA{sortIndicator('fta')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('offensiveRebounds')}>
                            ORB{sortIndicator('offensiveRebounds')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('defensiveRebounds')}>
                            DRB{sortIndicator('defensiveRebounds')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('totalRebounds')}>
                            TRB{sortIndicator('totalRebounds')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('assists')}>
                            AST{sortIndicator('assists')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('steals')}>
                            STL{sortIndicator('steals')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('blocks')}>
                            BLK{sortIndicator('blocks')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('turnovers')}>
                            TO{sortIndicator('turnovers')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('personalFouls')}>
                            PF{sortIndicator('personalFouls')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('plusMinus')}>
                            +/{'-'}{sortIndicator('plusMinus')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button
                            type="button"
                            onClick={() => toggleSort('effectiveFieldGoalPercentage')}
                          >
                            eFG%{sortIndicator('effectiveFieldGoalPercentage')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('trueShootingPercentage')}>
                            TS%{sortIndicator('trueShootingPercentage')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('efficiency')}>
                            EFF{sortIndicator('efficiency')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('stocks')}>
                            Stocks{sortIndicator('stocks')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('defensivePlays')}>
                            Def plays{sortIndicator('defensivePlays')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('pointsPer48')}>
                            PTS/48{sortIndicator('pointsPer48')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('assistsPer48')}>
                            AST/48{sortIndicator('assistsPer48')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('blocksPer48')}>
                            BLK/48{sortIndicator('blocksPer48')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('stealsPer48')}>
                            STL/48{sortIndicator('stealsPer48')}
                          </button>
                        </th>
                        <th className="sortable-header">
                          <button type="button" onClick={() => toggleSort('reboundsPer48')}>
                            REB/48{sortIndicator('reboundsPer48')}
                          </button>
                        </th>
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
                          <td>{player.fgm}</td>
                          <td>{player.fga}</td>
                          <td>{player.threePm}</td>
                          <td>{player.threePa}</td>
                          <td>{player.ftm}</td>
                          <td>{player.fta}</td>
                          <td>{player.offensiveRebounds}</td>
                          <td>{player.defensiveRebounds}</td>
                          <td>{player.advanced.totalRebounds}</td>
                          <td>{player.assists}</td>
                          <td>{player.steals}</td>
                          <td>{player.blocks}</td>
                          <td>{player.turnovers}</td>
                          <td>{player.personalFouls}</td>
                          <td>{player.plusMinus >= 0 ? `+${player.plusMinus}` : player.plusMinus}</td>
                          <td>{formatNumber(player.advanced.effectiveFieldGoalPercentage, 1)}%</td>
                          <td>{formatNumber(player.advanced.trueShootingPercentage, 1)}%</td>
                          <td>{player.advanced.efficiency}</td>
                          <td>{player.advanced.stocks}</td>
                          <td>{player.advanced.defensivePlays}</td>
                          <td>{formatNumber(per48(player.points, player.minutes), 1)}</td>
                          <td>{formatNumber(per48(player.assists, player.minutes), 1)}</td>
                          <td>{formatNumber(per48(player.blocks, player.minutes), 1)}</td>
                          <td>{formatNumber(per48(player.steals, player.minutes), 1)}</td>
                          <td>{formatNumber(per48(player.advanced.totalRebounds, player.minutes), 1)}</td>
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
