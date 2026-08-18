import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyzeMatchHtml, parseMatchHtml } from '../src/lib/analyzer'

const fixture = readFileSync(join(process.cwd(), 'tests/fixtures/sample-pbp.html'), 'utf8')
const savedFixture = readFileSync(join(process.cwd(), 'Example_match_html.html'), 'utf8')

describe('parseMatchHtml', () => {
  it('parses the real observed ASP.NET containers and table rows', () => {
    const parsed = parseMatchHtml(fixture)

    expect(parsed.matchId).toBe('140140858')
    expect(parsed.teams.away.name).toBe('Sample Away')
    expect(parsed.teams.home.name).toBe('Sample Home')
    expect(parsed.teams.away.players).toHaveLength(6)
    expect(parsed.teams.home.players).toHaveLength(6)
    expect(parsed.plays[0]?.eventType).toBe('JUMP_BALL')
    expect(parsed.plays[3]?.eventIdText).toContain('1001 gets off a great pass to 1002')
  })

  it('accepts saved-match HTML with absolute urls, query strings, and en-dash scores', () => {
    const savedMatchHtml = fixture
      .replace(
        'action="/match/140140858/pbp.aspx"',
        'action="https://www.buzzerbeater.com/match/140140858/pbp.aspx?save=1"',
      )
      .replaceAll(
        'href="/player/',
        'href="https://www.buzzerbeater.com/player/',
      )
      .replaceAll('/overview.aspx"', '/overview.aspx?tab=boxscore"')
      .replaceAll(' - ', ' – ')

    const parsed = parseMatchHtml(savedMatchHtml)

    expect(parsed.matchId).toBe('140140858')
    expect(parsed.teams.away.players[0]).toMatchObject({ id: '1001', name: 'Away Starter 1' })
    expect(parsed.teams.home.players[0]).toMatchObject({ id: '2001', name: 'Home Starter 1' })
    expect(parsed.plays[4]).toMatchObject({
      eventType: 'STRAIGHT_ON_THREE',
      scoreAway: 2,
      scoreHome: 3,
    })
  })

  it('accepts the repository example HTML saved with form1 and cphContent_text ids', () => {
    const parsed = parseMatchHtml(savedFixture)

    expect(parsed.matchId).toBe('140140858')
    expect(parsed.teams.away.name).toBe('Analityczne Dinozaury')
    expect(parsed.teams.home.name).toBe('Zakanał United')
    expect(parsed.teams.away.players.length).toBeGreaterThanOrEqual(5)
    expect(parsed.teams.home.players.length).toBeGreaterThanOrEqual(5)
    expect(parsed.plays[0]?.eventType).toBe('JUMP_BALL')
  })
})

describe('analyzeMatchHtml', () => {
  it('calculates core box-score and advanced metrics deterministically', () => {
    const analysis = analyzeMatchHtml(fixture)
    const away = analysis.teams.find((team) => team.side === 'away')
    const home = analysis.teams.find((team) => team.side === 'home')

    expect(analysis.summary.awayTeam.points).toBe(4)
    expect(analysis.summary.homeTeam.points).toBe(7)

    expect(away?.stats).toMatchObject({
      points: 4,
      fgm: 2,
      fga: 3,
      threePm: 0,
      threePa: 0,
      ftm: 0,
      fta: 0,
      offensiveRebounds: 1,
      defensiveRebounds: 1,
      assists: 1,
      steals: 0,
      blocks: 1,
      turnovers: 1,
      personalFouls: 1,
    })

    expect(home?.stats).toMatchObject({
      points: 7,
      fgm: 2,
      fga: 3,
      threePm: 2,
      threePa: 2,
      ftm: 1,
      fta: 2,
      offensiveRebounds: 1,
      defensiveRebounds: 0,
      assists: 0,
      steals: 1,
      blocks: 0,
      turnovers: 1,
      personalFouls: 1,
    })

    expect(away?.players.find((player) => player.id === '1005')?.minutes).toBeCloseTo(4, 5)
    expect(away?.players.find((player) => player.id === '1006')?.minutes).toBeCloseTo(8, 5)
    expect(away?.players.find((player) => player.id === '1005')?.plusMinus).toBe(-3)
    expect(away?.players.find((player) => player.id === '1006')?.plusMinus).toBe(0)
    expect(home?.players.find((player) => player.id === '2001')?.plusMinus).toBe(3)
    expect(away?.players.find((player) => player.id === '1002')?.advanced).toMatchObject({
      totalRebounds: 1,
      effectiveFieldGoalPercentage: 100,
      trueShootingPercentage: 100,
      efficiency: 3,
      stocks: 0,
      defensivePlays: 1,
    })
    expect(home?.players.find((player) => player.id === '2001')?.advanced).toMatchObject({
      totalRebounds: 0,
      effectiveFieldGoalPercentage: 150,
      trueShootingPercentage: 150,
      efficiency: 3,
      stocks: 1,
      defensivePlays: 1,
    })
    expect(away?.advanced.estimatedPossessions).toBeCloseTo(3, 5)
    expect(home?.advanced.estimatedPossessions).toBeCloseTo(3.88, 5)
    expect(home?.advanced.effectiveFieldGoalPercentage).toBeCloseTo(100, 5)
  })
})
