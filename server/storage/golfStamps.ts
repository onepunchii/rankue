/**
 * 도장깨기 도장 규칙 — 여권(golf.repo getGolfPassportStats)·발자국(golfFootprints)·Elite 60(여권 도장을 받아 쓴다)이
 * **같은 함수**를 쓴다(2026-09-30). 규칙이 두 벌이면 "도장 3개인데 발자국 2개"가 되고, 현장 인증(2026-09-30 오너 결정)이
 * 붙은 뒤로는 "지역 정복은 2곳인데 Elite 60 은 3곳" 처럼 한쪽만 기록 도장을 세는 일이 생긴다 — 그래서 셈은 여기 하나다.
 *
 * 도장이 두 가지다(shared/golfOnSite.ts):
 *  - **인증 도장**: 그 골프장 라운드 중 하나라도 현장 인증(on_site=true)이거나 이 규칙 전 옛 기록(NULL). 지금까지와 같다.
 *  - **기록 도장**: 그 골프장 라운드가 전부 인증을 못 받았다(false). 점수·평균엔 들어가지만 흐린 도장 — 정복·지역·Elite 60·
 *    발자국 길·공유 카드 '방문 골프장 N곳'에는 세지 않는다.
 * 다른 모듈을 끌어오지 않는 잎 모듈이라 순환 임포트가 없다(shared 는 순수 함수만).
 */
import { countsOnSite } from "../../shared/golfOnSite.js";

export interface StampClub { id: string; name: string; region: string | null; address: string | null }
export interface StampHit<C> { key: string; club: C | null; name: string }
export type StampResolver<C> = (h: { golfClubId: string | null; locationName: string | null }) => StampHit<C> | null;

/**
 * 기록 한 줄 → 어느 골프장 도장인가. 모르면 null(라운드 수에만 들어가고 도장은 없다).
 * 2026-09-11 여권 규칙 그대로: 골프장 번호가 먼저, 없으면 공백·대소문자를 무시한 이름. '알 수 없는 구장'은 도장이 아니다.
 * 같은 이름이 둘이면 먼저 나온 골프장(원장 순서)이 이긴다.
 */
export function makeStampResolver<C extends StampClub>(clubs: readonly C[]): StampResolver<C> {
    const squash = (v: string) => v.replace(/\s+/g, "").toLowerCase();
    const byId = new Map(clubs.map((c) => [c.id, c]));
    const byName = new Map<string, C>();
    for (const c of clubs) if (!byName.has(squash(c.name))) byName.set(squash(c.name), c);
    return (h) => {
        const club = (h.golfClubId && byId.get(h.golfClubId)) || (h.locationName ? byName.get(squash(h.locationName)) : undefined);
        if (!club && (!h.locationName || h.locationName === "알 수 없는 구장")) return null;
        return { key: club?.id ?? `name:${squash(h.locationName!)}`, club: club ?? null, name: club?.name ?? h.locationName! };
    };
}

/** 도장을 세는 데 필요한 기록 칸(hiq_game_history) */
export interface StampRow {
    golfClubId: string | null;
    locationName: string | null;
    score: number;
    createdAt: Date;
    /** NULL 옛 기록(인정) · true 현장 인증 · false 기록 도장 */
    onSite: boolean | null;
}

export interface StampAgg<C> {
    key: string;
    club: C | null;
    name: string;
    /** 인증 도장인가 — false 면 흐린 기록 도장 */
    onSite: boolean;
    /** 인증 도장이면 처음 **인증으로 센** 라운드(도장을 얻은 날), 기록 도장이면 첫 라운드 */
    first: Date;
    /** 그 골프장 마지막 라운드 */
    last: Date;
    /** 그 골프장 라운드 수 — 인증 여부와 무관(점수·기록은 그대로 남는다) */
    rounds: number;
    /** 그 골프장 베스트(18홀 타수). 없으면 null — 점수라서 인증 여부와 무관 */
    bestScore: number | null;
}

/**
 * 기록 → 도장(골프장당 하나). 도장을 얻은 순서(first), 같으면 이름순 — 새로고침마다 순서가 바뀌지 않게.
 * 어느 도장이 인증인지는 countsOnSite 한 줄로만 정한다(옛 NULL 은 센다).
 */
export function collectStamps<C>(rows: readonly StampRow[], resolve: StampResolver<C>): StampAgg<C>[] {
    type Acc = StampAgg<C> & { firstAny: Date; firstCounted: Date | null };
    const acc = new Map<string, Acc>();
    for (const r of rows) {
        const hit = resolve(r);
        if (!hit) continue;
        let s = acc.get(hit.key);
        if (!s) {
            s = {
                key: hit.key, club: hit.club, name: hit.name, onSite: false,
                first: r.createdAt, last: r.createdAt, rounds: 0, bestScore: null,
                firstAny: r.createdAt, firstCounted: null,
            };
            acc.set(hit.key, s);
        }
        s.rounds++;
        if (r.createdAt < s.firstAny) s.firstAny = r.createdAt;
        if (r.createdAt > s.last) s.last = r.createdAt;
        if (countsOnSite(r.onSite) && (s.firstCounted == null || r.createdAt < s.firstCounted)) s.firstCounted = r.createdAt;
        if (r.score > 0 && (s.bestScore == null || r.score < s.bestScore)) s.bestScore = r.score;
    }
    return [...acc.values()]
        .map(({ firstAny, firstCounted, ...s }) => ({ ...s, onSite: firstCounted != null, first: firstCounted ?? firstAny }))
        .sort((a, b) => a.first.getTime() - b.first.getTime() || a.name.localeCompare(b.name, "ko"));
}
