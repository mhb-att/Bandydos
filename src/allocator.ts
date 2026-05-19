import type { Player } from "./roster";

export type VestColor = "white" | "blue" | "red" | "yellow";
export type TeamColor = "red" | "yellow" | "blue";

export interface PresentPlayer extends Player {
  vest: VestColor;
}

export interface AllocatedTeam {
  color: TeamColor;
  label: string;
  players: PresentPlayer[];
  totalSkill: number;
}

const TEAM_COLORS: TeamColor[] = ["red", "yellow", "blue"];

const TEAM_LABEL: Record<TeamColor, string> = {
  red: "Røde lag",
  yellow: "Gule lag",
  blue: "Blå lag",
};

/**
 * Hard rule: nobody can take off the colour they're already wearing. The only
 * allowed change is putting on or replacing it with a red or yellow vest.
 *
 * Concretely:
 * - Red-vest player  -> red or yellow team only (NEVER blue / no-vest).
 * - Yellow-vest player -> red or yellow team only.
 * - White / blue clothes -> any team (they either keep their clothes for the
 *   no-vest "blue" team, or put a red/yellow vest on top).
 */
export function canAssign(vest: VestColor, team: TeamColor): boolean {
  if (vest === "red" || vest === "yellow") {
    return team !== "blue";
  }
  return true;
}

/**
 * How well a player's current vest matches a candidate team color. Used as a
 * soft preference; the hard `canAssign` rule is enforced separately so this
 * function only nudges the algorithm towards "no change needed" placements.
 *
 * Note that blue-on-no-vest is preferred over white-on-no-vest: a blue player
 * landing on the no-vest team gets to keep their distinctive blue clothes,
 * which is what makes that team visually identifiable.
 */
function colorAffinity(vest: VestColor, team: TeamColor): number {
  // Exact match - no change at all required (blue-on-blue, red-on-red,
  // yellow-on-yellow). Highest preference.
  if (vest === team) return 10;
  // White-clothes player on the no-vest team: also no change, but white is
  // less distinctive than blue so we slightly prefer giving those spots to
  // blue-wearing players when possible.
  if (vest === "white" && team === "blue") return 5;
  // Otherwise some change is required (put on or replace vest).
  return 0;
}

interface Assignment {
  // index = team index (0,1,2); value = list of players
  teams: PresentPlayer[][];
}

function totalSkill(team: PresentPlayer[]): number {
  return team.reduce((s, p) => s + p.skill, 0);
}

function score(a: Assignment): number {
  // Lower = better. Components are weighted so skill balance dominates; size
  // balance comes next; "weakest player" spreading and colour affinity act as
  // tiebreakers.
  //
  //  - Skill spread   ×100  (each unit ≈ 1 total skill point of imbalance)
  //  - Size spread    × 80
  //  - Skill-1 spread × 30  (clump of weak players on a single team)
  //  - Affinity       × −2  (max single-player swing is 10 points → −20)
  //  - Illegal        ×10000 (defensive; never produced by construction)
  //
  // Weights are intentionally lexicographic: a single point of total-skill
  // imbalance (100) can never be justified by any gain in size, skill-1
  // spread, or colour affinity. So colour preference / weak-player spread
  // only steer among solutions that are already skill-balanced.
  const skills = a.teams.map(totalSkill);
  const sizes = a.teams.map((t) => t.length);
  const skillSpread = Math.max(...skills) - Math.min(...skills);
  const sizeSpread = Math.max(...sizes) - Math.min(...sizes);

  // Count of skill-1 ("weakest") players per team. We prefer to spread them
  // out so no team is stuck with two or three weak players. With our roster
  // there are at most 3 skill-1s, so the ideal spread is 1-1-1 → 0.
  const weakCounts = a.teams.map(
    (t) => t.filter((p) => p.skill === 1).length
  );
  const weakSpread = Math.max(...weakCounts) - Math.min(...weakCounts);

  let illegal = 0;
  let affinity = 0;
  for (let i = 0; i < a.teams.length; i++) {
    const teamColor = TEAM_COLORS[i];
    for (const p of a.teams[i]) {
      if (!canAssign(p.vest, teamColor)) illegal++;
      affinity += colorAffinity(p.vest, teamColor);
    }
  }

  return (
    illegal * 10000 +
    skillSpread * 100 +
    sizeSpread * 80 +
    weakSpread * 30 -
    affinity * 2
  );
}

function clone(a: Assignment): Assignment {
  return { teams: a.teams.map((t) => [...t]) };
}

function targetSizes(n: number): number[] {
  const base = Math.floor(n / 3);
  const remainder = n - base * 3;
  const sizes = [base, base, base];
  for (let i = 0; i < remainder; i++) sizes[i]++;
  return sizes;
}

