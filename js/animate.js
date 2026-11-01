// Playback of the sublunar point along a precomputed track.

/**
 * Player over [start, end]. `onFrame(date)` is called whenever the
 * current time changes; `onStateChange(playing)` when play/pause toggles.
 */
export function createPlayer({ onFrame, onStateChange }) {
  let start = 0, end = 0, current = 0;
  let speed = 3600; // simulated seconds per real second
  let playing = false;
  let last = 0;
  let raf = 0;

  function tick(now) {
    const dt = (now - last) / 1000;
    last = now;
    current += dt * speed * 1000;
    if (current >= end) {
      current = end;
      pause();
    }
    onFrame(new Date(current));
    if (playing) raf = requestAnimationFrame(tick);
  }

  function play() {
    if (playing || end <= start) return;
    if (current >= end) current = start;
    playing = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
    onStateChange(true);
  }

  function pause() {
    if (!playing) return;
    playing = false;
    cancelAnimationFrame(raf);
    onStateChange(false);
  }

  return {
    setRange(s, e, at = s) {
      start = s.getTime();
      end = e.getTime();
      current = Math.min(Math.max(at.getTime(), start), end);
      onFrame(new Date(current));
    },
    setSpeed(v) { speed = v; },
    toggle() { playing ? pause() : play(); },
    pause,
    /** Seek to a fraction 0..1 of the range. */
    seek(f) {
      current = start + f * (end - start);
      onFrame(new Date(current));
    },
    get fraction() { return end > start ? (current - start) / (end - start) : 0; },
    get playing() { return playing; },
  };
}
