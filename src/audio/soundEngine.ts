/**
 * Proceduralny silnik dźwiękowy Web Audio API dla aplikacji Czarna Woda (Projekt DRAGON EYE).
 * Generuje realistyczne stuknięcia w szkło, plusk gęstej wody, akord magicznego blasku i głęboki pomruk smoka.
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;

  public async unlock(): Promise<void> {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // Ignore if browser restricts audio resume
      }
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private ensureReady(): AudioContext | null {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  /**
   * Szlachetny, krótki, czysty rezonans uderzenia mosiądzu lub srebra o kryształową ściankę
   * (wysokie składowe harmoniczne + subtelny pogłos).
   */
  public playGlassTap(intensity = 0.7): void {
    const ctx = this.ensureReady();
    if (!ctx) return;

    const now = ctx.currentTime;
    const vol = Math.min(1, Math.max(0.18, intensity));

    // Szlachetne składowe metaliczne mosiądzu / srebra
    const baseFreq = 1680 + Math.random() * 140;
    const partials = [
      { ratio: 1.0, amp: 0.11, decay: 0.24 },
      { ratio: 2.0, amp: 0.065, decay: 0.16 },
      { ratio: 2.756, amp: 0.045, decay: 0.12 },
      { ratio: 4.12, amp: 0.025, decay: 0.08 },
    ];

    const dryBus = ctx.createGain();
    dryBus.gain.value = vol;
    dryBus.connect(ctx.destination);

    // Subtelny pogłos (krótki delay z filtrowanym sprzężeniem)
    const delay = ctx.createDelay(0.2);
    delay.delayTime.value = 0.058;
    const echoFilter = ctx.createBiquadFilter();
    echoFilter.type = 'lowpass';
    echoFilter.frequency.value = 3400;
    const echoGain = ctx.createGain();
    echoGain.gain.value = 0.24 * vol;

    dryBus.connect(delay);
    delay.connect(echoFilter);
    echoFilter.connect(echoGain);
    echoGain.connect(ctx.destination);

    partials.forEach((p) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * p.ratio, now);

      gain.gain.setValueAtTime(0.0005, now);
      gain.gain.linearRampToValueAtTime(p.amp, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0002, now + p.decay);

      osc.connect(gain);
      gain.connect(dryBus);
      osc.start(now);
      osc.stop(now + p.decay + 0.02);
    });

    // Krótki impuls samego styku metalu z kryształem
    const strikeOsc = ctx.createOscillator();
    const strikeGain = ctx.createGain();
    strikeOsc.type = 'triangle';
    strikeOsc.frequency.setValueAtTime(520, now);
    strikeOsc.frequency.exponentialRampToValueAtTime(190, now + 0.024);

    strikeGain.gain.setValueAtTime(0.001, now);
    strikeGain.gain.linearRampToValueAtTime(0.06 * vol, now + 0.0015);
    strikeGain.gain.exponentialRampToValueAtTime(0.0002, now + 0.028);

    strikeOsc.connect(strikeGain);
    strikeGain.connect(ctx.destination);
    strikeOsc.start(now);
    strikeOsc.stop(now + 0.032);
  }

  /**
   * Delikatne, stłumione stuknięcie podwodnej kuli od spodu tafli.
   */
  public playOrbTap(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1320 + Math.random() * 180, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.065);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.055, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0004, now + 0.085);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  /**
   * Plusk gęstej, czarnej wody przy budzeniu kompasu lub ucieczce w głębinę.
   */
  public playSplash(intensity = 0.85): void {
    const ctx = this.ensureReady();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const vol = Math.min(1.1, Math.max(0.25, intensity));

    // Szum rozbryzgu filtrowany pasmowo
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1150, now);
    filter.frequency.exponentialRampToValueAtTime(280, now + 0.38);
    filter.Q.value = 1.6;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.22 * vol, now + 0.025);
    noiseGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.44);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.46);

    // Głęboki podwodny "blup"
    const bubble = ctx.createOscillator();
    const bubbleGain = ctx.createGain();
    bubble.type = 'sine';
    bubble.frequency.setValueAtTime(145, now);
    bubble.frequency.exponentialRampToValueAtTime(340, now + 0.14);
    bubble.frequency.exponentialRampToValueAtTime(95, now + 0.3);

    bubbleGain.gain.setValueAtTime(0.001, now);
    bubbleGain.gain.linearRampToValueAtTime(0.18 * vol, now + 0.02);
    bubbleGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.32);

    bubble.connect(bubbleGain);
    bubbleGain.connect(ctx.destination);
    bubble.start(now);
    bubble.stop(now + 0.34);
  }

  /**
   * Ciepły, czarodziejski dźwięk bursztynowego blasku po 3 radosnych stuknięciach.
   */
  public playMagicGlow(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = [293.66, 440.0, 659.25]; // D4, A4, E5
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.045);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.045);
      gain.gain.linearRampToValueAtTime(0.045, now + idx * 0.045 + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0003, now + 1.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.045);
      osc.stop(now + 1.4);
    });
  }

  /**
   * Głęboki, niski jęk / pomruk smoczego oka (Easter Egg Dragon Eye).
   */
  public playDragonGroan(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Warstwa 1: niski gardłowy pomruk piłokształtny
    const growl1 = ctx.createOscillator();
    growl1.type = 'sawtooth';
    growl1.frequency.setValueAtTime(64, now);
    growl1.frequency.linearRampToValueAtTime(52, now + 0.35);
    growl1.frequency.exponentialRampToValueAtTime(34, now + 1.45);

    // Warstwa 2: sub-basowe dudnienie
    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(48, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 1.5);

    // Modulacja LFO drgania strun głosowych gada
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(19, now);
    lfo.frequency.linearRampToValueAtTime(11, now + 1.4);
    lfoGain.gain.value = 8;
    lfo.connect(lfoGain);
    lfoGain.connect(growl1.frequency);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(240, now);
    lowpass.frequency.linearRampToValueAtTime(420, now + 0.25);
    lowpass.frequency.exponentialRampToValueAtTime(110, now + 1.5);
    lowpass.Q.value = 3.8;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.36, now + 0.14);
    masterGain.gain.setValueAtTime(0.32, now + 0.55);
    masterGain.gain.exponentialRampToValueAtTime(0.0005, now + 1.6);

    growl1.connect(lowpass);
    sub.connect(lowpass);
    lowpass.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Oddechowy szum w tle pomruku
    if (this.noiseBuffer) {
      const breath = ctx.createBufferSource();
      breath.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(180, now);
      bp.Q.value = 2.2;
      const bgain = ctx.createGain();
      bgain.gain.setValueAtTime(0.001, now);
      bgain.gain.linearRampToValueAtTime(0.14, now + 0.2);
      bgain.gain.exponentialRampToValueAtTime(0.0005, now + 1.45);
      breath.connect(bp);
      bp.connect(bgain);
      bgain.connect(ctx.destination);
      breath.start(now);
      breath.stop(now + 1.5);
    }

    lfo.start(now);
    growl1.start(now);
    sub.start(now);

    lfo.stop(now + 1.6);
    growl1.stop(now + 1.6);
    sub.stop(now + 1.6);
  }

  private murmurSource: AudioBufferSourceNode | null = null;
  private murmurGain: GainNode | null = null;

  /**
   * Cichy szum głębiny po zanurzeniu kompasu (po 15s bezruchu).
   */
  public startAbyssMurmur(): void {
    const ctx = this.ensureReady();
    if (!ctx || !this.noiseBuffer || this.murmurSource) return;

    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(145, now);
    filter.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.028, now + 1.4);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);

    this.murmurSource = src;
    this.murmurGain = gain;
  }

  public stopAbyssMurmur(): void {
    if (!this.murmurSource || !this.ctx) {
      this.murmurSource = null;
      this.murmurGain = null;
      return;
    }
    const now = this.ctx.currentTime;
    const src = this.murmurSource;
    const gain = this.murmurGain;
    this.murmurSource = null;
    this.murmurGain = null;

    if (gain) {
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      } catch {
        // Ignore
      }
    }
    setTimeout(() => {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignore
      }
    }, 320);
  }
}

export const soundEngine = new SoundEngine();
