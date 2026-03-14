/**
 * Sound effects engine.
 *
 * Uses Web Audio API for procedural sounds (no audio files needed).
 * Three channels: effects, ambient, music. Each independently controllable.
 * Global mute on M key.
 */

let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null
let effectsGain: GainNode | null = null
let muted = false
let effectsVolume = 0.6

/**
 * Ensure the AudioContext is created and running.
 * Must be called from a user gesture (click, keydown) for Chrome autoplay policy.
 */
async function ensureCtx(): Promise<AudioContext> {
  if (!audioCtx) {
    audioCtx = new AudioContext()
    masterGain = audioCtx.createGain()
    masterGain.connect(audioCtx.destination)
    effectsGain = audioCtx.createGain()
    effectsGain.gain.value = effectsVolume
    effectsGain.connect(masterGain)
  }

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume()
  }

  return audioCtx
}

/**
 * Synchronous context getter for internal use.
 * Call ensureCtx() first from the user gesture handler to guarantee it's running.
 */
function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
    masterGain = audioCtx.createGain()
    masterGain.connect(audioCtx.destination)
    effectsGain = audioCtx.createGain()
    effectsGain.gain.value = effectsVolume
    effectsGain.connect(masterGain)
  }
  return audioCtx
}

function getEffectsGain(): GainNode {
  getCtx()
  return effectsGain!
}

/** Toggle global mute. Returns new muted state. */
export function toggleMute(): boolean {
  muted = !muted
  if (masterGain) {
    masterGain.gain.value = muted ? 0 : 1
  }
  return muted
}

export function isMuted(): boolean {
  return muted
}

export function setEffectsVolume(vol: number): void {
  effectsVolume = Math.max(0, Math.min(1, vol))
  if (effectsGain) {
    effectsGain.gain.value = effectsVolume
  }
}

/**
 * Warm up the audio system. Call this on the first user interaction
 * (click, keydown) to ensure the AudioContext is ready before playing sounds.
 */
export async function warmUp(): Promise<void> {
  await ensureCtx()
}

// --- Procedural sound effects ---

/** Snap sound (command submitted). Short noise burst through a highpass filter. */
export function playSnap(): void {
  const ctx = getCtx()
  if (ctx.state !== 'running') return

  const bufferSize = ctx.sampleRate * 0.03
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.003))
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer

  const filter = ctx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 1000

  const gain = ctx.createGain()
  gain.gain.value = 0.5

  source.connect(filter)
  filter.connect(gain)
  gain.connect(getEffectsGain())
  source.start()
}

/** Data ready tone. Sine 307→310Hz, 0.8s, vol 0.3. */
export function playSuccess(): void {
  const ctx = getCtx()
  if (ctx.state !== 'running') return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(307, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(310, ctx.currentTime + 0.8)

  gain.gain.setValueAtTime(0.3, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)

  osc.connect(gain)
  gain.connect(getEffectsGain())
  osc.start()
  osc.stop(ctx.currentTime + 0.85)
}

/** Soft whoosh (camera movement / fly-to) */
export function playWhoosh(): void {
  const ctx = getCtx()
  if (ctx.state !== 'running') return

  const bufferSize = ctx.sampleRate * 0.4
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(2000, ctx.currentTime)
  filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.3)
  filter.Q.value = 1.0

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.2, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(getEffectsGain())
  source.start()
}

/** Thunder rumble (toggle on/off). Short filtered noise burst with fast decay. */
export function playPing(): void {
  const ctx = getCtx()
  if (ctx.state !== 'running') return

  const dur = 0.4
  const bufferSize = ctx.sampleRate * dur
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08))
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(300, ctx.currentTime)
  filter.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + dur)
  filter.Q.value = 0.3

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.35, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(getEffectsGain())
  source.start()
}

/** Low tone (error or "not found") */
export function playError(): void {
  const ctx = getCtx()
  if (ctx.state !== 'running') return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(300, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.2)

  gain.gain.setValueAtTime(0.25, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28)

  osc.connect(gain)
  gain.connect(getEffectsGain())
  osc.start()
  osc.stop(ctx.currentTime + 0.3)
}

// ============================================
// Flight sound: continuous wind/engine hum
// that reacts to camera velocity in real time.
//
// Architecture:
//   white noise -> bandpass filter -> gain -> effectsGain -> master -> speakers
//   The filter frequency and gain are updated every frame based on speed.
//   Low speed = low frequency rumble, high speed = higher-pitched wind.
// ============================================

let flightPlaying = false
let flightCooldownUntil = 0

/**
 * Fire a one-shot low rumble (1.5s). Lowpass white noise at 191Hz, Q 0.7, vol 0.42.
 * Triggered once when movement starts, plays to completion, ignores further calls until done.
 */
function fireRumble(): void {
  const ctx = getCtx()
  if (ctx.state !== 'running') return

  flightPlaying = true
  const dur = 1.5

  const bufferSize = ctx.sampleRate * dur
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 191
  filter.Q.value = 0.7

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.42, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(getEffectsGain())
  source.start()
  source.onended = () => {
    flightPlaying = false
    flightCooldownUntil = performance.now() + 2000 // 2s cooldown after rumble ends
  }
}

/**
 * Called every frame from the render loop. Fires a single rumble
 * when movement begins; ignores calls while the rumble is still playing.
 */
export function updateFlightSound(speed: number): void {
  if (speed > 0.001 && !flightPlaying && performance.now() > flightCooldownUntil) {
    fireRumble()
  }
}

/** No-op (kept for API compatibility). */
export function stopFlightSound(): void {
  flightPlaying = false
}
