/**
 * 내 등산 도장(2026-10-13) — 정상에 오른 기록 · 도장첩의 상태 · 받은 와펜과 핀.
 *
 *   등산을 쓸 수 있는 회원 → 내 기록(GET /api/hiq/hiking/me/stamps)으로 계산한다.
 *   그 밖(방문자 · 아직 등산이 열리지 않은 회원) → 기록이 없다. 도장첩은 빈 칸으로, 와펜은 '받을 수 있는 것'으로 보인다
 *   (지어낸 예시 인물을 그리지 않는다 — 등산은 아직 열리지 않았고, 무엇을 모으는지 보여 주는 것으로 충분하다).
 *
 * 도장첩의 칸은 산의 목록(허브 응답의 명산)에서 만든다 — 규칙은 shared/hikingStamps.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useHikingAccess } from "@/hooks/useHikingAccess";
import { HIKING_GRANDS, HIKING_PINS, hikingAwardId, hikingBookStates, hikingBooks, mountainStamps, type HikingAwardKind, type HikingBookState, type MountainStamp } from "@shared/hikingStamps";
import { HIKING_GRADES, hikingGrade, summitHeightSum, type HikingGradeState } from "@shared/hikingGrade";
import { exampleSummits } from "@shared/hikingStampExample";
import { HIKING_HUB_KEY, type HikingHubData, type MountainSummary } from "../lib/api";

export const MY_STAMPS_KEY = ["/api/hiq/hiking/me/stamps"] as const;
export interface MySummit { id: string; mountainId: string; at: string; verified: boolean }
export interface MyAward { id: string; kind: HikingAwardKind; key: string; serial: number; earnedAt: string }
interface MyStampsResponse { summits: MySummit[]; awards: MyAward[] }

export interface HikingStamps {
    /** 등산을 쓸 수 있는 회원인가 — 아니면 내 것이 없다. 예시(example)일 때는 true 다(화면이 '내 것'의 모양으로 그린다) */
    mine: boolean;
    /** 예시인가 — 다 모은 모습을 셈으로 만든 것(shared/hikingStampExample). 화면은 '예시'라고 적는다 */
    example: boolean;
    /** 진짜로 등산을 쓰는 회원인가(예시와 무관) — 가입 안내 · 내 것으로 가는 길을 가른다 */
    member: boolean;
    isLoading: boolean;
    /** 명산(도장첩의 칸이 되는 산) */
    famous: MountainSummary[];
    states: HikingBookState[];
    stamps: MountainStamp[];
    stampOf: (mountainId: string) => MountainStamp | undefined;
    /** 인증 도장이 찍힌 산의 id — 지도에 깃발을 꽂는다 */
    done: Set<string>;
    summits: MySummit[];
    awards: MyAward[];
    award: (kind: HikingAwardKind, key: string) => MyAward | undefined;
    /** 산행 등급 — 인증한 서로 다른 산의 수로(shared/hikingGrade) */
    grade: HikingGradeState;
    /** 밟은 정상의 높이를 더한 값(m) — 명산 가운데 높이를 아는 산만 */
    heightSum: number;
}

/**
 * 예시의 받은 것 — 다 모은 모습이라 전부 받는다: 권마다의 와펜(그 권의 마지막 도장을 찍은 날) · 큰 와펜 · 등급 휘장(그 수의 산을 채운 날) · 핀.
 * 순번(serial)은 실제로만 있는 숫자라 만들지 않는다(0 — 화면은 예시일 때 순번을 적지 않는다).
 */
