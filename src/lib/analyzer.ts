import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import type {
  MatchAnalysis,
  ParsedMatch,
  ParsedPlay,
  PlayerBoxScore,
  RosterPlayer,
  TeamAdvancedMetrics,
  TeamAnalysis,
  TeamSide,
  TeamTotals,
} from './types.js'

const PASSER_PATTERNS = [
  /off of a nice pass from (\d+)/,
  /(\d+) gets off a great pass to/,
  /(\d+) opens up the play with a pass to/,
  /(\d+) threads a pass through the defense and finds/,
  /(\d+)\s+finds \d+ in space/,
]

const DEFENDER_PATTERNS = [
  /, guarded closely by (\d+)/,
  /as (\d+) rotates over and alters his shot/,
  / under pressure from (\d+)/,
  / with (\d+) right in his face/,
  / over (\d+)\./,
  / after (\d+) backed off slightly/,
]

const SHOT_EVENT_TYPES = new Set([
  'BASELINE_J',
  'CORNER_THREE',
  'DRIVING_LAYUP',
  'DUNK',
  'DUNK_MISSED',
  'ELBOW',
  'FALL_AWAY',
  'HALF_COURT_SHOT',
  'HOOK',
  'LAYUP',
  'PUTBACK',
  'SPINNY',
  'STRAIGHT_ON_THREE',
  'STRONG',
  'TIPBACK',
  'TIPBACKDUNK',
  'TOPKEY',
  'VERY_LONG',
  'WING',
  'WING_THREE',
])

const THREE_POINT_EVENT_TYPES = new Set([
  'CORNER_THREE',
  'HALF_COURT_SHOT',
  'STRAIGHT_ON_THREE',
  'VERY_LONG',
  'WING_THREE',
])

