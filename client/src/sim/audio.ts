/**
 * 시뮬레이터 효과음. 샘플 파일 없이 세 가지 소리(큐 타격·공–공·쿠션)를 절차적으로 합성해 AudioBuffer 로
 * 한 번만 만들어 두고(지연 생성), 재생 시각에 AudioBufferSourceNode 로 예약한다.
 *  - 소리는 물리 이벤트 시각에 정확히 나도록 ctx.currentTime 기준으로 미리 예약한다(재생 루프에서 재감지하지 않음).
 *  - 게인은 접근 속도의 지각 곡선(audioMapping.impulseToGain), 피치는 ±5% 를 이벤트 인덱스로 결정론적으로 흔든다.
 *  - AudioContext 는 앱의 useGameAudio 가 제스처로 잠금 해제한 것을 넘겨받아 공유한다(모바일 웹뷰는 컨텍스트 수 제한).
 *  - iOS: navigator.audioSession.type = 'playback' 을 시도해 무음 스위치 상태에서도 소리가 나게 한다(지원 시).
 * 합성 자체는 결정론이 필요 없지만 Math.random 을 쓰지 않아 기기마다 같은 소리가 난다.
 */
import { impulseToGain, playbackRateFor, type SoundEvent, type SoundKind } from "./audioMapping";

export type { SoundEvent, SoundKind } from "./audioMapping";

/** 결정론 노이즈 (xorshift32). 샘플 하나당 [-1, 1]. */
function makeNoise(seed: number): () => number {
    let s = seed | 0 || 1;
    return () => {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        return ((s >>> 0) / 4294967295) * 2 - 1;
    };
}

/** 1극 저역 통과 필터 계수. */
function lowpass(sampleRate: number, cutoffHz: number) {
    const a = Math.exp(-2 * Math.PI * cutoffHz / sampleRate);
    let y = 0;
    return (x: number) => (y = (1 - a) * x + a * y);
}

/** 1극 고역 통과 필터. */
function highpass(sampleRate: number, cutoffHz: number) {
    const a = Math.exp(-2 * Math.PI * cutoffHz / sampleRate);
    let y = 0, px = 0;
    return (x: number) => { y = a * (y + x - px); px = x; return y; };
}

/** 소리 한 종류를 Float32Array 로 렌더. length 초, sampleRate Hz. */
export function renderSound(kind: SoundKind, sampleRate: number): Float32Array {
    const dur = kind === "strike" ? 0.08 : kind === "ball" ? 0.035 : 0.12;
    const n = Math.max(1, Math.round(dur * sampleRate));
    const out = new Float32Array(n);
    const noise = makeNoise(kind === "strike" ? 0x5eed1 : kind === "ball" ? 0x5eed2 : 0x5eed3);
    const dt = 1 / sampleRate;

    if (kind === "strike") {
        // 가죽 팁이 페놀 공을 때리는 소리: 중고역 노이즈 펄스 + 낮은 쿵.
        const hp = highpass(sampleRate, 900);
        const lp = lowpass(sampleRate, 4500);
        for (let i = 0; i < n; i++) {
            const t = i * dt;
            const burst = lp(hp(noise())) * Math.exp(-t / 0.007) * 1.6;
            const f = 70 + 60 * Math.exp(-t / 0.01);
            const thump = Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.028) * 0.7;
            out[i] = burst + thump;
        }
    } else if (kind === "ball") {
        // 공–공 클릭: 아주 짧고 밝은 노이즈 + 2 kHz 대 감쇠 사인 두 개(부분음).
        const hp = highpass(sampleRate, 2500);
        for (let i = 0; i < n; i++) {
            const t = i * dt;
            const burst = hp(noise()) * Math.exp(-t / 0.0015) * 1.2;
            const p1 = Math.sin(2 * Math.PI * 2150 * t) * Math.exp(-t / 0.006) * 0.55;
            const p2 = Math.sin(2 * Math.PI * 4700 * t) * Math.exp(-t / 0.0028) * 0.3;
            out[i] = burst + p1 + p2;
        }
    } else {
        // 쿠션: 낮고 부드럽고 길다. 저역 노이즈 + 고무 진동 감쇠 사인.
        const lp = lowpass(sampleRate, 700);
        for (let i = 0; i < n; i++) {
            const t = i * dt;
            const burst = lp(noise()) * Math.exp(-t / 0.018) * 2.2;
            const f = 120 + 60 * Math.exp(-t / 0.02);
            const body = Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.04) * 0.6;
            out[i] = burst + body;
        }
    }

    // 피크 정규화 → 게인은 재생 시 impulseToGain 이 결정.
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
    if (peak > 0) for (let i = 0; i < n; i++) out[i] /= peak;
    // 끝 2 ms 페이드로 클릭 방지
    const fade = Math.min(n, Math.round(0.002 * sampleRate));
    for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
    return out;
}

