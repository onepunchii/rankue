/**
 * 회원의 온라인 대전 등급 표(2026-10-12 — 순서의 5번 "프로필 사진에 등급").
 * 친구 목록 · 채팅처럼 사람이 나오는 화면이 **화면마다 서버 응답을 고치지 않고** 이 표 하나를 받아 같이 쓴다(GET /sim/tiers).
 * 표에는 등급이 있는 사람(배치 3판을 마친 사람)만 있다 — 없는 사람은 배지를 그리지 않는다.
 *
 * 엔진을 끌어오지 않는 작은 모듈이다(홈 · 친구 · 채팅 번들에 들어간다). 답은 5분 간직한다 — 등급은 자주 바뀌지 않고,
 * 대전이 끝난 화면은 자기 값을 따로 받는다(MatchRatingCard).
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { TIERS, type TierId } from "@shared/sim/rank";

export const SIM_TIERS_URL = "/api/hiq/sim/tiers";
export const SIM_TIERS_QUERY_KEY = [SIM_TIERS_URL] as const;
export const SIM_TIERS_STALE_MS = 5 * 60_000;

export type SimTierMap = Readonly<Record<string, TierId>>;
const EMPTY: SimTierMap = Object.freeze({});

/** 서버 답 → 표. 아는 등급만 받는다(모르는 값 · 깨진 답은 그 사람만 빠진다). */
export function parseSimTiers(raw: unknown): SimTierMap {
    const t = raw && typeof raw === "object" ? (raw as { tiers?: unknown }).tiers : null;
    if (!t || typeof t !== "object" || Array.isArray(t)) return EMPTY;
    const out: Record<string, TierId> = {};
    for (const [id, v] of Object.entries(t as Record<string, unknown>)) {
        if (typeof v === "string" && TIERS.some((x) => x.id === v)) out[id] = v as TierId;
    }
    return out;
}

/** 등급 표 — 로그인한 회원만 받는다(비로그인 홈에 401 을 쌓지 않는다). 받기 전 · 실패하면 빈 표(배지 없음). */
export function useSimTiers(): SimTierMap {
    const { member } = useAuth();
    const q = useQuery<SimTierMap>({
        queryKey: SIM_TIERS_QUERY_KEY,
        queryFn: async () => parseSimTiers(await apiRequest(SIM_TIERS_URL)),
        enabled: !!member,
        staleTime: SIM_TIERS_STALE_MS,
        retry: false,
    });
    // 기기에 남은 옛 답이 다른 모양일 수 있다 — 표가 아니면 없는 것으로
    return q.data && typeof q.data === "object" && !Array.isArray(q.data) ? q.data : EMPTY;
}

/** 한 사람의 등급. 없으면 null */
export function useSimTier(memberId: string | null | undefined): TierId | null {
    const tiers = useSimTiers();
    return memberId ? tiers[memberId] ?? null : null;
}
