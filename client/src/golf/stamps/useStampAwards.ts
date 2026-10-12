/**
 * 도장첩에서 받은 것의 기록(2026-10-12) — 볼마커 · 트로피를 받은 때와 순번("강원 볼마커 · 12번째 · 2026.10.12").
 * 서버가 라운드를 끝낼 때(· 늦은 현장 인증 때) 적어 둔 것을 읽기만 한다(GET /api/hiq/golf/stamp-awards). 회원만 부른다.
 * 이름표(id)는 shared/golfStampAwards.stampAwardId — "book:gangwon" · "all:all-open" · "trophy:10".
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { stampAwardId, type StampAwardKind } from "@shared/golfStampAwards";
import { stampDate } from "./stampDate";
import { awardLabel } from "./awardText";

export const STAMP_AWARDS_KEY = ["/api/hiq/golf/stamp-awards"] as const;

export interface StampAward {
    id: string;
    kind: StampAwardKind;
    key: string;
    /** 받은 순번(1 = 처음) */
    serial: number;
    /** 받은 때(ISO) */
    earnedAt: string;
}

export interface StampAwards {
    /** 받은 순서 */
    list: StampAward[];
    of: (kind: StampAwardKind, key: string) => StampAward | undefined;
}

export function useStampAwards(opts: { fresh?: boolean; enabled?: boolean } = {}): StampAwards {
    const { member } = useAuth();
    const { data } = useQuery<{ awards: StampAward[] }>({
        queryKey: STAMP_AWARDS_KEY,
        queryFn: () => apiRequest("/api/hiq/golf/stamp-awards"),
        // 방문자는 부르지 않는다(401 만 돌아온다)
        enabled: !!member && opts.enabled !== false,
        refetchOnMount: opts.fresh ? "always" : true,
    });
    return useMemo(() => {
        const list = data?.awards ?? [];
        const map = new Map(list.map((a) => [a.id, a]));
        return { list, of: (kind, key) => map.get(stampAwardId(kind, key)) };
    }, [data]);
}

/** "12번째 · 2026.10.12" */
export const awardWhen = (a: Pick<StampAward, "serial" | "earnedAt">) => `${a.serial}번째 · ${stampDate(a.earnedAt)}`;
export { awardLabel };
