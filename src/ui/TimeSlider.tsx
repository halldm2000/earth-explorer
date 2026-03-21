/**
 * TimeSlider: compact date control bar for temporal GIBS imagery layers.
 *
 * Appears at bottom-center (above the status bar) when any temporal imagery
 * layer is visible. Features:
 *   - Step through dates day by day
 *   - Scrub a 30-day range slider (debounced — visual feedback is instant,
 *     tile reload waits for the user to stop dragging)
 *   - Pick a date from the native date picker
 *   - Jump to the latest available date
 *   - Play/pause animation with adjustable speed
 *
 * Inspired by the e2-healpix-viewer's adaptive time scrubbing. Works with
 * the double-buffered `reloadTemporalLayers()` so the globe never goes blank.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useStore } from '@/store'
import {
  getGlobalDate,
  getRealGlobalDate,
  setGlobalDate,
  getLatestDate,
  reloadTemporalLayers,
  hasVisibleTemporalLayers,
} from '@/data/gibs-layer-factory'
import { getAllLayers } from '@/features/layers/manager'
import { onPrefetchProgress, setPlaybackState, isPrefetchReady } from '@/features/layers/prefetch'

// ── Constants ──

const RANGE_DAYS = 30

/** Playback speed options: label → milliseconds per day step */
const SPEEDS: { label: string; ms: number }[] = [
  { label: '½×', ms: 3000 },
  { label: '1×', ms: 1500 },
  { label: '2×', ms: 800 },
  { label: '4×', ms: 400 },
]
const DEFAULT_SPEED_INDEX = 1

/** Debounce delay for range slider scrubbing (ms) */
const SCRUB_DEBOUNCE_MS = 200

// ── Helpers ──

/** Format YYYY-MM-DD to a human-friendly label like "Mar 16, 2026" */
function formatDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Shift a YYYY-MM-DD string by `delta` days and return the new string */
function shiftDate(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T12:00:00Z') // noon UTC avoids timezone boundary issues
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** Compute the number of days between two YYYY-MM-DD strings (a - b) */
function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T12:00:00Z')
  const db = new Date(b + 'T12:00:00Z')
  return Math.round((da.getTime() - db.getTime()) / 86_400_000)
}

// ── Exported playback control (for MCP commands) ──

let _externalPlayToggle: (() => void) | null = null
let _externalSetSpeed: ((index: number) => void) | null = null
let _externalIsPlaying: (() => boolean) | null = null

/** Start or resume time animation playback. */
export function startPlayback(): void { if (_externalIsPlaying && !_externalIsPlaying()) _externalPlayToggle?.() }
/** Pause time animation playback. */
export function pausePlayback(): void { if (_externalIsPlaying?.()) _externalPlayToggle?.() }
/** Toggle time animation playback. */
export function togglePlayback(): void { _externalPlayToggle?.() }
/** Set playback speed by index (0=½×, 1=1×, 2=2×, 3=4×). */
export function setPlaybackSpeed(index: number): void { _externalSetSpeed?.(index) }
/** Step forward one day. */
export async function stepDateForward(): Promise<string> {
  const cur = getRealGlobalDate()
  const next = shiftDate(cur, 1)
  setGlobalDate(next)
  await reloadTemporalLayers()
  return getRealGlobalDate()
}
/** Step back one day. */
export async function stepDateBack(): Promise<string> {
  const cur = getRealGlobalDate()
  const prev = shiftDate(cur, -1)
  setGlobalDate(prev)
  await reloadTemporalLayers()
  return getRealGlobalDate()
}
/** Get the current GIBS date. */
export function getCurrentDate(): string { return getRealGlobalDate() }
/** Check if time animation is currently playing. */
export function isPlaying(): boolean { return _externalIsPlaying?.() ?? false }
/** Get available speed labels. */
export function getSpeedOptions(): string[] { return SPEEDS.map(s => s.label) }