interface Scheduled {
    readonly source: AudioBufferSourceNode;
    readonly gain: GainNode;
}

export class SimAudio {
    private buffers = new Map<SoundKind, AudioBuffer>();
    private bufferCtx: AudioContext | null = null;
    private master: GainNode | null = null;
    private live: Scheduled[] = [];
    private muted = false;
    private sessionTried = false;

    constructor(private readonly getContext: () => AudioContext | null) {}

    /** 컨텍스트가 바뀌면(드물지만) 버퍼·마스터 게인을 새로 만든다. */
    private ctx(): AudioContext | null {
        let ctx: AudioContext | null = null;
        try { ctx = this.getContext(); } catch { return null; }
        if (!ctx) return null;
        if (this.bufferCtx !== ctx) {
            this.buffers.clear();
            this.bufferCtx = ctx;
            this.master = ctx.createGain();
            this.master.gain.value = this.muted ? 0 : 1;
            this.master.connect(ctx.destination);
        }
        this.tryAudioSession();
        return ctx;
    }

    /** iOS 17+ WebKit: 무음 스위치를 무시하는 'playback' 세션. 기능 감지로만 시도. */
    private tryAudioSession(): void {
        if (this.sessionTried) return;
        this.sessionTried = true;
        try {
            const session = (navigator as unknown as { audioSession?: { type?: string } }).audioSession;
            if (session && typeof session === "object" && "type" in session) session.type = "playback";
        } catch { /* 미지원 */ }
    }

    private buffer(ctx: AudioContext, kind: SoundKind): AudioBuffer {
        let buf = this.buffers.get(kind);
        if (!buf) {
            const data = renderSound(kind, ctx.sampleRate);
            buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
            buf.copyToChannel(data, 0);
            this.buffers.set(kind, buf);
        }
        return buf;
    }

    /**
     * 소리들을 예약한다. startAt 은 AudioContext 시간(ctx.currentTime 기준, s)으로 재생 t=0 에 해당하는 시각.
     * 이미 지난 시각의 이벤트는 즉시 재생된다(start 는 과거 시각을 '지금'으로 취급).
     */
    schedule(events: readonly SoundEvent[], startAt: number): void {
        const ctx = this.ctx();
        if (!ctx || !this.master) return;
        if (ctx.state === "suspended") {
            // resume() 은 제스처 전이면 비동기로 거부된다 — 미처리 거부(unhandledrejection)를 남기지 않는다.
            try { Promise.resolve(ctx.resume()).catch(() => { /* 제스처 전 */ }); } catch { /* noop */ }
        }
        events.forEach((ev, i) => {
            const g = impulseToGain(ev.impulse, ev.kind);
            if (g <= 0) return;
            try {
                const source = ctx.createBufferSource();
                source.buffer = this.buffer(ctx, ev.kind);
                source.playbackRate.value = playbackRateFor(ev.kind, ev.impulse, i);
                const gain = ctx.createGain();
                gain.gain.value = g;
                source.connect(gain);
                gain.connect(this.master!);
                const entry: Scheduled = { source, gain };
                source.onended = () => {
                    this.live = this.live.filter(s => s !== entry);
                    try { source.disconnect(); gain.disconnect(); } catch { /* noop */ }
                };
                source.start(Math.max(ctx.currentTime, startAt + ev.t));
                this.live.push(entry);
            } catch { /* 노드 생성 실패는 조용히 넘긴다 */ }
        });
    }

    /** 아직 울리지 않은 예약을 포함해 모두 멈춘다. */
    cancel(): void {
        for (const { source, gain } of this.live) {
            try { source.onended = null; source.stop(); } catch { /* 이미 끝났거나 시작 전 */ }
            try { source.disconnect(); gain.disconnect(); } catch { /* noop */ }
        }
        this.live = [];
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        if (this.master) this.master.gain.value = muted ? 0 : 1;
    }

    isMuted(): boolean {
        return this.muted;
    }

    /** 예약 취소 + 그래프 해제. 컨텍스트는 공유물이므로 닫지 않는다. */
    dispose(): void {
        this.cancel();
        try { this.master?.disconnect(); } catch { /* noop */ }
        this.master = null;
        this.buffers.clear();
        this.bufferCtx = null;
    }
}
