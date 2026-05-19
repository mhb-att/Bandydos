// Player roster.
// NOTE: skill levels live ONLY in source code. They are never rendered in the
// UI and never logged. 1 = lowest, 3 = highest. Half-steps (e.g. 2.5) are
// allowed for players who sit between two tiers — the allocator handles
// fractional skills natively. Skill-1 and skill-3 spread rules use strict
// equality, so a 2.5 player is treated as neither weak nor strong.
export type Skill = 1 | 2 | 2.5 | 3;

export interface Player {
  id: string;
  name: string;
  /** Hidden skill rating - never rendered in the UI. */
  skill: Skill;
}

const make = (name: string, skill: Skill): Player => ({
  id: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  skill,
});

export const ROSTER: Player[] = [
  make("Bjørn", 2.5),
  make("Christian", 2.5),
  make("Erik", 2),
  make("Jan Erik", 1),
  make("Jan Petter", 2),
  make("Jon", 2),
  make("Jørgen", 3),
  make("Knut Anders", 3),
  make("Martin", 3),
  make("Morten", 3),
  make("Petter", 3),
  make("Rolf", 1),
  make("Stein H", 3),
  make("Stein K", 1),
  make("Tore", 2),
  make("Øyvind", 3),
];
