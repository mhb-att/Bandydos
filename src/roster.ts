// Player roster.
// NOTE: skill levels live ONLY in source code. They are never rendered in the
// UI and never logged. 1 = lowest, 3 = highest.
export type Skill = 1 | 2 | 3;

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
  make("Bjørn", 2),
  make("Christian", 2),
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
