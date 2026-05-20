import type { AllocatedTeam, TeamColor } from "./allocator";

/** A single round's outcome: which two teams played, and who won (or tie). */
export type Outcome = TeamColor | "tie";

export interface MatchResult {
  /** 1-indexed round number. */
  round: number;
  teams: [TeamColor, TeamColor];
  outcome: Outcome;
}

export interface TeamStanding {
  color: TeamColor;
  label: string;
  wins: number;
  ties: number;
  losses: number;
  points: number;
  /** Number of matches played, useful for "spillere har spilt N kamper". */
  played: number;
}

/**
 * Order in which teams take turns sitting on the bench, derived once when
 * teams are allocated. The smallest team is first (so it rests round 1, per
 * the user's rule). For 2-team mode this returns just [smallest, other],
 * but no rotation is needed there since both play every round.
 *
 * Ties on size are broken by `TEAM_COLORS` order (red, yellow, blue).
 */
export function rotationOrder(teams: AllocatedTeam[]): TeamColor[] {
  // Sorting is stable in modern JS engines, so equal-size teams keep their
  // original (TEAM_COLORS) ordering — that's our deterministic tiebreak.
  return [...teams]
    .sort((a, b) => a.players.length - b.players.length)
    .map((t) => t.color);
}

/**
 * Look up which 2 teams play the given round (1-indexed) and which sits.
 *
 * 3-team mode: bench cycles through the rotation order. With order
 * [smallest, X, Y], round 1 benches `smallest`, round 2 benches X, round 3
 * benches Y, then it repeats. This makes each team play 2 of every 3 rounds.
 *
 * 2-team mode: both teams play, no bench.
 */
export function matchForRound(
  teams: AllocatedTeam[],
  round: number
): { playing: [TeamColor, TeamColor]; bench: TeamColor | null } {
  if (teams.length === 2) {
    return {
      playing: [teams[0].color, teams[1].color],
      bench: null,
    };
  }
  const order = rotationOrder(teams);
  const benchIdx = (round - 1) % order.length;
  const bench = order[benchIdx];
  const playing = order.filter((c) => c !== bench) as [TeamColor, TeamColor];
  return { playing, bench };
}

/** Convenience helper: just the 2 teams playing the given round. */
export function playingForRound(
  teams: AllocatedTeam[],
  round: number
): [TeamColor, TeamColor] {
  return matchForRound(teams, round).playing;
}

/**
 * Aggregate match results into per-team standings, sorted by points
 * descending, then wins descending, then by team label (for stable display).
 *
 * 3 points for a win, 1 for a tie, 0 for a loss.
 */
export function computeStandings(
  teams: AllocatedTeam[],
  matches: MatchResult[]
): TeamStanding[] {
  const standings = new Map<TeamColor, TeamStanding>();
  for (const t of teams) {
    standings.set(t.color, {
      color: t.color,
      label: t.label,
      wins: 0,
      ties: 0,
      losses: 0,
      points: 0,
      played: 0,
    });
  }
  for (const m of matches) {
    const a = standings.get(m.teams[0]);
    const b = standings.get(m.teams[1]);
    if (!a || !b) continue;
    a.played++;
    b.played++;
    if (m.outcome === "tie") {
      a.ties++;
      b.ties++;
      a.points += 1;
      b.points += 1;
    } else if (m.outcome === m.teams[0]) {
      a.wins++;
      a.points += 3;
      b.losses++;
    } else if (m.outcome === m.teams[1]) {
      b.wins++;
      b.points += 3;
      a.losses++;
    }
  }
  return [...standings.values()].sort(
    (x, y) =>
      y.points - x.points ||
      y.wins - x.wins ||
      x.label.localeCompare(y.label, "no")
  );
}

const NORWEGIAN_LABEL: Record<TeamColor | "tie", string> = {
  red: "Røde lag",
  yellow: "Gule lag",
  blue: "Blå lag",
  tie: "Uavgjort",
};

/** Pick the right Norwegian label for a team colour, falling back to a
 * stable label if a custom one wasn't supplied. */
export function teamLabel(
  teams: AllocatedTeam[],
  color: TeamColor
): string {
  return teams.find((t) => t.color === color)?.label ?? NORWEGIAN_LABEL[color];
}
