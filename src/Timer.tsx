import { useCallback, useEffect, useRef, useState } from "react";
import {
  haptic,
  playBreakEndAlarm,
  playRoundEndAlarm,
  playTick,
  unlockAudio,
} from "./audio";

type Phase = "idle" | "round" | "break";

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

export function Timer() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [phase, setPhase] = useState<Phase>("idle");
  /** Wall-clock end time (ms epoch) of the current phase. */
  const endAtRef = useRef<number | null>(null);
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

  // Animation/render loop.
  useEffect(() => {
    if (phase === "idle") return;
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
  }, [phase]);

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

  const handlePhaseEnd = useCallback(() => {
    const ending = phaseRef.current;
    tickedSecondsRef.current = new Set();

    if (ending === "round") {
      playRoundEndAlarm();
      haptic([220, 120, 220, 120, 220]);
      if (settings.breakSec > 0) {
        endAtRef.current = Date.now() + settings.breakSec * 1000;
        setPhase("break");
      } else {
        playBreakEndAlarm();
        setRound((r) => r + 1);
        endAtRef.current = Date.now() + settings.roundSec * 1000;
        setPhase("round");
      }
    } else if (ending === "break") {
      playBreakEndAlarm();
      haptic(180);
      setRound((r) => r + 1);
      endAtRef.current = Date.now() + settings.roundSec * 1000;
      setPhase("round");
    }
  }, [settings]);

  const start = useCallback(async () => {
    await unlockAudio();
    haptic(40);
    endAtRef.current = Date.now() + settings.roundSec * 1000;
    tickedSecondsRef.current = new Set();
    setRound(1);
    setPhase("round");
  }, [settings]);

  const stop = useCallback(() => {
    haptic(30);
    endAtRef.current = null;
    tickedSecondsRef.current = new Set();
    setPhase("idle");
  }, []);

  const skipPhase = useCallback(() => {
    if (phase === "idle") return;
    handlePhaseEnd();
  }, [phase, handlePhaseEnd]);

  // Derived display values - computed on every render. The rAF loop above
  // triggers re-renders ~60Hz while the timer is running.
  const remaining =
    phase === "idle" || endAtRef.current == null
      ? phase === "break"
        ? settings.breakSec
        : settings.roundSec
      : Math.max(0, (endAtRef.current - Date.now()) / 1000);

  const totalForPhase = phase === "break" ? settings.breakSec : settings.roundSec;
  const progressPct =
    totalForPhase === 0
      ? 0
      : Math.min(100, Math.max(0, (1 - remaining / totalForPhase) * 100));

  const phaseLabel =
    phase === "idle" ? "KLAR" : phase === "round" ? "RUNDE" : "PAUSE";

  return (
    <div>
      <div
        className={`timer-display phase-${phase}`}
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
            <span className="dot" /> Auto-veksler runde / pause til du stopper
          </div>
        )}
      </div>

      <div className="controls">
        {phase === "idle" ? (
          <button className="btn primary lg full" onClick={start}>
            Start timer
          </button>
        ) : (
          <>
            <button className="btn full lg" onClick={skipPhase}>
              Hopp over
            </button>
            <button className="btn danger full lg" onClick={stop}>
              Stopp
            </button>
          </>
        )}
      </div>

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
    </div>
  );
}
