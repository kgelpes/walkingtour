import type { Clip } from './types';

/** What the listener's own music (Spotify, Apple Music…) does while a story plays. */
export type MusicMode = 'pause' | 'lower' | 'full';

export interface PlayerState {
  clip: Clip | null;
  playing: boolean;
  loading: boolean;
  time: number;
  duration: number;
  /** play() was refused by the browser (autoplay policy); needs a tap. */
  blocked: boolean;
}

/** 0.05 s of silence, used to unlock the audio element inside a user gesture. */
function silentWav(): string {
  const n = 1200;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 24000, true); v.setUint32(28, 48000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/**
 * One <audio> element for the whole session. Mobile browsers only let a page
 * start audio without a tap once that element has been played inside a tap,
 * so `unlock()` must run in the Start button's click handler; after that the
 * geofence can start narration on its own.
 */
export class Narrator {
  readonly el = new Audio();
  private ctx: AudioContext | null = null;
  private listeners = new Set<(s: PlayerState) => void>();
  private endedListeners = new Set<(clip: Clip, completed: boolean) => void>();
  private silent = '';
  private unlocked = false;
  private baseUrl = '';
  private speaking = false; // speechSynthesis fallback active
  state: PlayerState = { clip: null, playing: false, loading: false, time: 0, duration: 0, blocked: false };
  artwork = '';
  album = '';
  /**
   * The listener's own music keeps playing by default: lowered while a story
   * plays, like navigation directions ('lower'), left as is ('full'), or
   * paused ('pause'). Uses the Audio Session API (Safari 16.4+); elsewhere the
   * browser decides.
   */
  private music: MusicMode = 'lower';
  private volume = 1;
  private gain: GainNode | null = null;

  static get canMixWithMusic(): boolean {
    return 'audioSession' in navigator;
  }

  setMusic(mode: MusicMode) {
    this.music = mode;
    this.setSession(this.state.playing);
  }

  private setSession(speaking: boolean) {
    const session = (navigator as any).audioSession;
    if (!session) return;
    try {
      session.type = this.music === 'pause' ? 'auto' : this.music === 'lower' && speaking ? 'transient' : 'ambient';
    } catch { /* unsupported type */ }
  }

  /**
   * Story volume, 0–2. Above 1 it's a boost (through a limiter), so a story can
   * stand out over music the system only lowers a little. Also scales the chime.
   */
  setVolume(v: number) {
    this.volume = v;
    this.el.volume = Math.min(1, v);
    // A boost needs Web Audio, and so does iOS, which ignores <audio>.volume (it stays 1).
    if (!this.gain && (v > 1 || Math.abs(this.el.volume - v) > 0.01)) this.routeThroughGain();
    if (this.gain) {
      this.el.volume = 1;
      this.gain.gain.value = v;
    }
  }

  private routeThroughGain() {
    this.ensureContext();
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const gain = ctx.createGain();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.1;
      ctx.createMediaElementSource(this.el).connect(gain).connect(limiter).connect(ctx.destination);
      this.gain = gain;
    } catch { /* stays at the element's own volume */ }
  }

  constructor() {
    this.el.preload = 'auto';
    this.el.setAttribute('playsinline', '');
    const sync = () => this.set({
      playing: !this.el.paused && !this.el.ended,
      time: this.el.currentTime,
      duration: Number.isFinite(this.el.duration) ? this.el.duration : this.state.clip?.duration ?? 0,
    });
    for (const ev of ['play', 'pause', 'timeupdate', 'durationchange', 'seeked']) this.el.addEventListener(ev, sync);
    this.el.addEventListener('playing', () => this.set({ loading: false, blocked: false }));
    this.el.addEventListener('waiting', () => this.set({ loading: true }));
    this.el.addEventListener('pause', () => this.setSession(false));
    this.el.addEventListener('ended', () => {
      sync();
      const clip = this.state.clip;
      if (clip && this.el.src !== this.silent) this.endedListeners.forEach((f) => f(clip, true));
    });
    this.el.addEventListener('error', () => {
      if (!this.state.clip || this.el.src === this.silent || !this.el.src) return;
      this.speakFallback(this.state.clip);
    });
    this.setupMediaSession();
  }

  subscribe(f: (s: PlayerState) => void) {
    this.listeners.add(f);
    f(this.state);
    return () => this.listeners.delete(f);
  }

  onEnded(f: (clip: Clip, completed: boolean) => void) {
    this.endedListeners.add(f);
    return () => this.endedListeners.delete(f);
  }

  private set(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((f) => f(this.state));
    if ('mediaSession' in navigator && this.state.clip) {
      navigator.mediaSession.playbackState = this.state.playing ? 'playing' : 'paused';
      const d = this.state.duration;
      if (d > 0 && this.state.time <= d) {
        try {
          navigator.mediaSession.setPositionState({ duration: d, position: this.state.time, playbackRate: 1 });
        } catch { /* some browsers reject during load */ }
      }
    }
  }

  /** Call synchronously inside a user gesture. Safe to call repeatedly. */
  unlock() {
    this.ensureContext();
    if (this.unlocked) return;
    this.unlocked = true;
    if (!this.state.clip) {
      this.silent ||= silentWav();
      this.el.src = this.silent;
      this.setSession(false);
      this.el.play().catch((e) => { if (e.name === 'NotAllowedError') this.unlocked = false; });
    }
  }

  private ensureContext() {
    try {
      this.ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { /* no Web Audio: chime is skipped */ }
  }

  setBase(url: string) {
    this.baseUrl = url;
  }

  /**
   * Load a clip and (optionally) start it. Resolves false if the browser
   * blocked playback, in which case `state.blocked` is set for the UI.
   */
  async play(clip: Clip, { from = 0, autoplay = true } = {}): Promise<boolean> {
    this.cancelSpeech();
    const src = clip.audio ? new URL(clip.audio, this.baseUrl).href : '';
    const same = this.state.clip?.id === clip.id && this.el.src === src;
    const prev = this.state.clip;
    if (prev && prev.id !== clip.id && this.state.playing) this.endedListeners.forEach((f) => f(prev, false));
    this.set({ clip, blocked: false, time: same ? this.el.currentTime : from, duration: clip.duration ?? 0, loading: autoplay });
    this.updateMetadata(clip);
    if (!src) {
      if (autoplay) this.speakFallback(clip);
      return true;
    }
    if (!same) {
      this.el.src = src;
      if (from > 0) {
        const seek = () => { this.el.currentTime = from; };
        if (this.el.readyState >= 1) seek();
        else this.el.addEventListener('loadedmetadata', seek, { once: true });
      }
    }
    if (!autoplay) {
      this.set({ loading: false });
      if (!same) this.el.load();
      return true;
    }
    try {
      this.setSession(true);
      if (this.gain) this.ensureContext();
      await this.el.play();
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return true; // superseded by another play()
      this.set({ blocked: true, loading: false, playing: false });
      return false;
    }
  }

  toggle() {
    this.unlock();
    if (this.speaking) {
      if (speechSynthesis.paused) speechSynthesis.resume(); else speechSynthesis.pause();
      this.set({ playing: !speechSynthesis.paused });
      return;
    }
    if (!this.state.clip) return;
    if (this.el.paused) {
      if (this.el.ended) this.el.currentTime = 0;
      this.setSession(true);
      this.el.play().then(
        () => this.set({ blocked: false }),
        () => this.set({ blocked: true }),
      );
    } else this.el.pause();
  }

  pause() {
    if (this.speaking) speechSynthesis.pause();
    this.el.pause();
  }

  seek(t: number) {
    if (!this.state.clip || this.speaking) return;
    const d = this.state.duration || this.el.duration || 0;
    this.el.currentTime = Math.max(0, Math.min(d ? d - 0.25 : t, t));
    this.set({ time: this.el.currentTime });
  }

  skip(delta: number) {
    this.seek(this.el.currentTime + delta);
  }

  /** A soft two-note temple bell, played on arrival. */
  chime(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return Promise.resolve();
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.35 * Math.min(1, this.volume);
    out.connect(ctx.destination);
    const strike = (freq: number, at: number) => {
      for (const [mult, amp, decay] of [[1, 1, 2.2], [2.76, 0.35, 1.2], [5.4, 0.12, 0.6]]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq * mult;
        g.gain.setValueAtTime(0.0001, now + at);
        g.gain.exponentialRampToValueAtTime(amp, now + at + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, now + at + decay);
        o.connect(g).connect(out);
        o.start(now + at);
        o.stop(now + at + decay + 0.05);
      }
    };
    strike(880, 0);
    strike(659.25, 0.28);
    return new Promise((r) => setTimeout(r, 1100));
  }

  private speakFallback(clip: Clip) {
    if (!('speechSynthesis' in window)) {
      this.set({ blocked: false, loading: false, playing: false });
      return;
    }
    this.cancelSpeech();
    const u = new SpeechSynthesisUtterance(clip.text);
    u.lang = 'en-GB';
    u.rate = 0.95;
    u.volume = Math.min(1, this.volume);
    this.speaking = true;
    u.onend = () => {
      if (!this.speaking) return;
      this.speaking = false;
      this.set({ playing: false });
      this.endedListeners.forEach((f) => f(clip, true));
    };
    speechSynthesis.speak(u);
    this.set({ playing: true, loading: false, blocked: false });
  }

  private cancelSpeech() {
    if (this.speaking) {
      this.speaking = false;
      speechSynthesis.cancel();
    }
  }

  private updateMetadata(clip: Clip) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: clip.title,
      artist: this.album,
      album: 'Audio walking tour',
      artwork: this.artwork ? [{ src: this.artwork, sizes: '512x512', type: 'image/png' }] : [],
    });
  }

  private setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const h = (a: MediaSessionAction, f: MediaSessionActionHandler) => {
      try { ms.setActionHandler(a, f); } catch { /* unsupported action */ }
    };
    h('play', () => this.toggle());
    h('pause', () => this.pause());
    h('seekbackward', (d) => this.skip(-(d.seekOffset ?? 15)));
    h('seekforward', (d) => this.skip(d.seekOffset ?? 15));
    h('seekto', (d) => d.seekTime != null && this.seek(d.seekTime));
  }
}