/**
 * Initial seed: greedy by descending skill, placing each player on the legal
 * team that is currently cheapest (lowest skill, smallest over-target size).
 *
 * This always respects `canAssign` so the seed is feasible.
 */
function greedySeed(players: PresentPlayer[]): Assignment {
  const sorted = [...players].sort((a, b) => b.skill - a.skill);
  const teams: PresentPlayer[][] = [[], [], []];
  const sizes = targetSizes(sorted.length);

  for (const p of sorted) {
    let bestIdx = -1;
    let bestCost = Infinity;
    for (let i = 0; i < 3; i++) {
      if (!canAssign(p.vest, TEAM_COLORS[i])) continue;
      const sizeOverTarget = Math.max(0, teams[i].length + 1 - sizes[i]);
      const cost = totalSkill(teams[i]) + sizeOverTarget * 50;
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) {
      // Should be unreachable, but place on first legal team if it ever is.
      bestIdx = TEAM_COLORS.findIndex((c) => canAssign(p.vest, c));
      if (bestIdx < 0) bestIdx = 0; // last-resort fallback
    }
    teams[bestIdx].push(p);
  }
  return { teams };
}

/**
 * Optimise an assignment by repeatedly trying random swaps/moves and keeping
 * the change if the score improves. Illegal swaps (those that would violate
 * `canAssign`) are skipped outright so we never explore infeasible space.
 */
function refine(start: Assignment, iterations = 4000): Assignment {
  let best = clone(start);
  let bestScore = score(best);
  let cur = clone(best);
  let curScore = bestScore;

  const sizes = targetSizes(cur.teams.flat().length);

  for (let i = 0; i < iterations; i++) {
    const a = Math.floor(Math.random() * 3);
    let b = Math.floor(Math.random() * 3);
    if (b === a) b = (b + 1) % 3;

    if (cur.teams[a].length === 0 || cur.teams[b].length === 0) continue;

    const doMove =
      Math.random() < 0.3 &&
      cur.teams[a].length > sizes[a] &&
      cur.teams[b].length < sizes[b];

    const ai = Math.floor(Math.random() * cur.teams[a].length);
    const bi = Math.floor(Math.random() * cur.teams[b].length);

    const playerA = cur.teams[a][ai];
    const playerB = cur.teams[b][bi];
    const teamColorA = TEAM_COLORS[a];
    const teamColorB = TEAM_COLORS[b];

    // Hard constraint check: only permit moves/swaps that keep everyone on a
    // team they're allowed to be on.
    if (doMove) {
      if (!canAssign(playerA.vest, teamColorB)) continue;
    } else {
      if (
        !canAssign(playerA.vest, teamColorB) ||
        !canAssign(playerB.vest, teamColorA)
      ) {
        continue;
      }
    }

    if (doMove) {
      cur.teams[a].splice(ai, 1);
      cur.teams[b].push(playerA);
    } else {
      cur.teams[a][ai] = playerB;
      cur.teams[b][bi] = playerA;
    }

    const newScore = score(cur);
    if (newScore < curScore || (newScore === curScore && Math.random() < 0.15)) {
      curScore = newScore;
      if (newScore < bestScore) {
        best = clone(cur);
        bestScore = newScore;
      }
    } else {
      if (doMove) {
        const last = cur.teams[b].pop()!;
        cur.teams[a].splice(ai, 0, last);
      } else {
        cur.teams[a][ai] = playerA;
        cur.teams[b][bi] = playerB;
      }
    }
  }
  return best;
}

function buildResult(a: Assignment): AllocatedTeam[] {
  return a.teams.map((players, i) => ({
    color: TEAM_COLORS[i],
    label: TEAM_LABEL[TEAM_COLORS[i]],
    players: [...players].sort((p, q) => p.name.localeCompare(q.name, "no")),
    totalSkill: totalSkill(players),
  }));
}

/**
 * Try multiple random seeds (greedy start + a few shuffled starts) and keep
 * the best. Re-rolling the same input set still produces some variation so
 * the user can ask for an alternative split.
 */
export function allocateTeams(players: PresentPlayer[]): AllocatedTeam[] {
  if (players.length === 0) {
    return TEAM_COLORS.map((c) => ({
      color: c,
      label: TEAM_LABEL[c],
      players: [],
      totalSkill: 0,
    }));
  }

  let best = refine(greedySeed(players));
  let bestScore = score(best);

  for (let attempt = 0; attempt < 6; attempt++) {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const candidate = refine(greedySeed(shuffled));
    const sc = score(candidate);
    if (sc < bestScore) {
      best = candidate;
      bestScore = sc;
    }
  }

  return buildResult(best);
}
