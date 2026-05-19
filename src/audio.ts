// Lightweight tone generator using the Web Audio API.
// We build all "notification sounds" from oscillators so we don't ship audio
// files. The two distinct sounds are easy to tell apart on a noisy ice rink.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

/** Must be called once from a user gesture so iOS/Safari unlocks audio. */
export async function unlockAudio(): Promise<void> {
  const c = getCtx();
  if (c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      /* noop */
    }
  }
  // Play a 1-sample silent buffer so the device commits to keeping audio open.
  const buffer = c.createBuffer(1, 1, 22050);
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.connect(c.destination);
  src.start(0);
}

interface Beep {
  freq: number;
  /** seconds */
  duration: number;
  type?: OscillatorType;
  /** 0..1 */
  volume?: number;
  /** seconds to wait before playing this beep */
  startOffset?: number;
}

function playSequence(beeps: Beep[]): void {
  const c = getCtx();
  const now = c.currentTime;
  for (const b of beeps) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = b.type ?? "square";
    osc.frequency.value = b.freq;

    const start = now + (b.startOffset ?? 0);
    const end = start + b.duration;
    const vol = b.volume ?? 0.35;

    // Quick attack/release to avoid clicks.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.01);
    gain.gain.setValueAtTime(vol, end - 0.04);
    gain.gain.linearRampToValueAtTime(0, end);

    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

/**
 * Round-end alarm: high-low siren-like blast. We play the whole pattern
 * twice (with a short gap) per the requirement, then go silent.
 */
export function playRoundEndAlarm(): void {
  const blast = (offset: number): Beep[] => [
    { freq: 880, duration: 0.32, type: "square", startOffset: offset },
    { freq: 660, duration: 0.32, type: "square", startOffset: offset + 0.34 },
    { freq: 880, duration: 0.45, type: "square", startOffset: offset + 0.7 },
  ];
  // First blast at t=0, second blast ~1.6s later.
  playSequence([...blast(0), ...blast(1.6)]);
}

/** Break-end signal: a single short rising ding. */
export function playBreakEndAlarm(): void {
  playSequence([
    { freq: 740, duration: 0.18, type: "sine", startOffset: 0, volume: 0.4 },
    { freq: 990, duration: 0.45, type: "sine", startOffset: 0.18, volume: 0.4 },
  ]);
}

/** Short tick used for last-3-second countdown cue. */
export function playTick(): void {
  playSequence([
    { freq: 1200, duration: 0.06, type: "sine", volume: 0.18 },
  ]);
}

/** Haptic feedback on devices that support it (mostly Android Chrome).
 * iOS does not expose `navigator.vibrate`, so this is a soft-fail no-op there.
 * Pass either a single duration in ms or a pattern array (on/off/on/off...). */
export function haptic(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* noop */
    }
  }
}