function exampleAwards(states: readonly HikingBookState[], stamps: readonly MountainStamp[]): MyAward[] {
    const out: MyAward[] = [];
    const add = (kind: HikingAwardKind, key: string, at: number | undefined) => { if (at != null && Number.isFinite(at)) out.push({ id: hikingAwardId(kind, key), kind, key, serial: 0, earnedAt: new Date(at).toISOString() }); };
    const firstAt = new Map(stamps.map((s) => [s.mountainId, s.firstAt]));
    const bookAt = new Map<string, number>();
    for (const st of states) {
        const at = Math.max(...st.slots.map((x) => firstAt.get(x.m.id) ?? 0));
        bookAt.set(st.book.id, at);
        add("patch", st.book.id, at);
    }
    for (const g of HIKING_GRANDS) {
        const ats = states.filter((s) => s.book.kind === g.kind).map((s) => bookAt.get(s.book.id) ?? 0);
        if (ats.length) add("grand", g.id, Math.max(...ats));
    }
    const ordered = stamps.map((s) => s.firstAt).sort((a, b) => a - b);
    for (const g of HIKING_GRADES) add("grade", g.id, ordered[Math.max(0, g.min - 1)]);
    HIKING_PINS.forEach((p, i) => add("pin", p.id, ordered[Math.min(ordered.length - 1, Math.floor(((i + 1) * ordered.length) / (HIKING_PINS.length + 1)))]));
    return out;
}

export function useHikingStamps(opts: { example?: boolean } = {}): HikingStamps {
    const member = useHikingAccess();
    const example = !!opts.example;
    // 예시는 '내 것'의 모양으로 그린다 — 기록은 부르지 않고 산의 목록에서 만든다
    const mine = member || example;
    const hub = useQuery<HikingHubData>({ queryKey: HIKING_HUB_KEY, staleTime: 10 * 60_000 });
    const my = useQuery<MyStampsResponse>({ queryKey: MY_STAMPS_KEY, enabled: member && !example });
    return useMemo(() => {
        const famous = hub.data?.famous ?? [];
        // 예시 — 도장첩에 드는 모든 산에 도장을(다 모은 모습). 와펜의 순번처럼 실제로만 있는 것은 만들지 않는다
        const summits: MySummit[] = example
            ? exampleSummits(hikingBooks(famous).flatMap((b) => b.slots.map((x) => x.id)), Date.now())
            : member ? my.data?.summits ?? [] : [];
        const stamps = mountainStamps(summits);
        const computed = hikingBookStates(hikingBooks(famous), stamps);
        const awards = example ? exampleAwards(computed, stamps) : member ? my.data?.awards ?? [] : [];
        const by = new Map(stamps.map((s) => [s.mountainId, s]));
        const aw = new Map(awards.map((a) => [a.id, a]));
        // 어드민이 증정한 와펜(2026-10-16) — 받은 기록에만 있다. 도장으로 다시 계산한 '다 채움'에 더해 '받음'으로 그린다
        const states = example ? computed : computed.map((st) => (!st.done && aw.has(hikingAwardId("patch", st.book.id)) ? { ...st, done: true } : st));
        const verified = stamps.filter((x) => x.verified);
        const heights = new Map(famous.map((m) => [m.id, m.heightM]));
        // 증정한 등급 — 실제로 오른 등급보다 높으면 그 등급으로(오른 산의 수 · 다음까지는 실제 값)
        const real = hikingGrade(verified.length);
        const grantedAt = example ? -1 : Math.max(-1, ...HIKING_GRADES.map((g, i) => (aw.has(hikingAwardId("grade", g.id)) ? i : -1)));
        const grade = grantedAt > real.index ? { ...real, grade: HIKING_GRADES[grantedAt], index: grantedAt, next: HIKING_GRADES[grantedAt + 1] ?? null, left: HIKING_GRADES[grantedAt + 1] ? Math.max(0, HIKING_GRADES[grantedAt + 1].min - real.count) : 0, ratio: 1 } : real;
        return {
            grade, heightSum: summitHeightSum(verified.map((x) => x.mountainId), (id) => heights.get(id)),
            mine, example, member, isLoading: hub.isLoading || (member && !example && my.isLoading), famous,
            states, stamps, stampOf: (id) => by.get(id),
            done: new Set(stamps.filter((s) => s.verified).map((s) => s.mountainId)), summits, awards, award: (kind, key) => aw.get(hikingAwardId(kind, key)),
        };
    }, [mine, example, member, hub.data, hub.isLoading, my.data, my.isLoading]);
}
