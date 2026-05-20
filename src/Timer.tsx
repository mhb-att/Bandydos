import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  haptic,
  playBreakEndAlarm,
  playRoundEndAlarm,
  playTick,
  unlockAudio,
} from "./audio";
import type { AllocatedTeam, TeamColor } from "./allocator";
import {
  type MatchResult,
  type Outcome,
  matchForRound,
  teamLabel,
} from "./match";
import { StandingsOverlay, WinnerPromptOverlay } from "./MatchOverlays";

type Phase = "idle" | "round" | "break";

interface TimerProps {
  teams: AllocatedTeam[] | null;
}

interface MatchIndicatorProps {
  teams: AllocatedTeam[];
  playing: [TeamColor, TeamColor];
  bench: TeamColor | null;
  round: number;
}

function MatchIndicator({ teams, playing, bench, round }: MatchIndicatorProps) {
  return (
    <div className="match-indicator" aria-label={`Runde ${round} oppsett`}>
      <div className="match-indicator-row">
        <span className="match-indicator-label">Spiller</span>
        <span className="match-indicator-teams">
          <span className="match-team-pill" data-color={playing[0]}>
            <span className="match-team-swatch" />
            {teamLabel(teams, playing[0])}
          </span>
          <span className="match-vs">vs</span>
          <span className="match-team-pill" data-color={playing[1]}>
            <span className="match-team-swatch" />
            {teamLabel(teams, playing[1])}
          </span>
        </span>
      </div>
      {bench && (
        <div className="match-indicator-row muted-row">
          <span className="match-indicator-label">Hviler</span>
          <span className="match-team-pill ghost" data-color={bench}>
            <span className="match-team-swatch" />
            {teamLabel(teams, bench)}
          </span>
        </div>
      )}
    </div>
  );
}

interface Settings {
  roundSec: number;
  breakSec: number;
}

const STORAGE_KEY = "bandydos.timer.v1";

