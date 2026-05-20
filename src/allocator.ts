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
  red: "Rødt lag",
  yellow: "Gult lag",
  blue: "Blått lag",
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
  // Lower = better. The fundamental insight is that **per-level distribution
  // matters more than abstract sum-of-skill-levels**: a team with three
  // skill-3s and one skill-1 is dominant even if the total skill happens to
  // match the other team's. So we treat the spread of skill-1 and skill-3
  // players as first-class concerns, weighted higher than the total-skill
  // imbalance.
  //
  //  - Strong (skill-3) spread ×100  (≥2 strong players on one team is bad)
  //  - Weak (skill-1) spread   ×100  (clumped weak players is bad)
  //  - Size spread             × 80  (uneven team sizes are bad)
  //  - Total skill spread      × 30  (tiebreaker after distribution)
  //  - Affinity                × −2  (max single-player swing 10 → −20)
  //  - Illegal                 ×10000 (defensive; never produced)
  //
  // With these weights, the algorithm will accept up to ~3 points of total
  // skill imbalance (3 × 30 = 90) to fix a 1-unit skill-1 or skill-3 spread
  // (gain 100). With 4 skill-3 players across 2 teams, the algorithm always
  // produces a 2-2 split.
  const skills = a.teams.map(totalSkill);
  const sizes = a.teams.map((t) => t.length);
  const skillSpread = Math.max(...skills) - Math.min(...skills);
  const sizeSpread = Math.max(...sizes) - Math.min(...sizes);

  const weakCounts = a.teams.map(
    (t) => t.filter((p) => p.skill === 1).length
  );
  const strongCounts = a.teams.map(
    (t) => t.filter((p) => p.skill === 3).length
  );
  const weakSpread = Math.max(...weakCounts) - Math.min(...weakCounts);
  const strongSpread =
    Math.max(...strongCounts) - Math.min(...strongCounts);

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
    strongSpread * 100 +
    weakSpread * 100 +
    sizeSpread * 80 +
    skillSpread * 30 -
    affinity * 2
  );
}

function clone(a: Assignment): Assignment {
  return { teams: a.teams.map((t) => [...t]) };
}

function targetSizes(n: number, teamCount: number): number[] {
  const base = Math.floor(n / teamCount);
  const remainder = n - base * teamCount;
  const sizes = Array(teamCount).fill(base) as number[];
  for (let i = 0; i < remainder; i++) sizes[i]++;
  return sizes;
}

/**
 * Initial seed: greedy by descending skill, placing each player on the legal
 * team that is currently cheapest (lowest skill, smallest over-target size).
 *
 * This always respects `canAssign` so the seed is feasible.
 */
function greedySeed(players: PresentPlayer[], teamCount: number): Assignment {
  const sorted = [...players].sort((a, b) => b.skill - a.skill);
  const teams: PresentPlayer[][] = Array.from({ length: teamCount }, () => []);
  const sizes = targetSizes(sorted.length, teamCount);

  for (const p of sorted) {
    let bestIdx = -1;
    let bestCost = Infinity;
    let tieCount = 0;
    for (let i = 0; i < teamCount; i++) {
      if (!canAssign(p.vest, TEAM_COLORS[i])) continue;
      const sizeOverTarget = Math.max(0, teams[i].length + 1 - sizes[i]);
      const cost = totalSkill(teams[i]) + sizeOverTarget * 50;
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
        tieCount = 1;
      } else if (cost === bestCost) {
        // Reservoir-sample among tied teams so the seed isn't biased
        // towards lower team indices (red over yellow over blue).
        tieCount++;
        if (Math.random() * tieCount < 1) bestIdx = i;
      }
    }
    if (bestIdx < 0) {
      const slice = TEAM_COLORS.slice(0, teamCount);
      bestIdx = slice.findIndex((c) => canAssign(p.vest, c));
      if (bestIdx < 0) bestIdx = 0;
    }
    teams[bestIdx].push(p);
  }
  return { teams };
}

/**
 * Optimise an assignment by repeatedly trying random swaps/moves and keeping
 * the change if the score improves. Illegal swaps (those that would violate
 * `canAssign`) are skipped outright so we never explore infeasible space.
 *
 * Reservoir sampling: when we land on a state whose score equals the current
 * best, we replace `best` with probability 1/n (where n counts how many
 * equally-good states we've seen). Over the whole loop this gives a
 * uniformly-random choice among all the equally-optimal states we visited,
 * which is what makes "Trekk på nytt" produce different splits each time
 * even when the optimum is heavily under-determined.
 */
function refine(start: Assignment, iterations = 4000): Assignment {
  let best = clone(start);
  let bestScore = score(best);
  let cur = clone(best);
  let curScore = bestScore;
  let bestEquivCount = 1;

  const teamCount = cur.teams.length;
  const sizes = targetSizes(cur.teams.flat().length, teamCount);

  for (let i = 0; i < iterations; i++) {
    const a = Math.floor(Math.random() * teamCount);
    let b = Math.floor(Math.random() * teamCount);
    if (b === a) b = (b + 1) % teamCount;

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
    // Accept improvements unconditionally; accept equal-score moves more
    // aggressively (~35%) so we wander the optimal plateau and gather many
    // candidate solutions for the reservoir.
    if (newScore < curScore || (newScore === curScore && Math.random() < 0.35)) {
      curScore = newScore;
      if (newScore < bestScore) {
        best = clone(cur);
        bestScore = newScore;
        bestEquivCount = 1;
      } else if (newScore === bestScore) {
        bestEquivCount++;
        if (Math.random() * bestEquivCount < 1) {
          best = clone(cur);
        }
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
 * Try multiple random seeds (greedy start + many shuffled starts) and keep
 * the best. Re-rolling the same input set produces a different split every
 * time: each attempt's `refine` reservoir-samples within the optimal
 * plateau, and this outer loop reservoir-samples again across the per-
 * attempt winners — so when several attempts find equally-optimal splits
 * (which is the common case), we pick uniformly among them.
 *
 * `teamCount` is 2 or 3. With 2 teams we use only red and yellow (the two
 * vest teams) — there's no "no-vest" team. The caller decides the count
 * (typically 2 for ≤10 players, 3 otherwise).
 */
export function allocateTeams(
  players: PresentPlayer[],
  teamCount: 2 | 3 = 3
): AllocatedTeam[] {
  if (players.length === 0) {
    return TEAM_COLORS.slice(0, teamCount).map((c) => ({
      color: c,
      label: TEAM_LABEL[c],
      players: [],
      totalSkill: 0,
    }));
  }

  // Run one attempt seeded with the deterministic greedy start, then a bunch
  // of shuffled-start attempts. Reservoir-sample across all attempts so
  // re-rolling produces variety.
  let best = refine(greedySeed(players, teamCount));
  let bestScore = score(best);
  let bestEquivCount = 1;

  const ATTEMPTS = 9;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const candidate = refine(greedySeed(shuffled, teamCount));
    const sc = score(candidate);
    if (sc < bestScore) {
      best = candidate;
      bestScore = sc;
      bestEquivCount = 1;
    } else if (sc === bestScore) {
      bestEquivCount++;
      if (Math.random() * bestEquivCount < 1) {
        best = candidate;
      }
    }
  }

  return buildResult(best);
}
