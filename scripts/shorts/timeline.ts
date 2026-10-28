/**
 * 쇼츠 장면표(순수). 영상 시각 vt(s) → 어떤 장면인지, 그때 샷 시각이 몇 초인지.
 * 렌더 페이지(그림)와 assemble(공 소리)가 같은 표를 써야 소리와 그림이 맞는다.
 *
 * 「이게 들어가?」 구성 — 결말을 먼저 보여 주고 되감는다.
 *   hook     결정적 충돌 직전을 느리게           "이게 들어가?"
 *   rewind   빠르게 되감기                         ◀◀
 *   aim      치기 전 배치, 큐가 당겼다 나간다      경기 상황 · 세기 · 당점
 *   play     위에서, 실제 속도로 큐볼 길을 그으며  쿠션 카운터 · 쿠션 번호
 *   slow     마지막 쿠션 ~ 두 번째 적구를 3D로 느리게
 *   settle   공이 멈추는 쪽으로 조금 더
 *   miracle  1,000번 다시 쳐 본 결과
 * (2026-10-28 미리보기: 3D 부감은 세로 화면에서 테이블이 작아 9쿠션 길이 안 읽혔다 → 진행은 위에서 보기로, 3D는 클로즈업에만.)
 *   outro    랭큐에서 직접 쳐 보기
 */
export type SceneId = "hook" | "rewind" | "aim" | "play" | "slow" | "settle" | "miracle" | "outro";

export interface Scene {
    readonly id: SceneId;
    readonly start: number;
    readonly dur: number;
    /** 장면 시작 · 끝의 샷 시각(s). 같으면 멈춘 화면, 거꾸로면 되감기. */
    readonly shotFrom: number;
    readonly shotTo: number;
    /** 공 소리를 낼 장면인가(되감기 · 멈춘 화면 · 그래픽 장면은 무음). */
    readonly sound: boolean;
}

export interface TimelineInput {
    /** 두 번째 적구에 닿는 샷 시각(득점 순간). */
    readonly contact2: number;
    /** 마지막 쿠션 시각(두 번째 적구 전). */
    readonly lastCushion: number;
    /** 샷이 끝나는(모든 공 정지) 시각. */
    readonly duration: number;
}

export const FPS = 30;

/** 노래에 맞출 때. scoreAt = 득점 순간이 와야 할 영상 시각(곡의 외침), total = 영상 전체 길이(곡 길이). */
export interface FitOptions {
    readonly scoreAt?: number;
    readonly total?: number;
}

const SLOW_RATE = 0.4;

export function buildTimeline(f: TimelineInput, fit: FitOptions = {}): Scene[] {
    // 마지막 쿠션 0.6 s 전부터 느리게 — 단 득점 1.4 s 전보다 이르지 않게(마지막 쿠션 뒤 오래 구르는 샷은 슬로가 9초가 됐다)
    const slowFrom = Math.max(0, f.lastCushion - 0.6, f.contact2 - 1.4);
    const slowTo = Math.min(f.duration, f.contact2 + 0.25);
    const settleTo = Math.min(f.duration, slowTo + 1.2);
    let hook = 2.4, aim = 2.4, playSpeed = 1, miracle = 5.2, outro = 3.2;
    if (fit.scoreAt !== undefined) {
        // 득점 순간을 scoreAt 에 맞춘다: 치기 전(aim) 장면 길이로 먼저 맞추고, 모자라면 진행을 빠르게 한다
        const before = (h: number, a: number, sp: number) => h + 0.9 + a + slowFrom / sp + (f.contact2 - slowFrom) / SLOW_RATE;
        aim = Math.max(1.6, Math.min(5, aim + fit.scoreAt - before(hook, aim, 1)));
        const late = before(hook, aim, 1) - fit.scoreAt;
        if (late > 0.02) playSpeed = Math.min(2, slowFrom / Math.max(0.5, slowFrom - late));
        hook = Math.max(1.6, hook + fit.scoreAt - before(hook, aim, playSpeed));
    }
    const head = hook + 0.9 + aim + slowFrom / playSpeed + (slowTo - slowFrom) / SLOW_RATE + (settleTo - slowTo);
    if (fit.total !== undefined) {
        // 남는 시간을 1,000번 결과(6할)와 마무리(4할)에 나눈다
        const rest = Math.max(4.6, fit.total - head);
        miracle = Math.max(3, rest * 0.6);
        outro = rest - miracle;
    }
    const parts: [SceneId, number, number, number, boolean][] = [
        ["hook", hook, slowFrom, slowTo, false],
        ["rewind", 0.9, slowTo, 0, false],
        ["aim", aim, 0, 0, false],
        ["play", slowFrom / playSpeed, 0, slowFrom, true],
        ["slow", (slowTo - slowFrom) / SLOW_RATE, slowFrom, slowTo, true],
        ["settle", settleTo - slowTo, slowTo, settleTo, true],
        ["miracle", miracle, f.contact2, f.contact2, false],
        ["outro", outro, f.contact2, f.contact2, false],
    ];
    let t = 0;
    return parts.map(([id, dur, shotFrom, shotTo, sound]) => {
        const s = { id, start: t, dur, shotFrom, shotTo, sound };
        t += dur;
        return s;
    });
}

export function totalDuration(scenes: readonly Scene[]): number {
    const last = scenes[scenes.length - 1];
    return last.start + last.dur;
}

/** 영상 시각 → (장면, 장면 안 진행률 0..1, 샷 시각). 끝을 넘으면 마지막 장면의 끝. */
export function sceneAt(scenes: readonly Scene[], vt: number): { scene: Scene; p: number; shotT: number } {
    let scene = scenes[scenes.length - 1];
    for (const s of scenes) if (vt < s.start + s.dur) { scene = s; break; }
    const p = Math.max(0, Math.min(1, (vt - scene.start) / scene.dur));
    return { scene, p, shotT: scene.shotFrom + (scene.shotTo - scene.shotFrom) * p };
}

/** 샷 시각 ts 가 소리 나는 장면의 어느 영상 시각들에 놓이는지(공 소리 배치용). */
export function videoTimesOfShotTime(scenes: readonly Scene[], ts: number): number[] {
    const out: number[] = [];
    for (const s of scenes) {
        if (!s.sound || s.shotTo <= s.shotFrom) continue;
        if (ts < s.shotFrom || ts >= s.shotTo) continue;
        out.push(s.start + (ts - s.shotFrom) / (s.shotTo - s.shotFrom) * s.dur);
    }
    return out;
}

/** 장면별 자막 · 음성에 쓸 수 있는 길이(대본 글자 수 예산용). */
export function narrationSlots(scenes: readonly Scene[]): { id: SceneId; start: number; dur: number }[] {
    return scenes.map((s) => ({ id: s.id, start: Math.round(s.start * 100) / 100, dur: Math.round(s.dur * 100) / 100 }));
}