const DEFAULTS: Settings = {
  roundSec: 4 * 60,
  breakSec: 60,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      roundSec: clampInt(parsed.roundSec, 5, 60 * 60, DEFAULTS.roundSec),
      breakSec: clampInt(parsed.breakSec, 0, 30 * 60, DEFAULTS.breakSec),
    };
  } catch {
    return DEFAULTS;
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function formatTime(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

interface TimePartsInputProps {
  label: string;
  totalSec: number;
  min?: number;
  max?: number;
  onChange: (sec: number) => void;
}

function TimePartsInput({
  label,
  totalSec,
  min = 0,
  max = 60 * 60,
  onChange,
}: TimePartsInputProps) {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;

  const setMinutes = (m: number) => {
    const next = clampInt(m * 60 + seconds, min, max, totalSec);
    onChange(next);
  };
  const setSeconds = (s: number) => {
    let nm = minutes;
    let ns = s;
    if (ns < 0) {
      nm -= 1;
      ns = 55;
    } else if (ns >= 60) {
      nm += 1;
      ns = 0;
    }
    const next = clampInt(nm * 60 + ns, min, max, totalSec);
    onChange(next);
  };

  return (
    <div className="field">
      <label>{label}</label>
      <div className="row">
        <div className="stepper" style={{ flex: 1 }}>
          <button onClick={() => setMinutes(minutes - 1)} aria-label="minus minutt">
            −
          </button>
          <div className="stepper-val">
            {minutes.toString().padStart(2, "0")} min
          </div>
          <button onClick={() => setMinutes(minutes + 1)} aria-label="pluss minutt">
            +
          </button>
        </div>
        <div className="stepper" style={{ flex: 1 }}>
          <button onClick={() => setSeconds(seconds - 5)} aria-label="minus sekund">
            −
          </button>
          <div className="stepper-val">
            {seconds.toString().padStart(2, "0")} sek
          </div>
          <button onClick={() => setSeconds(seconds + 5)} aria-label="pluss sekund">
            +
          </button>
        </div>
      </div>
    </div>
  );
}

export function Timer({ teams }: TimerProps) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [phase, setPhase] = useState<Phase>("idle");
  const [isPaused, setIsPaused] = useState(false);

  // Match-tracking state. `matches` accumulates results across the whole
  // session (= until Stopp is pressed and standings are dismissed).
  // `pendingPrompt` holds the just-finished match while we wait for the
  // user to declare a winner; the timer is auto-paused while it's open.
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [pendingPrompt, setPendingPrompt] = useState<{
    round: number;
    teams: [TeamColor, TeamColor];
  } | null>(null);
  const [showStandings, setShowStandings] = useState(false);
  // Snapshot of teams used to render standings even after `teams` changes
  // (e.g. user tapped "Lag" and re-rolled while standings were open).
  const [standingsTeams, setStandingsTeams] = useState<AllocatedTeam[] | null>(
    null
  );
  /** Wall-clock end time (ms epoch) of the current phase. */
  const endAtRef = useRef<number | null>(null);
  /**
   * Seconds remaining at the moment we paused. Restored to `endAtRef` (as a
   * future timestamp) when the user resumes. `null` when not paused.
   */
  const pausedRemainingRef = useRef<number | null>(null);
  /** Re-render tick counter so the displayed time updates. */
  const [, setNow] = useState(0);
  const [round, setRound] = useState(1);
  /** Whether we should auto-trigger the next phase when reaching 0. */
  const phaseRef = useRef<Phase>("idle");
  /** Has the last-3-second tick already fired for this phase? */
  const tickedSecondsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Persist settings.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // Animation/render loop. Stops when idle or paused.
  useEffect(() => {
    if (phase === "idle" || isPaused) return;
    let raf = 0;
    const loop = () => {
      const end = endAtRef.current;
      if (end == null) return;
      const remaining = (end - Date.now()) / 1000;

      // Last-3-second ticks (one tick per integer second crossed).
      if (remaining > 0 && remaining <= 3) {
        const sec = Math.ceil(remaining);
        if (!tickedSecondsRef.current.has(sec)) {
          tickedSecondsRef.current.add(sec);
          playTick();
        }
      }

      if (remaining <= 0) {
        handlePhaseEnd();
        return;
      }
      setNow((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isPaused]);

  // Keep screen alive while the timer is running.
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    const wakeApi = (
      navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
      }
    ).wakeLock;
    if (!wakeApi) return;

    if (phase !== "idle") {
      wakeApi.request("screen").then(
        (s) => {
          wakeRef.current = s;
        },
        () => {
          /* ignored */
        }
      );
    } else {
      wakeRef.current?.release().catch(() => {});
      wakeRef.current = null;
    }
    return () => {
      wakeRef.current?.release().catch(() => {});
      wakeRef.current = null;
    };
  }, [phase]);

  // The match the user is currently playing. Captured via ref so that
  // `handlePhaseEnd` can queue the winner prompt with the right teams even
  // after we've already set the next round's phase.
  const currentRoundRef = useRef(round);
  useEffect(() => {
    currentRoundRef.current = round;
  }, [round]);

  const queuePromptIfNeeded = useCallback(
    (justEndedRound: number) => {
      if (!teams) return;
      const { playing } = matchForRound(teams, justEndedRound);
      // The break timer keeps running while the prompt is up. If no one
      // answers in time, the prompt is auto-discarded when the break
      // ends (see `handlePhaseEnd` below) and the match isn't recorded.
      setPendingPrompt({ round: justEndedRound, teams: playing });
    },
    [teams]
  );

  const handlePhaseEnd = useCallback(() => {
    const ending = phaseRef.current;
    tickedSecondsRef.current = new Set();
    pausedRemainingRef.current = null;
    // Auto-discard any unanswered winner prompt when the phase changes.
    // For breakSec > 0 this fires when the break ends — exactly the
    // user's "if no one answers within the pause period, ignore the
    // match" rule. For breakSec === 0 the prompt survives through the
    // next round and is discarded when *that* round ends instead, so
    // there's still a chance to answer.
    setPendingPrompt(null);

    if (ending === "round") {
      playRoundEndAlarm();
      haptic([220, 120, 220, 120, 220]);
      const justEnded = currentRoundRef.current;
      if (settings.breakSec > 0) {
        endAtRef.current = Date.now() + settings.breakSec * 1000;
        setPhase("break");
        queuePromptIfNeeded(justEnded);
      } else {
        // No break configured: go straight to the next round. The prompt
        // for the round that just ended sits on top of the running next
        // round until the user answers (or that next round also ends).
        playBreakEndAlarm();
        setRound((r) => r + 1);
        endAtRef.current = Date.now() + settings.roundSec * 1000;
        setPhase("round");
        queuePromptIfNeeded(justEnded);
      }
    } else if (ending === "break") {
      playBreakEndAlarm();
      haptic(180);
      setRound((r) => r + 1);
      endAtRef.current = Date.now() + settings.roundSec * 1000;
      setPhase("round");
    }
    setIsPaused(false);
  }, [settings, queuePromptIfNeeded]);

  const start = useCallback(async () => {
    await unlockAudio();
    haptic(40);
    endAtRef.current = Date.now() + settings.roundSec * 1000;
    pausedRemainingRef.current = null;
    tickedSecondsRef.current = new Set();
    setRound(1);
    setIsPaused(false);
    setMatches([]);
    setPendingPrompt(null);
    setShowStandings(false);
    setStandingsTeams(null);
    setPhase("round");
  }, [settings]);

  const stop = useCallback(() => {
    haptic(30);
    endAtRef.current = null;
    pausedRemainingRef.current = null;
    tickedSecondsRef.current = new Set();
    setIsPaused(false);
    setPendingPrompt(null);
    setPhase("idle");
    // If we recorded any matches, show the standings overlay instead of
    // silently going back to idle. The overlay clears `matches` on dismiss.
    if (matches.length > 0 && teams) {
      setStandingsTeams(teams);
      setShowStandings(true);
    }
  }, [matches.length, teams]);

  const recordOutcome = useCallback(
    (outcome: Outcome) => {
      haptic(15);
      if (pendingPrompt) {
        const recorded: MatchResult = {
          round: pendingPrompt.round,
          teams: pendingPrompt.teams,
          outcome,
        };
        // Keep the two state updates outside each other's updater
        // functions. React StrictMode double-invokes updaters to detect
        // impurity, so nesting them would record the match twice.
        setMatches((prev) => [...prev, recorded]);
      }
      setPendingPrompt(null);
    },
    [pendingPrompt]
  );

  const dismissStandings = useCallback(() => {
    setShowStandings(false);
    setStandingsTeams(null);
    setMatches([]);
  }, []);

  // If the user re-allocates teams (different colours / different player
  // counts), any in-flight match history is no longer meaningful. Clear it
  // so we don't mix stale results into the new session.
  const teamsKey = useMemo(() => {
    if (!teams) return "";
    return teams
      .map((t) => `${t.color}:${t.players.map((p) => p.id).join(",")}`)
      .join("|");
  }, [teams]);
  useEffect(() => {
    setMatches([]);
    setPendingPrompt(null);
  }, [teamsKey]);

  const togglePause = useCallback(() => {
    haptic(20);
    if (isPaused) {
      // Resume: restore endAt from the captured remaining seconds.
      const remaining = pausedRemainingRef.current ?? 0;
      endAtRef.current = Date.now() + remaining * 1000;
      pausedRemainingRef.current = null;
      setIsPaused(false);
    } else {
      // Pause: capture how much time was left on the current phase.
      const end = endAtRef.current;
      pausedRemainingRef.current = end == null ? 0 : Math.max(0, (end - Date.now()) / 1000);
      endAtRef.current = null;
      setIsPaused(true);
    }
  }, [isPaused]);

  const skipPhase = useCallback(() => {
    if (phase === "idle") return;
    handlePhaseEnd();
  }, [phase, handlePhaseEnd]);

  // Derived display values - computed on every render. The rAF loop above
  // triggers re-renders ~60Hz while the timer is running. When paused we
  // freeze the displayed time at the captured `pausedRemainingRef`.
  const remaining = (() => {
    if (phase === "idle") return settings.roundSec;
    if (isPaused) return pausedRemainingRef.current ?? 0;
    if (endAtRef.current == null) {
      return phase === "break" ? settings.breakSec : settings.roundSec;
    }
    return Math.max(0, (endAtRef.current - Date.now()) / 1000);
  })();

  const totalForPhase = phase === "break" ? settings.breakSec : settings.roundSec;
  const progressPct =
    totalForPhase === 0
      ? 0
      : Math.min(100, Math.max(0, (1 - remaining / totalForPhase) * 100));

  const phaseLabel = isPaused
    ? "PAUSET"
    : phase === "idle"
      ? "KLAR"
      : phase === "round"
        ? "RUNDE"
        : "PAUSE";

  // Which match the indicator should describe.
  //   - idle: preview round 1 so the user sees who'll start
  //   - while the winner prompt is up: the round being asked about
  //   - during a round: that round
  //   - during the break (after the prompt is dismissed): the upcoming round
  //     (the next pair coming on the ice)
  const indicatorRound =
    phase === "idle"
      ? 1
      : pendingPrompt
        ? pendingPrompt.round
        : phase === "break"
          ? round + 1
          : round;
  const matchInfo = teams ? matchForRound(teams, indicatorRound) : null;

  return (
    <div>
      {teams && matchInfo && (
        <MatchIndicator
          teams={teams}
          playing={matchInfo.playing}
          bench={matchInfo.bench}
          round={indicatorRound}
        />
      )}

      <div
        className={`timer-display phase-${phase}${isPaused ? " paused" : ""}`}
        aria-live="polite"
      >
        <div className={`phase-label ${phase !== "idle" ? "live" : ""} phase-${phase}`}>
          {phaseLabel}
        </div>
        <div className="timer-time">{formatTime(remaining)}</div>
        <div className="timer-meta">
          {phase === "idle"
            ? "Trykk Start for å begynne"
            : `Runde ${round}`}
        </div>
        <div className="timer-progress" aria-hidden="true">
          <span style={{ width: `${progressPct}%` }} />
        </div>
        {phase !== "idle" && (
          <div className="cycle-info">
            <span className="dot" />{" "}
            {isPaused
              ? "Trykk Fortsett for å gjenoppta"
              : "Auto-veksler runde / pause til du stopper"}
          </div>
        )}
      </div>

      {phase === "idle" ? (
        <div className="controls">
          <button className="btn primary lg full" onClick={start}>
            Start timer
          </button>
        </div>
      ) : (
        <>
          <button
            className="btn primary lg full"
            onClick={togglePause}
            aria-pressed={isPaused}
          >
            {isPaused ? "Fortsett" : "Pause"}
          </button>
          <div className="controls" style={{ marginTop: 10 }}>
            <button className="btn full lg" onClick={skipPhase}>
              Hopp over
            </button>
            <button className="btn danger full lg" onClick={stop}>
              Stopp
            </button>
          </div>
        </>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Innstillinger</h2>
        <div className="row" style={{ alignItems: "stretch", gap: 14 }}>
          <TimePartsInput
            label="Runde"
            totalSec={settings.roundSec}
            min={5}
            max={60 * 60}
            onChange={(s) =>
              setSettings((prev) => ({ ...prev, roundSec: s }))
            }
          />
        </div>
        <div className="divider" />
        <div className="row" style={{ alignItems: "stretch", gap: 14 }}>
          <TimePartsInput
            label="Pause"
            totalSec={settings.breakSec}
            min={0}
            max={30 * 60}
            onChange={(s) =>
              setSettings((prev) => ({ ...prev, breakSec: s }))
            }
          />
        </div>
        <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
          Når runden er ferdig spilles et signal to ganger, så starter pausen.
          Når pausen er ferdig spilles et annet signal én gang, og neste runde
          starter automatisk.
        </p>
      </div>

      {pendingPrompt && teams && (
        <WinnerPromptOverlay
          teams={teams}
          round={pendingPrompt.round}
          playing={pendingPrompt.teams}
          onSelect={recordOutcome}
        />
      )}
      {showStandings && standingsTeams && (
        <StandingsOverlay
          teams={standingsTeams}
          matches={matches}
          onDismiss={dismissStandings}
        />
      )}
    </div>
  );
}
