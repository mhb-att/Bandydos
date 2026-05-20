import { createPortal } from "react-dom";
import type { AllocatedTeam, TeamColor } from "./allocator";
import {
  type MatchResult,
  type Outcome,
  computeStandings,
  teamLabel,
} from "./match";

/** Modal asking the user who won the match that just ended. The timer is
 * paused while this is open; tapping any option closes the overlay and
 * records the outcome. */
interface WinnerPromptProps {
  teams: AllocatedTeam[];
  round: number;
  playing: [TeamColor, TeamColor];
  onSelect: (outcome: Outcome) => void;
}

export function WinnerPromptOverlay({
  teams,
  round,
  playing,
  onSelect,
}: WinnerPromptProps) {
  return createPortal(
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Hvem vant?">
      <div className="overlay-card">
        <div className="overlay-eyebrow">Runde {round}</div>
        <h2 className="overlay-title">Hvem vant?</h2>
        <div className="winner-options">
          <button
            className="winner-option"
            data-color={playing[0]}
            onClick={() => onSelect(playing[0])}
          >
            <span className="match-team-swatch" />
            <span className="winner-option-label">{teamLabel(teams, playing[0])}</span>
          </button>
          <button
            className="winner-option winner-option-tie"
            onClick={() => onSelect("tie")}
          >
            <span className="winner-option-label">Uavgjort</span>
            <span className="winner-option-sublabel">1 poeng hver</span>
          </button>
          <button
            className="winner-option"
            data-color={playing[1]}
            onClick={() => onSelect(playing[1])}
          >
            <span className="match-team-swatch" />
            <span className="winner-option-label">{teamLabel(teams, playing[1])}</span>
          </button>
        </div>
        <p className="overlay-foot muted">
          Pausen er stoppet til du svarer.
        </p>
      </div>
    </div>,
    document.body
  );
}

/** Overlay shown when the user presses Stopp after at least one match was
 * played. Lists final standings (1st / 2nd / 3rd) by points. */
interface StandingsProps {
  teams: AllocatedTeam[];
  matches: MatchResult[];
  onDismiss: () => void;
}

const POSITION_LABEL: Record<number, string> = {
  0: "1. plass",
  1: "2. plass",
  2: "3. plass",
};

export function StandingsOverlay({ teams, matches, onDismiss }: StandingsProps) {
  const standings = computeStandings(teams, matches);
  return createPortal(
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Sluttstilling"
    >
      <div className="overlay-card">
        <div className="overlay-eyebrow">{matches.length} kamper spilt</div>
        <h2 className="overlay-title">Sluttstilling</h2>
        <ol className="standings-list" start={1}>
          {standings.map((s, i) => (
            <li key={s.color} className="standings-row" data-pos={i}>
              <div className="standings-pos">
                {POSITION_LABEL[i] ?? `${i + 1}. plass`}
              </div>
              <div className="standings-team">
                <span className="match-team-swatch" data-c={s.color} />
                <span className="standings-name">{s.label}</span>
              </div>
              <div className="standings-points">
                <strong>{s.points}</strong>
                <span className="muted standings-points-suffix">poeng</span>
              </div>
              <div className="standings-record muted">
                {s.wins} V · {s.ties} U · {s.losses} T
              </div>
            </li>
          ))}
        </ol>
        <button className="btn primary lg full" onClick={onDismiss}>
          Lukk
        </button>
      </div>
    </div>,
    document.body
  );
}