const FOUL_EVENT_TYPES = new Set(['NOSHOOT_FOUL', 'OFF_FOUL', 'SHOOTING_FOUL', 'TECHNICAL'])
const TURNOVER_EVENT_TYPES = new Set(['BAD_PASS', 'OFF_FOUL', 'THREE_SECOND', 'TRAVEL'])
const STEAL_EVENT_TYPES = new Set(['STEAL', 'STEAL_ON_PASS'])
const MATCH_PATH_PATTERN = /\/match\/(\d+)\/pbp\.aspx(?:[?#].*)?$/i
const PLAYER_PATH_PATTERN = /\/player\/(\d+)\/overview\.aspx(?:[?#].*)?$/i
const PLAY_TEXT_CONTAINER_SELECTOR = '#ctl00_cphContent_text, #cphContent_text'

function parseMatchId(action: string | undefined) {
  const match = action?.match(MATCH_PATH_PATTERN)
  if (!match) {
    throw new Error('Could not determine the match id from aspnetForm action.')
  }

  return match[1]
}

function parseTitle(titleText: string) {
  const match = titleText.match(/([^|@]+?)\s*@\s*([^|]+?)(?:\s*\||$)/)
  if (!match) {
    return {
      away: 'Away',
      home: 'Home',
      warning: 'Could not confidently parse team names from document title.',
    }
  }

  return {
    away: match[1].trim(),
    home: match[2].trim(),
  }
}

function parseScore(scoreText: string) {
  const match = scoreText.match(/(\d+)\s*[-–—]\s*(\d+)/)
  if (!match) {
    return { away: 0, home: 0 }
  }

  return { away: Number(match[1]), home: Number(match[2]) }
}

function parseClockToElapsedSeconds(quarter: number, clock: string) {
  const parts = clock.split(':').map(Number)
  if (parts.length !== 2 || parts.some(Number.isNaN)) {
    return quarter <= 4 ? (quarter - 1) * 720 : 2880 + (quarter - 5) * 300
  }

  const [minutes, seconds] = parts
  const remaining = minutes * 60 + seconds
  const periodLength = quarter <= 4 ? 720 : 300
  const regulationElapsed = quarter <= 4 ? (quarter - 1) * 720 : 2880 + (quarter - 5) * 300

  return regulationElapsed + (periodLength - remaining)
}

function zeroTotals(): TeamTotals {
  return {
    points: 0,
    fgm: 0,
    fga: 0,
    threePm: 0,
    threePa: 0,
    ftm: 0,
    fta: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    personalFouls: 0,
  }
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0
}

function possessions(stats: TeamTotals) {
  return stats.fga - stats.offensiveRebounds + stats.turnovers + 0.44 * stats.fta
}

function advancedMetrics(team: TeamTotals, opponent: TeamTotals): TeamAdvancedMetrics {
  const teamPossessions = possessions(team)
  const opponentPossessions = possessions(opponent)

  return {
    estimatedPossessions: teamPossessions,
    offensiveRating: teamPossessions > 0 ? (team.points / teamPossessions) * 100 : 0,
    defensiveRating:
      opponentPossessions > 0 ? (opponent.points / opponentPossessions) * 100 : 0,
    effectiveFieldGoalPercentage: percentage(team.fgm + 0.5 * team.threePm, team.fga),
    trueShootingPercentage: percentage(team.points, 2 * (team.fga + 0.44 * team.fta)),
  }
}

function findFirstMentionedPlayerId(play: ParsedPlay) {
  return play.playerMentions.find((player) => player.id)?.id ?? null
}

function findPasser(eventIdText: string) {
  for (const pattern of PASSER_PATTERNS) {
    const match = eventIdText.match(pattern)
    if (match) {
      return match[1]
    }
  }

  return null
}

function findDefender(eventIdText: string) {
  for (const pattern of DEFENDER_PATTERNS) {
    const match = eventIdText.match(pattern)
    if (match) {
      return match[1]
    }
  }

  return null
}

function findShooter(play: ParsedPlay, passerId: string | null, defenderId: string | null) {
  return (
    play.playerMentions.find(
      (player) => player.id !== passerId && player.id !== defenderId,
    )?.id ?? findFirstMentionedPlayerId(play)
  )
}

function extractPlayerIdFromHref(href: string) {
  return href.match(PLAYER_PATH_PATTERN)?.[1] ?? null
}

function collectPlayerAnchorElements(
  $: cheerio.CheerioAPI,
  elements: cheerio.Cheerio<AnyNode>,
) {
  return elements
    .toArray()
    .filter((element) => extractPlayerIdFromHref($(element).attr('href') ?? '') !== null)
}

function playerTeamSide(players: Map<string, PlayerBoxScore>, playerId: string | null): TeamSide | null {
  if (!playerId) {
    return null
  }

  return players.get(playerId)?.teamSide ?? null
}

function applyPlusMinus(lineups: Record<TeamSide, Set<string>>, players: Map<string, PlayerBoxScore>, awayDelta: number, homeDelta: number) {
  const marginDelta = awayDelta - homeDelta

  for (const playerId of lineups.away) {
    const player = players.get(playerId)
    if (player) {
      player.plusMinus += marginDelta
    }
  }

  for (const playerId of lineups.home) {
    const player = players.get(playerId)
    if (player) {
      player.plusMinus -= marginDelta
    }
  }
}

function addMinutes(lineup: Set<string>, players: Map<string, PlayerBoxScore>, seconds: number) {
  const minutes = seconds / 60

  for (const playerId of lineup) {
    const player = players.get(playerId)
    if (player) {
      player.minutes += minutes
    }
  }
}

export function parseMatchHtml(html: string): ParsedMatch {
  const $ = cheerio.load(html)
  const warnings: string[] = []
  const formAction =
    $('#aspnetForm').attr('action') ??
    $('#form1').attr('action') ??
    $('form[action*="/match/"][action*="/pbp.aspx"]').first().attr('action')
  const matchId = parseMatchId(formAction)

  const title = parseTitle($('title').text().trim())
  if ('warning' in title && title.warning) {
    warnings.push(title.warning)
  }

  const allRosterAnchors = collectPlayerAnchorElements(
    $,
    $('#cbPbp').find('a[href*="/player/"]'),
  )
    .filter((element) => $(element).closest(PLAY_TEXT_CONTAINER_SELECTOR).length === 0)

  const uniqueRosterPlayers = new Map<string, string>()
  for (const element of allRosterAnchors) {
    const href = $(element).attr('href') ?? ''
    const playerId = extractPlayerIdFromHref(href)
    if (!playerId) {
      continue
    }

    if (!uniqueRosterPlayers.has(playerId)) {
      uniqueRosterPlayers.set(playerId, $(element).text().trim())
    }
  }

  if (uniqueRosterPlayers.size < 10 || uniqueRosterPlayers.size % 2 !== 0) {
    throw new Error(
      'Could not find the expected roster anchors under #cbPbp. The page may be missing lineup data or require authentication.',
    )
  }

  const rosterPlayers = Array.from(uniqueRosterPlayers.entries()).map(([id, name]) => ({ id, name }))
  const halfway = rosterPlayers.length / 2
  const awayPlayers = rosterPlayers.slice(0, halfway).map<RosterPlayer>((player, index) => ({
    ...player,
    teamSide: 'away',
    isStarter: index < 5,
  }))
  const homePlayers = rosterPlayers.slice(halfway).map<RosterPlayer>((player, index) => ({
    ...player,
    teamSide: 'home',
    isStarter: index < 5,
  }))

  const playRows = $(PLAY_TEXT_CONTAINER_SELECTOR)
    .find('table')
    .first()
    .find('tr[class]')
    .toArray()

  if (playRows.length === 0) {
    throw new Error(
      'Could not find play-by-play rows inside the expected play-by-play container. BuzzerBeater may require login or Supporter access for this match.',
    )
  }

  const plays = playRows
    .map<ParsedPlay | null>((row, index) => {
      const cells = $(row).find('td').toArray()
      if (cells.length < 4) {
        warnings.push(`Skipped malformed row ${index + 1}.`)
        return null
      }

      const eventCell = $(cells[3]).clone()
      const playerMentions = collectPlayerAnchorElements($, eventCell.find('a[href*="/player/"]'))
        .map((element) => {
          const id = extractPlayerIdFromHref($(element).attr('href') ?? '')
          return id ? { id, name: $(element).text().trim() } : null
        })
        .filter((value): value is { id: string; name: string } => Boolean(value))

      collectPlayerAnchorElements($, eventCell.find('a[href*="/player/"]')).forEach((element) => {
        const playerId = extractPlayerIdFromHref($(element).attr('href') ?? '')
        if (playerId) {
          $(element).text(playerId)
        }
      })

      const score = parseScore($(cells[2]).text().trim())

      return {
        index,
        eventType: ($(row).attr('class') ?? '').trim().split(/\s+/)[0],
        quarter: Number($(cells[0]).text().trim()),
        clock: $(cells[1]).text().trim(),
        scoreAway: score.away,
        scoreHome: score.home,
        eventText: $(cells[3]).text().replace(/\s+/g, ' ').trim(),
        eventIdText: eventCell.text().replace(/\s+/g, ' ').trim(),
        playerMentions,
      }
    })
    .filter((play): play is ParsedPlay => Boolean(play))

  return {
    matchId,
    teams: {
      away: { name: title.away, players: awayPlayers },
      home: { name: title.home, players: homePlayers },
    },
    plays,
    warnings,
  }
}

export function analyzeParsedMatch(parsed: ParsedMatch): MatchAnalysis {
  const players = new Map<string, PlayerBoxScore>()
  const lineups: Record<TeamSide, Set<string>> = { away: new Set(), home: new Set() }

  for (const rosterPlayer of [...parsed.teams.away.players, ...parsed.teams.home.players]) {
    players.set(rosterPlayer.id, {
      id: rosterPlayer.id,
      name: rosterPlayer.name,
      teamSide: rosterPlayer.teamSide,
      isStarter: rosterPlayer.isStarter,
      minutes: 0,
      points: 0,
      fgm: 0,
      fga: 0,
      threePm: 0,
      threePa: 0,
      ftm: 0,
      fta: 0,
      offensiveRebounds: 0,
      defensiveRebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      personalFouls: 0,
      plusMinus: 0,
    })

    if (rosterPlayer.isStarter) {
      lineups[rosterPlayer.teamSide].add(rosterPlayer.id)
    }
  }

  let previousElapsed = 0
  let previousScoreAway = 0
  let previousScoreHome = 0
  let previousMissedShotTeam: TeamSide | null = null
  const explicitAssistRows = parsed.plays.some((play) => play.eventType === 'ASSIST')

  for (const play of parsed.plays) {
    const elapsed = parseClockToElapsedSeconds(play.quarter, play.clock)
    const deltaSeconds = Math.max(elapsed - previousElapsed, 0)
    addMinutes(lineups.away, players, deltaSeconds)
    addMinutes(lineups.home, players, deltaSeconds)
    previousElapsed = elapsed

    const awayDelta = Math.max(play.scoreAway - previousScoreAway, 0)
    const homeDelta = Math.max(play.scoreHome - previousScoreHome, 0)
    if (awayDelta !== 0 || homeDelta !== 0) {
      applyPlusMinus(lineups, players, awayDelta, homeDelta)
    }
    previousScoreAway = play.scoreAway
    previousScoreHome = play.scoreHome

    if (SHOT_EVENT_TYPES.has(play.eventType)) {
      const passerId = findPasser(play.eventIdText)
      const defenderId = findDefender(play.eventIdText)
      const shooterId = findShooter(play, passerId, defenderId)
      const shooter = shooterId ? players.get(shooterId) : undefined

      if (shooter) {
        shooter.fga += 1
        const isThree = THREE_POINT_EVENT_TYPES.has(play.eventType)
        if (isThree) {
          shooter.threePa += 1
        }

        if (/Scored|Goaltending called/i.test(play.eventIdText)) {
          shooter.fgm += 1
          shooter.points += isThree ? 3 : 2
          if (isThree) {
            shooter.threePm += 1
          }

          if (!explicitAssistRows && passerId) {
            const assister = players.get(passerId)
            if (assister && assister.teamSide === shooter.teamSide) {
              assister.assists += 1
            }
          }
          previousMissedShotTeam = null
        } else {
          previousMissedShotTeam = shooter.teamSide
          if (/Shot blocked/i.test(play.eventIdText) && defenderId) {
            const blocker = players.get(defenderId)
            if (blocker) {
              blocker.blocks += 1
            }
          }
        }
      } else {
        parsed.warnings.push(`Could not identify a shooter for play ${play.index + 1}.`)
      }
      continue
    }

    if (play.eventType === 'ASSIST') {
      const assisterId = findFirstMentionedPlayerId(play)
      const assister = assisterId ? players.get(assisterId) : undefined
      if (assister) {
        assister.assists += 1
      }
      continue
    }

    if (play.eventType === 'FREE_THROW_MADE' || play.eventType === 'FREE_THROW_MISSED') {
      const shooterId = findFirstMentionedPlayerId(play)
      const shooter = shooterId ? players.get(shooterId) : undefined

      if (shooter) {
        shooter.fta += 1
        if (play.eventType === 'FREE_THROW_MADE') {
          shooter.ftm += 1
          shooter.points += 1
          previousMissedShotTeam = null
        } else {
          previousMissedShotTeam = shooter.teamSide
        }
      }
      continue
    }

    if (play.eventType === 'REBOUND') {
      const rebounderId = findFirstMentionedPlayerId(play)
      const rebounder = rebounderId ? players.get(rebounderId) : undefined

      if (rebounder) {
        if (previousMissedShotTeam && rebounder.teamSide === previousMissedShotTeam) {
          rebounder.offensiveRebounds += 1
        } else {
          rebounder.defensiveRebounds += 1
        }
      }
      previousMissedShotTeam = null
      continue
    }

    if (FOUL_EVENT_TYPES.has(play.eventType)) {
      const foulerId = findFirstMentionedPlayerId(play)
      const fouler = foulerId ? players.get(foulerId) : undefined
      if (fouler) {
        fouler.personalFouls += 1
      }
    }

    if (TURNOVER_EVENT_TYPES.has(play.eventType)) {
      const turnoverId = findFirstMentionedPlayerId(play)
      const turnoverPlayer = turnoverId ? players.get(turnoverId) : undefined
      if (turnoverPlayer) {
        turnoverPlayer.turnovers += 1
      }
      previousMissedShotTeam = null
    }

    if (STEAL_EVENT_TYPES.has(play.eventType)) {
      const stealerId = findFirstMentionedPlayerId(play)
      const stealer = stealerId ? players.get(stealerId) : undefined
      if (stealer) {
        stealer.steals += 1
      }
      continue
    }

    if (play.eventType === 'SUBSTITUTION' || play.eventType === 'SUBSTITUTION_SWAP') {
      const [incomingId, outgoingId] = play.playerMentions.map((player) => player.id)
      const substitutionSideMatch = play.eventText.match(/\(([AH])\)/i)
      const substitutionSide =
        substitutionSideMatch?.[1].toUpperCase() === 'H' ? 'home' : substitutionSideMatch
          ? 'away'
          : playerTeamSide(players, outgoingId ?? incomingId)

      if (incomingId && substitutionSide) {
        lineups[substitutionSide].add(incomingId)
      }
      if (outgoingId && substitutionSide) {
        lineups[substitutionSide].delete(outgoingId)
      }
      continue
    }
  }

  const maxQuarter = Math.max(...parsed.plays.map((play) => play.quarter))
  const gameLength =
    maxQuarter <= 4 ? maxQuarter * 720 : 2880 + (maxQuarter - 4) * 300
  const trailingSeconds = Math.max(gameLength - previousElapsed, 0)
  addMinutes(lineups.away, players, trailingSeconds)
  addMinutes(lineups.home, players, trailingSeconds)

  const awayTotals = zeroTotals()
  const homeTotals = zeroTotals()

  const playersByTeam = {
    away: Array.from(players.values())
      .filter((player) => player.teamSide === 'away')
      .sort((left, right) => Number(right.isStarter) - Number(left.isStarter) || right.minutes - left.minutes || left.name.localeCompare(right.name)),
    home: Array.from(players.values())
      .filter((player) => player.teamSide === 'home')
      .sort((left, right) => Number(right.isStarter) - Number(left.isStarter) || right.minutes - left.minutes || left.name.localeCompare(right.name)),
  }

  for (const player of playersByTeam.away) {
    awayTotals.points += player.points
    awayTotals.fgm += player.fgm
    awayTotals.fga += player.fga
    awayTotals.threePm += player.threePm
    awayTotals.threePa += player.threePa
    awayTotals.ftm += player.ftm
    awayTotals.fta += player.fta
    awayTotals.offensiveRebounds += player.offensiveRebounds
    awayTotals.defensiveRebounds += player.defensiveRebounds
    awayTotals.assists += player.assists
    awayTotals.steals += player.steals
    awayTotals.blocks += player.blocks
    awayTotals.turnovers += player.turnovers
    awayTotals.personalFouls += player.personalFouls
  }

  for (const player of playersByTeam.home) {
    homeTotals.points += player.points
    homeTotals.fgm += player.fgm
    homeTotals.fga += player.fga
    homeTotals.threePm += player.threePm
    homeTotals.threePa += player.threePa
    homeTotals.ftm += player.ftm
    homeTotals.fta += player.fta
    homeTotals.offensiveRebounds += player.offensiveRebounds
    homeTotals.defensiveRebounds += player.defensiveRebounds
    homeTotals.assists += player.assists
    homeTotals.steals += player.steals
    homeTotals.blocks += player.blocks
    homeTotals.turnovers += player.turnovers
    homeTotals.personalFouls += player.personalFouls
  }

  const teams: TeamAnalysis[] = [
    {
      side: 'away',
      name: parsed.teams.away.name,
      stats: awayTotals,
      advanced: advancedMetrics(awayTotals, homeTotals),
      players: playersByTeam.away,
    },
    {
      side: 'home',
      name: parsed.teams.home.name,
      stats: homeTotals,
      advanced: advancedMetrics(homeTotals, awayTotals),
      players: playersByTeam.home,
    },
  ]

  return {
    summary: {
      matchId: parsed.matchId,
      awayTeam: { name: parsed.teams.away.name, points: awayTotals.points },
      homeTeam: { name: parsed.teams.home.name, points: homeTotals.points },
      periods: maxQuarter,
      totalPlays: parsed.plays.length,
      fetchMode: 'Server-side fetch through the Node API because browser CORS cannot be relied on.',
      parserEvidence:
        'Parses the match form action, #cbPbp roster anchors, and the play-by-play table rows based on observed BuzzerBeater structure.',
      warnings: parsed.warnings,
    },
    teams,
  }
}

export function analyzeMatchHtml(html: string) {
  return analyzeParsedMatch(parseMatchHtml(html))
}
