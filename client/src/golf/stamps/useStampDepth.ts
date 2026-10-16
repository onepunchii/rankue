/**
 * 내 도장의 깊이(코스 조각 · 금테 · 사철) · 볼마커 등급 · 시즌 태그 · 한정 볼마커(2026-10-12).
 *
 *   회원    → 서버가 내 인증 라운드로 계산한 것(GET /api/hiq/golf/stamp-depth — 읽기만)과 받은 기록(useStampAwards).
 *   방문자  → 예시(shared/golfStampSample). guest "person" = 예시 인물의 진행 중인 모습, "full" = 다 모았을 때.
 *             화면은 예시를 그리는 구역에 "예시" 표시를 붙인다(sample 이 true).
 *
 * 볼마커 등급은 깊이에서 바로 계산한다(shared/golfStampDepth.markerTiersDue) — 받은 기록은 순번 · 날짜를 보여 줄 때만 쓴다.
 * 한정 볼마커는 받은 기록(kind 'special')이 곧 '가졌는가'다.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { markerTiersDue, type MarkerTier, type SlotDepth } from "@shared/golfStampDepth";
import { seasonTagOf, type SeasonTagYear, SEASON_TAG_TIERS, seasonTagKey } from "@shared/golfStampExtras";
import {
    GOLF_DEPTH_FULL_SAMPLE, GOLF_DEPTH_SAMPLE, GOLF_MARKER_TIER_FULL_SAMPLE, GOLF_SPECIAL_FULL_SAMPLE, GOLF_SPECIAL_SAMPLE, GOLF_TAG_FULL_SAMPLE, GOLF_TAG_SAMPLE,
} from "@shared/golfStampSample";
import { useStampAwards, type StampAward } from "./useStampAwards";

export const STAMP_DEPTH_KEY = ["/api/hiq/golf/stamp-depth"] as const;

export interface StampDepthView {
    /** 예시를 그리고 있는가(방문자) */
    sample: boolean;
    /** 칸의 깊이 — 도장이 없는 칸은 undefined */
    of: (slotKey: string) => SlotDepth | undefined;
    all: ReadonlyMap<string, SlotDepth>;
    /** 그 권(또는 'all-open')의 볼마커 등급 — 일반이면 null */
    tier: (bookId: string) => MarkerTier | null;
    /** 해마다의 시즌 태그(최근 해부터). 올해가 맨 앞 */
    tags: readonly SeasonTagYear[];
    /** 한정 볼마커를 가졌는가(이름표 — "spring:2026" · "holeinone") */
    hasSpecial: (key: string) => boolean;
    /** 한정 볼마커의 받은 기록 — 회원만 */
    specialAward: (key: string) => StampAward | undefined;
    /** 올해(한국 날짜) */
    year: number;
}

/** 올해(한국 날짜) */
export const kstYear = (now = Date.now()) => new Date(now + 9 * 3_600_000).getUTCFullYear();

const toMap = (list: readonly SlotDepth[]) => new Map(list.map((d) => [d.slotKey, d]));
const SAMPLE_MAP = toMap(GOLF_DEPTH_SAMPLE), FULL_MAP = toMap(GOLF_DEPTH_FULL_SAMPLE);
/** 예시의 해 — 예시 자료가 2026년으로 적혀 있다 */
const SAMPLE_YEAR = 2026;

export function useStampDepth(opts: { guest?: "person" | "full" } = {}): StampDepthView {
    const { member, isGuest } = useAuth();
    const awards = useStampAwards();
    const { data } = useQuery<{ depths: SlotDepth[]; tags: SeasonTagYear[] }>({
        queryKey: STAMP_DEPTH_KEY,
        queryFn: () => apiRequest("/api/hiq/golf/stamp-depth"),
        // 방문자는 부르지 않는다(401 만 돌아온다)
        enabled: !!member,
    });
    const full = opts.guest === "full";

    return useMemo((): StampDepthView => {
        if (isGuest) {
            const all = full ? FULL_MAP : SAMPLE_MAP;
            const keys = new Set(full ? GOLF_SPECIAL_FULL_SAMPLE : GOLF_SPECIAL_SAMPLE);
            return {
                sample: true, all, of: (k) => all.get(k),
                tier: (bookId) => (full ? GOLF_MARKER_TIER_FULL_SAMPLE[bookId] ?? null : null),
                tags: full ? GOLF_TAG_FULL_SAMPLE : GOLF_TAG_SAMPLE,
                hasSpecial: (k) => keys.has(k), specialAward: () => undefined, year: SAMPLE_YEAR,
            };
        }
        const all = toMap(data?.depths ?? []);
        // 자개가 블랙보다 위 — 둘 다면 자개
        const tiers = new Map<string, MarkerTier>();
        for (const d of markerTiersDue(all)) if (d.tier === "pearl" || !tiers.has(d.key)) tiers.set(d.key, d.tier);
        // 어드민이 증정한 블랙 · 자개(2026-10-16) — 받은 기록에만 있다. 자개가 위
        for (const a of awards.list) if ((a.kind === "pearl" || a.kind === "black") && (a.kind === "pearl" || !tiers.has(a.key))) tiers.set(a.key, a.kind);
        const year = kstYear();
        const base = data?.tags?.length ? data.tags : [seasonTagOf(year, 0)];
        // 증정한 시즌 태그 — 그해의 가죽을 올린다(라운드 수 · 다음까지는 실제 값 그대로)
        const tags = base.map((t) => {
            const granted = SEASON_TAG_TIERS.filter((x) => !!awards.of("tag", seasonTagKey(t.year, x.id)));
            const top = granted[granted.length - 1];
            return top && (!t.tier || top.at > t.tier.at) ? { ...t, tier: top } : t;
        });
        return {
            sample: false, all, of: (k) => all.get(k), tier: (bookId) => tiers.get(bookId) ?? null, tags,
            hasSpecial: (k) => !!awards.of("special", k), specialAward: (k) => awards.of("special", k), year,
        };
    }, [isGuest, full, data, awards]);
}
