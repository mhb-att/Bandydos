import { useEffect, useMemo, useState } from "react";
import { ROSTER } from "./roster";
import {
  AllocatedTeam,
  PresentPlayer,
  VestColor,
  allocateTeams,
} from "./allocator";
import { haptic } from "./audio";

interface TeamsProps {
  result: AllocatedTeam[] | null;
  setResult: (r: AllocatedTeam[] | null) => void;
}

const STORAGE_KEY = "bandydos.teams.v1";

interface PlayerState {
  present: boolean;
  vest: VestColor;
}

type StateMap = Record<string, PlayerState>;

const VEST_OPTIONS: VestColor[] = ["white", "blue", "red", "yellow"];

const VEST_LABEL: Record<VestColor, string> = {
  white: "Hvit",
  blue: "Blå",
  red: "Rød",
  yellow: "Gul",
};

function defaultState(): StateMap {
  const out: StateMap = {};
  for (const p of ROSTER) {
    out[p.id] = { present: true, vest: "white" };
  }
  return out;
}

function loadState(): StateMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as StateMap;
    const merged = defaultState();
    for (const id of Object.keys(merged)) {
      const v = parsed?.[id];
      if (v && typeof v.present === "boolean" && VEST_OPTIONS.includes(v.vest)) {
        merged[id] = v;
      }
    }
    return merged;
  } catch {
    return defaultState();
  }
}

export function Teams({ result, setResult }: TeamsProps) {
  const [state, setState] = useState<StateMap>(() => loadState());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const present = useMemo<PresentPlayer[]>(() => {
    return ROSTER.filter((p) => state[p.id]?.present).map((p) => ({
      ...p,
      vest: state[p.id]?.vest ?? "white",
    }));
  }, [state]);

  const togglePresent = (id: string) => {
    haptic(8);
    setState((prev) => ({
      ...prev,
      [id]: { ...prev[id], present: !prev[id].present },
    }));
  };

  const setVest = (id: string, vest: VestColor) => {
    haptic(6);
    setState((prev) => ({
      ...prev,
      [id]: { ...prev[id], vest },
    }));
  };

  const setAllPresent = (present: boolean) => {
    haptic(15);
    setState((prev) => {
      const next: StateMap = { ...prev };
      for (const id of Object.keys(next)) {
        next[id] = { ...next[id], present };
      }
      return next;
    });
  };

  const presentCount = present.length;
  // ≤10 players → 2 teams (red + yellow); 11+ → 3 teams (red + yellow +
  // no-vest). Threshold matches the user's rule: small turn-outs aren't
  // worth splitting three ways.
  const teamCount: 2 | 3 = presentCount <= 10 ? 2 : 3;
  const minPlayers = teamCount;

  const allocate = () => {
    haptic([20, 40, 20]);
    setResult(allocateTeams(present, teamCount));
    requestAnimationFrame(() => {
      document.getElementById("teams-result")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  return (
    <div>
      <div className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>
            Spillere{" "}
            <span className="muted" style={{ fontWeight: 500 }}>
              ({presentCount}/{ROSTER.length})
            </span>
          </h2>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn ghost" onClick={() => setAllPresent(true)}>
              Alle på
            </button>
            <button className="btn ghost" onClick={() => setAllPresent(false)}>
              Alle av
            </button>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Trykk på et navn for å markere oppmøtt. Velg fargen på drakten/genseren
          de allerede har på. Spillere med rød eller gul drakt blir aldri satt
          på det blå laget — de kan kun bytte mellom rød og gul.
        </p>

        <div className="player-grid">
          {ROSTER.map((p) => {
            const s = state[p.id];
            return (
              <div
                key={p.id}
                className={`player ${s.present ? "present" : "absent"}`}
              >
                <button
                  className="player-name"
                  onClick={() => togglePresent(p.id)}
                  aria-pressed={s.present}
                >
                  <span className="check" aria-hidden="true" />
                  <span>{p.name}</span>
                </button>
                <div
                  className="color-pick"
                  role="radiogroup"
                  aria-label={`Drakt for ${p.name}`}
                >
                  {VEST_OPTIONS.map((c) => (
                    <button
                      key={c}
                      className={`color-dot ${s.vest === c ? "selected" : ""}`}
                      data-c={c}
                      role="radio"
                      aria-checked={s.vest === c}
                      aria-label={VEST_LABEL[c]}
                      onClick={() => setVest(p.id, c)}
                      disabled={!s.present}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="action-bar">
        <button
          className="btn primary lg full"
          onClick={allocate}
          disabled={presentCount < minPlayers}
        >
          {presentCount < minPlayers
            ? `Trenger minst ${minPlayers} spillere`
            : `Lag ${presentCount} spillere → ${teamCount} lag`}
        </button>
      </div>

      {result && (
        <div id="teams-result" style={{ scrollMarginTop: 12 }}>
          <div className="row between" style={{ margin: "12px 4px 8px 4px" }}>
            <h2 style={{ margin: 0 }}>Lagene</h2>
            <button className="btn ghost" onClick={allocate}>
              Trekk på nytt
            </button>
          </div>

          <div className={`teams-out cols-${result.length}`}>
            {result.map((t) => {
              // The third team is the "no-vest" team. If anyone there is
              // wearing blue we show it as the blue team; otherwise it's
              // effectively a "white team" (everyone in their own white
              // clothes), so adapt the label and swatch accordingly.
              const isWhiteTeam =
                t.color === "blue" && !t.players.some((p) => p.vest === "blue");
              const displayColor = isWhiteTeam ? "white" : t.color;
              const displayLabel = isWhiteTeam ? "Hvitt lag" : t.label;
              return (
              <div className="team" key={t.color} data-color={displayColor}>
                <div className="team-head">
                  <div className="team-swatch" />
                  <div className="team-title">{displayLabel}</div>
                  <div className="team-count">{t.players.length} spillere</div>
                </div>
                <ul>
                  {t.players.map((p) => {
                    const swap = vestSwapHint(p.vest, t.color);
                    return (
                      <li key={p.id}>
                        <span
                          className="vest"
                          data-c={p.vest}
                          aria-hidden="true"
                        />
                        <span>{p.name}</span>
                        {swap && <span className="swap">{swap}</span>}
                      </li>
                    );
                  })}
                  {t.players.length === 0 && (
                    <li className="muted" style={{ background: "transparent" }}>
                      Ingen spillere
                    </li>
                  )}
                </ul>
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function vestSwapHint(
  vest: VestColor,
  team: "red" | "yellow" | "blue"
): string | null {
  // Hard rule: nobody takes off their current colour. Red/yellow vest players
  // never end up on the blue (no-vest) team, so we don't generate a hint for
  // that combination — it shouldn't occur.
  if (vest === team) return null;
  if (team === "blue") return null;
  // Team is red or yellow. Either put one on (over white/blue) or swap from
  // the opposite colour vest.
  if (vest === "white" || vest === "blue") return `Tar på ${VEST_LABEL[team]}`;
  return `Bytter til ${VEST_LABEL[team]}`;
}
