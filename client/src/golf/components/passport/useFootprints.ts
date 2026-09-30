/**
 * 발자국 자료 훅(2026-09-30) — 발자국 탭과 앨범 탭이 같은 캐시를 쓴다(앨범의 ①② 번호가 발자국 지도와 같아야 한다).
 * v2(2026-09-30 현장 인증: records·onSiteRounds 가 붙고 stops 는 인증 도장만) — 응답 모양이 바뀌면 올린다
 * (저장 캐시가 옛 모양을 먼저 그리지 않게). URL 에 붙지 않도록 queryFn 을 직접 준다.
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { FootprintsResponse } from "@shared/golfFootprints";

export const FOOTPRINTS_KEY = "/api/hiq/golf/passport/footprints";

export function useFootprints(year: number | null, enabled = true) {
    return useQuery<FootprintsResponse>({
        queryKey: [FOOTPRINTS_KEY, year ?? "all", "v2"],
        queryFn: () => apiRequest(`${FOOTPRINTS_KEY}${year != null ? `?year=${year}` : ""}`),
        staleTime: 60_000,
        enabled,
    });
}
