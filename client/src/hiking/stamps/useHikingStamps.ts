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
import { hikingAwardId, hikingBookStates, hikingBooks, mountainStamps, type HikingAwardKind, type HikingBookState, type MountainStamp } from "@shared/hikingStamps";
import { hikingGrade, summitHeightSum, type HikingGradeState } from "@shared/hikingGrade";
import { HIKING_HUB_KEY, type HikingHubData, type MountainSummary } from "../lib/api";

export const MY_STAMPS_KEY = ["/api/hiq/hiking/me/stamps"] as const;
export interface MySummit { id: string; mountainId: string; at: string; verified: boolean }
export interface MyAward { id: string; kind: HikingAwardKind; key: string; serial: number; earnedAt: string }
interface MyStampsResponse { summits: MySummit[]; awards: MyAward[] }

export interface HikingStamps {
    /** 등산을 쓸 수 있는 회원인가 — 아니면 내 것이 없다 */
    mine: boolean;
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

export function useHikingStamps(): HikingStamps {
    const mine = useHikingAccess();
    const hub = useQuery<HikingHubData>({ queryKey: HIKING_HUB_KEY, staleTime: 10 * 60_000 });
    const my = useQuery<MyStampsResponse>({ queryKey: MY_STAMPS_KEY, enabled: mine });
    return useMemo(() => {
        const famous = hub.data?.famous ?? [];
        const summits = mine ? my.data?.summits ?? [] : [];
        const awards = mine ? my.data?.awards ?? [] : [];
        const stamps = mountainStamps(summits);
        const by = new Map(stamps.map((s) => [s.mountainId, s]));
        const aw = new Map(awards.map((a) => [a.id, a]));
        const verified = stamps.filter((x) => x.verified);
        const heights = new Map(famous.map((m) => [m.id, m.heightM]));
        return {
            grade: hikingGrade(verified.length), heightSum: summitHeightSum(verified.map((x) => x.mountainId), (id) => heights.get(id)),
            mine, isLoading: hub.isLoading || (mine && my.isLoading), famous,
            states: hikingBookStates(hikingBooks(famous), stamps), stamps, stampOf: (id) => by.get(id),
            done: new Set(stamps.filter((s) => s.verified).map((s) => s.mountainId)), summits, awards, award: (kind, key) => aw.get(hikingAwardId(kind, key)),
        };
    }, [mine, hub.data, hub.isLoading, my.data, my.isLoading]);
}
