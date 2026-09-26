/**
 * 크루 자동 브랜드(2026-09-26 크루 디자인 A안, 오너 승인 시안). 사진을 안 올린 크루가 대부분이라 홈이 흐린 글자 하나로 비어
 * 보였다 — 크루 id 로 색과 그림을 정해 크루마다 다른 엠블럼·커버를 만든다. 같은 크루는 언제나 같은 색·같은 공 배치다.
 * React·DOM 없는 순수 계산만 둔다(테스트 동반). 그리기는 client/src/components/hiq/crew-ui/brand.tsx.
 */

/** 문자열 → 32비트 부호 없는 해시(FNV-1a). 같은 입력이면 늘 같은 값. */
export function crewSeed(key: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

/**
 * 엠블럼 그라데이션 팔레트. 흰 글자(첫 글자)가 또렷하도록 모두 중간~진한 색이다(대비 4.5:1 이상).
 * 당구공 빨강·파랑·보라·청록·주황·남색·자주·초록 — 브랜드 초록과 겹치지 않게 초록은 하나만 둔다.
 */
export const CREW_PALETTE: readonly (readonly [string, string])[] = [
    ["#e2573f", "#b8331f"], // 빨강
    ["#3f7ae0", "#2a54b0"], // 파랑
    ["#9b5de5", "#6a3fb5"], // 보라
    ["#1a9aa0", "#10727a"], // 청록
    ["#e0822e", "#b85e14"], // 주황
    ["#3d4f8f", "#27335f"], // 남색
    ["#c2417a", "#94285a"], // 자주
    ["#3c9a4a", "#23702f"], // 초록
];

export function crewColors(id: string): readonly [string, string] {
    return CREW_PALETTE[crewSeed(id) % CREW_PALETTE.length];
}

/** 크루 이름의 첫 글자(대문자). 비어 있으면 "?" */
export function crewInitial(name: string | null | undefined): string {
    const c = (name ?? "").trim().charAt(0);
    return c ? c.toUpperCase() : "?";
}

export interface CoverBall {
    readonly id: "white" | "yellow" | "red";
    /** 0..1 비율 좌표(커버 너비·높이 기준) */
    readonly x: number;
    readonly y: number;
}

/**
 * 당구 커버의 공 세 개 배치 — 크루마다 다르게, 오른쪽 절반에(왼쪽 아래는 엠블럼 자리라 비운다).
 * 공끼리 겹치지 않도록 최소 거리를 지킨다. 결정적(같은 id → 같은 배치).
 */
export function coverBalls(id: string): readonly CoverBall[] {
    let s = crewSeed(id) || 1;
    const rnd = () => {
        // xorshift32
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        return s / 0x100000000;
    };
    const ids: CoverBall["id"][] = ["red", "yellow", "white"];
    const out: CoverBall[] = [];
    for (const bid of ids) {
        let best: CoverBall = { id: bid, x: 0.55, y: 0.5 };
        for (let tries = 0; tries < 20; tries++) {
            const cand = { id: bid, x: 0.45 + rnd() * 0.47, y: 0.28 + rnd() * 0.55 };
            if (out.every((b) => Math.hypot((b.x - cand.x) * 2, b.y - cand.y) > 0.28)) { best = cand; break; }
            best = cand;
        }
        out.push(best);
    }
    return out;
}

/** 개설일부터 오늘까지 며칠(1일부터 센다). 날짜가 이상하면 null. */
export function daysTogether(createdAt: string | Date | null | undefined, now = Date.now()): number | null {
    if (!createdAt) return null;
    const t = new Date(createdAt).getTime();
    if (!Number.isFinite(t) || t > now) return null;
    return Math.floor((now - t) / 86_400_000) + 1;
}

/** 크루 활동 요약(서버 GET /crews·/crews/mine·/crews/:id 의 pulse). 옛 응답엔 없을 수 있다. */
export interface CrewPulseLite {
    readonly nextActivityAt?: string | null;
    readonly monthActivities?: number;
    readonly activities30?: number;
    readonly upcomingWeek?: boolean;
    readonly posts7?: number;
}

/** 다음 정모를 한 낱말로 — 오늘·내일(KST 날짜 기준), 아니면 월/일. 7일보다 멀거나 없으면 null. */
export function meetupWhen(nextAt: string | null | undefined, now = Date.now()): { kind: "today" | "tomorrow" | "date"; month: number; day: number } | null {
    if (!nextAt) return null;
    const t = Date.parse(nextAt);
    if (!Number.isFinite(t)) return null;
    const KST = 9 * 3600_000, DAY = 86_400_000;
    const dayOf = (ms: number) => Math.floor((ms + KST) / DAY);
    const diff = dayOf(t) - dayOf(now);
    if (diff < 0 || diff > 7) return diff < 0 && now - t < 3 * 3600_000 ? { kind: "today", month: 0, day: 0 } : null;
    const k = new Date(t + KST);
    return { kind: diff === 0 ? "today" : diff === 1 ? "tomorrow" : "date", month: k.getUTCMonth() + 1, day: k.getUTCDate() };
}

/**
 * 인기 점수 — 최근·다가오는 정모가 가장 크고, 새 글, 인원 순. 정원이 찬 크루는 둘러보기 추천에서 뺀다(들어갈 수 없다).
 */
export function crewPopularity(c: { memberCount?: number | null; pulse?: CrewPulseLite | null }): number {
    const p = c.pulse ?? {};
    return (p.activities30 ?? 0) * 3 + (p.upcomingWeek ? 4 : 0) + (p.posts7 ?? 0) + Math.min(30, Number(c.memberCount) || 0) * 0.5;
}
