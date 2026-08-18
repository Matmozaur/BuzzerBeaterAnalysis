export type TeamSide = 'away' | 'home'

export interface RosterPlayer {
  id: string
  name: string
  teamSide: TeamSide
  isStarter: boolean
}

export interface ParsedPlay {
  index: number
  eventType: string
  quarter: number
  clock: string
  scoreAway: number
  scoreHome: number
  eventText: string
  eventIdText: string
  playerMentions: Array<{ id: string; name: string }>
}

export interface PlayerBoxScore {
  id: string
  name: string
  teamSide: TeamSide
  isStarter: boolean
  minutes: number
  points: number
  fgm: number
  fga: number
  threePm: number
  threePa: number
  ftm: number
  fta: number
  offensiveRebounds: number
  defensiveRebounds: number
  assists: number
  steals: number
  blocks: number
  turnovers: number
  personalFouls: number
  plusMinus: number
  advanced: PlayerAdvancedMetrics
}

export interface PlayerAdvancedMetrics {
  totalRebounds: number
  effectiveFieldGoalPercentage: number
  trueShootingPercentage: number
  efficiency: number
  stocks: number
  defensivePlays: number
}

export interface TeamTotals {
  points: number
  fgm: number
  fga: number
  threePm: number
  threePa: number
  ftm: number
  fta: number
  offensiveRebounds: number
  defensiveRebounds: number
  assists: number
  steals: number
  blocks: number
  turnovers: number
  personalFouls: number
}

export interface TeamAdvancedMetrics {
  estimatedPossessions: number
  offensiveRating: number
  defensiveRating: number
  effectiveFieldGoalPercentage: number
  trueShootingPercentage: number
}

export interface TeamAnalysis {
  side: TeamSide
  name: string
  stats: TeamTotals
  advanced: TeamAdvancedMetrics
  players: PlayerBoxScore[]
}

export interface MatchSummary {
  matchId: string
  awayTeam: { name: string; points: number }
  homeTeam: { name: string; points: number }
  periods: number
  totalPlays: number
  fetchMode: string
  parserEvidence: string
  warnings: string[]
}

export interface MatchAnalysis {
  summary: MatchSummary
  teams: TeamAnalysis[]
}

export interface ParsedMatch {
  matchId: string
  teams: Record<TeamSide, { name: string; players: RosterPlayer[] }>
  plays: ParsedPlay[]
  warnings: string[]
}