/** Get IDs of all visible temporal imagery layers (for prefetch readiness check). */
function _getAllTemporalLayerIds(): string[] {
  return getAllLayers()
    .filter(l => l.visible && l.def.temporal && l.def.kind === 'imagery')
    .map(l => l.def.id)
}

// ── Component ──

export function TimeSlider() {
  const layerRevision = useStore(s => s.layerRevision)

  const [visible, setVisible] = useState(false)
  const [currentDate, setCurrentDate] = useState(getGlobalDate)
  const [reloading, setReloading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [playDirection, setPlayDirection] = useState<1 | -1>(1) // 1 = forward, -1 = backward
  const [looping, setLooping] = useState(true)
  const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED_INDEX)

  const prefetchLoading = useStore(s => s.prefetchLoading)
  const setPrefetchProgress = useStore(s => s.setPrefetchProgress)

  const dateInputRef = useRef<HTMLInputElement>(null)
  const scrubTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playingRef = useRef(false)
  const currentDateRef = useRef(currentDate)

  // Keep playing ref in sync
  playingRef.current = playing

  // Compute slider range: latest date and the start date (30 days before latest)
  const latestDate = useMemo(() => getLatestDate(), [])
  const startDate = useMemo(() => shiftDate(latestDate, -RANGE_DAYS), [latestDate])

  // Slider position: 0 = startDate, RANGE_DAYS = latestDate
  const sliderValue = useMemo(
    () => Math.max(0, Math.min(RANGE_DAYS, daysBetween(currentDate, startDate))),
    [currentDate, startDate],
  )

  // Check visibility whenever layers change
  useEffect(() => {
    setVisible(hasVisibleTemporalLayers())
    // Sync date in case it was changed externally (use real date, not prefetch override)
    const d = getRealGlobalDate()
    setCurrentDate(d)
    currentDateRef.current = d
  }, [layerRevision])

  // ── Wire prefetch progress to store ──
  useEffect(() => {
    return onPrefetchProgress((loading, total) => {
      setPrefetchProgress(loading, total)
    })
  }, [setPrefetchProgress])

  // ── Register external control handles (basic — step handles added after callbacks) ──
  useEffect(() => {
    _externalPlayToggle = () => setPlaying(p => !p)
    _externalSetSpeed = (i: number) => setSpeedIndex(Math.max(0, Math.min(SPEEDS.length - 1, i)))
    _externalIsPlaying = () => playingRef.current
    return () => {
      _externalPlayToggle = null
      _externalSetSpeed = null
      _externalIsPlaying = null
    }
  }, [])

  // ── Core date change (with reload) ──

  const changeDate = useCallback(async (newDate: string) => {
    // Clamp to valid range
    const clamped = newDate < startDate ? startDate : newDate > latestDate ? latestDate : newDate
    setGlobalDate(clamped)
    setCurrentDate(clamped)
    currentDateRef.current = clamped
    setReloading(true)
    try {
      await reloadTemporalLayers()
    } finally {
      setReloading(false)
    }
  }, [startDate, latestDate])

  // ── Sync playback state to prefetch engine ──

  useEffect(() => {
    if (playing) {
      setPlaybackState(playDirection as 0 | 1 | -1, SPEEDS[speedIndex].ms)
    } else {
      setPlaybackState(0, SPEEDS[speedIndex].ms)
    }
  }, [playing, playDirection, speedIndex])

  // ── Playback loop ──
  //
  // Race-based playback: starts the tile reload and races it against the
  // speed timer. If tiles load before the timer, we advance on the timer
  // (guaranteed display time). If the timer fires first, we wait for the
  // reload to finish before advancing (no flickering).
  //
  // Prefetch cache hits resolve in ~1ms, so the timer is the bottleneck
  // when the cache is warm — smooth playback at the configured speed.

  useEffect(() => {
    if (!playing) return

    let cancelled = false
    let timerId: ReturnType<typeof setTimeout> | null = null

    const step = async () => {
      if (cancelled || !playingRef.current) return

      const cur = currentDateRef.current
      const next = shiftDate(cur, playDirection)

      // Check bounds
      const outOfBounds = playDirection === 1
        ? next > latestDate
        : next < startDate

      let target: string
      if (outOfBounds) {
        if (looping) {
          target = playDirection === 1 ? startDate : latestDate
        } else {
          setPlaying(false)
          return
        }
      } else {
        target = next
      }

      // Update date + label immediately
      setGlobalDate(target)
      setCurrentDate(target)
      currentDateRef.current = target

      // Start reload and timer in parallel
      const baseMs = SPEEDS[speedIndex].ms
      const reloadDone = reloadTemporalLayers().catch(() => {})
      const timerDone = new Promise<void>(r => { timerId = setTimeout(r, baseMs) })

      // Wait for BOTH: tiles must be loaded AND minimum display time elapsed
      await Promise.all([reloadDone, timerDone])

      if (!cancelled && playingRef.current) {
        step()
      }
    }

    // Kick off first step
    timerId = setTimeout(step, 50)

    return () => {
      cancelled = true
      if (timerId) clearTimeout(timerId)
    }
  }, [playing, playDirection, looping, speedIndex, startDate, latestDate])

  // ── User actions ──

  const handleStepBack = useCallback(() => {
    setPlaying(false)
    changeDate(shiftDate(getRealGlobalDate(), -1))
  }, [changeDate])

  const handleStepForward = useCallback(() => {
    setPlaying(false)
    changeDate(shiftDate(getRealGlobalDate(), 1))
  }, [changeDate])

  const jumpToLatest = useCallback(() => {
    setPlaying(false)
    changeDate(getLatestDate())
  }, [changeDate])

  const togglePlay = useCallback(() => {
    setPlaying(p => !p)
  }, [])

  const cycleSpeed = useCallback(() => {
    setSpeedIndex(i => (i + 1) % SPEEDS.length)
  }, [])

  // ── Debounced slider scrubbing ──
  // Updates the date label immediately for visual feedback,
  // but debounces the actual tile reload until dragging pauses.

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPlaying(false)

      const days = Number(e.target.value)
      const newDate = shiftDate(startDate, days)

      // Immediate visual feedback (date label + slider position)
      setCurrentDate(newDate)
      setGlobalDate(newDate)
      currentDateRef.current = newDate

      // Debounce the tile reload
      if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current)
      scrubTimerRef.current = setTimeout(async () => {
        setReloading(true)
        try {
          await reloadTemporalLayers()
        } finally {
          setReloading(false)
        }
      }, SCRUB_DEBOUNCE_MS)
    },
    [startDate],
  )

  // Cleanup debounce timer on unmount
  useEffect(() => () => {
    if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current)
  }, [])

  const handleDateClick = useCallback(() => {
    setPlaying(false)
    requestAnimationFrame(() => {
      dateInputRef.current?.showPicker?.()
      dateInputRef.current?.focus()
    })
  }, [])

  const handleDatePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      if (val) changeDate(val)
    },
    [changeDate],
  )

  const isAtLatest = currentDate >= latestDate

  return (
    <div
      style={{
        ...wrapperStyle,
        opacity: visible ? 1 : 0,
        transform: visible
          ? 'translateX(-50%) translateY(0)'
          : 'translateX(-50%) translateY(12px)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div
        style={{
          ...barStyle,
          borderColor: playing
            ? 'var(--accent, #4FC3F7)'
            : reloading
              ? 'rgba(79, 195, 247, 0.4)'
              : 'rgba(255,255,255,0.08)',
        }}
      >
        {/* Step back */}
        <button
          style={arrowBtnStyle}
          onClick={handleStepBack}
          title="Previous day"
          aria-label="Previous day"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* Date label (clickable to open picker) */}
        <button
          style={dateLabelStyle}
          onClick={handleDateClick}
          title="Click to pick a date"
          aria-label="Pick a date"
        >
          {formatDateLabel(currentDate)}
        </button>

        {/* Hidden native date input for the picker */}
        <input
          ref={dateInputRef}
          type="date"
          value={currentDate}
          max={latestDate}
          onChange={handleDatePick}
          style={hiddenDateInputStyle}
          tabIndex={-1}
        />

        {/* Step forward */}
        <button
          style={arrowBtnStyle}
          onClick={handleStepForward}
          title="Next day"
          aria-label="Next day"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Divider */}
        <div style={dividerStyle} />

        {/* Range slider */}
        <input
          className="ws-time-range"
          type="range"
          min={0}
          max={RANGE_DAYS}
          value={sliderValue}
          onChange={handleSliderChange}
          style={rangeSliderStyle}
          title={`Scrub date range (${RANGE_DAYS} days)`}
          aria-label="Date range slider"
        />

        {/* Divider */}
        <div style={dividerStyle} />

        {/* Play backward */}
        <button
          style={{
            ...playBtnStyle,
            background: playing && playDirection === -1 ? 'rgba(79, 195, 247, 0.15)' : 'transparent',
            borderColor: playing && playDirection === -1 ? 'var(--accent, #4FC3F7)' : 'rgba(255,255,255,0.06)',
            color: playing && playDirection === -1 ? 'var(--accent, #4FC3F7)' : 'rgba(255,255,255,0.7)',
          }}
          onClick={() => {
            if (playing && playDirection === -1) { setPlaying(false) }
            else { setPlayDirection(-1); setPlaying(true) }
          }}
          title={playing && playDirection === -1 ? 'Pause' : 'Play backward'}
          aria-label="Play backward"
        >
          {playing && playDirection === -1 ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="18,4 4,12 18,20" />
            </svg>
          )}
        </button>

        {/* Play forward */}
        <button
          style={{
            ...playBtnStyle,
            background: playing && playDirection === 1 ? 'rgba(79, 195, 247, 0.15)' : 'transparent',
            borderColor: playing && playDirection === 1 ? 'var(--accent, #4FC3F7)' : 'rgba(255,255,255,0.06)',
            color: playing && playDirection === 1 ? 'var(--accent, #4FC3F7)' : 'rgba(255,255,255,0.7)',
          }}
          onClick={() => {
            if (playing && playDirection === 1) { setPlaying(false) }
            else { setPlayDirection(1); setPlaying(true) }
          }}
          title={playing && playDirection === 1 ? 'Pause' : 'Play forward'}
          aria-label="Play forward"
        >
          {playing && playDirection === 1 ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6,4 20,12 6,20" />
            </svg>
          )}
        </button>

        {/* Loop toggle */}
        <button
          style={{
            ...playBtnStyle,
            background: looping ? 'rgba(79, 195, 247, 0.15)' : 'transparent',
            borderColor: looping ? 'var(--accent, #4FC3F7)' : 'rgba(255,255,255,0.06)',
            color: looping ? 'var(--accent, #4FC3F7)' : 'rgba(255,255,255,0.4)',
          }}
          onClick={() => setLooping(l => !l)}
          title={`Loop: ${looping ? 'On' : 'Off'}`}
          aria-label="Toggle loop"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 2l4 4-4 4" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <path d="M7 22l-4-4 4-4" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        </button>

        {/* Speed button */}
        <button
          style={speedBtnStyle}
          onClick={cycleSpeed}
          title={`Playback speed: ${SPEEDS[speedIndex].label} (click to cycle)`}
          aria-label={`Speed: ${SPEEDS[speedIndex].label}`}
        >
          {SPEEDS[speedIndex].label}
        </button>

        {/* Divider */}
        <div style={dividerStyle} />

        {/* Latest button */}
        <button
          style={{
            ...latestBtnStyle,
            opacity: isAtLatest ? 0.35 : 1,
            cursor: isAtLatest ? 'default' : 'pointer',
          }}
          onClick={jumpToLatest}
          disabled={isAtLatest}
          title="Jump to latest available date"
          aria-label="Jump to latest date"
        >
          Today
        </button>

        {/* Status indicator (fixed width to prevent layout shift) */}
        <div style={{ width: 18, height: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {reloading && !playing ? (
            <div style={spinnerInnerStyle} />
          ) : prefetchLoading > 0 ? (
            <div
              style={prefetchDotStyle}
              title={`Prefetching ${prefetchLoading} adjacent date${prefetchLoading > 1 ? 's' : ''}...`}
            />
          ) : null}
        </div>
      </div>

      {/* Custom styles for range input + spinner animation */}
      <style>{`
        @keyframes timeSliderSpin {
          to { transform: rotate(360deg) }
        }
        .ws-time-range::-webkit-slider-runnable-track {
          height: 4px;
          background: rgba(255,255,255,0.12);
          border-radius: 2px;
        }
        .ws-time-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          margin-top: -5px;
          background: var(--accent, #4FC3F7);
          border: none;
          border-radius: 50%;
          cursor: pointer;
          transition: transform 0.1s ease;
        }
        .ws-time-range::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }
        .ws-time-range::-moz-range-track {
          height: 4px;
          background: rgba(255,255,255,0.12);
          border-radius: 2px;
          border: none;
        }
        .ws-time-range::-moz-range-thumb {
          width: 14px;
          height: 14px;
          background: var(--accent, #4FC3F7);
          border: none;
          border-radius: 50%;
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}

// ── Styles ──

const wrapperStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 88,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 35,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  transition: 'opacity 0.3s ease, transform 0.3s ease',
}

const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 10px',
  background: 'rgba(10, 12, 18, 0.82)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  transition: 'border-color 0.3s ease',
  whiteSpace: 'nowrap',
}

const arrowBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  padding: 0,
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 6,
  color: 'rgba(255,255,255,0.7)',
  cursor: 'pointer',
  transition: 'background 0.15s ease, color 0.15s ease',
  flexShrink: 0,
}

const dateLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 110,
  height: 28,
  padding: '0 10px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 6,
  color: 'rgba(255,255,255,0.9)',
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition: 'background 0.15s ease',
  letterSpacing: 0.2,
}

const hiddenDateInputStyle: React.CSSProperties = {
  position: 'absolute',
  opacity: 0,
  width: 0,
  height: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
}

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 18,
  background: 'rgba(255,255,255,0.1)',
  margin: '0 4px',
  flexShrink: 0,
}

const rangeSliderStyle: React.CSSProperties = {
  width: 140,
  height: 28,
  appearance: 'none',
  WebkitAppearance: 'none',
  background: 'transparent',
  cursor: 'pointer',
  margin: 0,
  padding: 0,
  flexShrink: 0,
}

const playBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  padding: 0,
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 6,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  flexShrink: 0,
}

const speedBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 28,
  padding: '0 6px',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 6,
  color: 'rgba(255,255,255,0.5)',
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  letterSpacing: 0.2,
  flexShrink: 0,
  minWidth: 28,
}

const latestBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 28,
  padding: '0 10px',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 6,
  color: 'var(--accent, #4FC3F7)',
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition: 'background 0.15s ease, opacity 0.15s ease',
  letterSpacing: 0.3,
  textTransform: 'uppercase',
  flexShrink: 0,
}

const spinnerInnerStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  border: '2px solid rgba(255,255,255,0.1)',
  borderTopColor: 'var(--accent, #4FC3F7)',
  borderRadius: '50%',
  animation: 'timeSliderSpin 0.7s linear infinite',
}

const prefetchDotStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: 'var(--accent, #4FC3F7)',
  opacity: 0.5,
  animation: 'timeSliderSpin 2s linear infinite',
}
