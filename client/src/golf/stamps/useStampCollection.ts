/**
 * 도장첩에 보여 줄 도장(2026-10-12).
 *
 *   회원               → **늘 내 도장첩**(비어 있어도). 예시는 화면의 '?' 단추가 연다(StampHelp).
 *                        처음에는 도장이 없는 회원에게 예시부터 보여 주고 '예시 | 내 도장첩' 전환을 뒀는데,
 *                        오너(2026-10-12): "도장깨기의 디폴트가 예시라서 내 도장첩이 우선이 되게, 예시 토글이 아니라 그냥 ? 버튼 누르면 자연스럽게 보여지게".
 *   비로그인 방문자     → 내 것이 없으니 예시를 그린다. 내 것을 부르지 않는다(401 만 돌아온다).
 *                        guest "person" = 홈의 예시 인물과 같은 사람의 도장첩(진행 중인 모습 — 책장 · 한 권),
 *                        guest "full"   = 다 모았을 때의 예시(장식장 — 오너: "볼마커 장식장 예시는 다 획득했다라는 예시가 좋을 거 같은데").
 *
 * 내 도장은 여권과 같은 응답(/api/hiq/golf/passport-stats — 서버 golfStamps.collectStamps)이다. 열쇠가 같아 캐시를 같이 쓴다.
 * 어느 도장이 어느 칸인지는 shared/golfStampBooks 가 정한다. 예시를 그리는 화면은 반드시 "예시" 표시(SampleBadge)를 붙인다 — sample 이 true 일 때.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { bookStates, stampSummary, type BookState, type StampLike, type StampSummary } from "@shared/golfStampBooks";
import { GOLF_STAMP_FULL_SAMPLE, GOLF_STAMP_SAMPLE, type SampleStamp } from "@shared/golfStampSample";
import { PASSPORT_STATS_KEY, fetchPassportStats, type PassportStatsResponse, type ServerStamp } from "../hooks/usePassportData";
import { stampDate } from "./stampDate";

/** 화면이 그리는 도장 한 개 */
export interface ShownStamp extends StampLike {
    /** 찍은 날 "2026.10.03" */
    date: string;
    /** 그 골프장 베스트 — 없으면 null */
    score: number | null;
    rounds: number;
}

/** 서버 도장 → 화면이 그리는 도장 */
export const shownStamp = (s: ServerStamp): ShownStamp => ({ clubId: s.clubId, name: s.name, date: stampDate(s.firstDate), score: s.bestScore > 0 ? s.bestScore : null, rounds: s.rounds });

const sampleStates = (list: readonly SampleStamp[]) => bookStates<ShownStamp>(list.map((s) => ({ clubId: s.clubId, name: s.name, date: s.date, score: s.score, rounds: s.rounds })));
/** 예시 인물의 도장첩(진행 중인 모습) */
export const SAMPLE_STATES = sampleStates(GOLF_STAMP_SAMPLE);
export const SAMPLE_SUMMARY = stampSummary(SAMPLE_STATES);
/** 다 모았을 때의 예시 — 장식장과 '?' 안내 */
export const FULL_SAMPLE_STATES = sampleStates(GOLF_STAMP_FULL_SAMPLE);
export const FULL_SAMPLE_SUMMARY = stampSummary(FULL_SAMPLE_STATES);

export interface StampCollection {
    /** 예시를 그리고 있는가(방문자) — true 면 화면이 "예시" 표시를 붙인다 */
    sample: boolean;
    /** 비로그인 방문자인가(가입 안내를 붙인다) */
    isGuest: boolean;
    states: BookState<ShownStamp>[];
    summary: StampSummary;
    /** 내 도장을 받아 오는 중(회원만) */
    isLoading: boolean;
}

export function useStampCollection(opts: { guest?: "person" | "full" } = {}): StampCollection {
    const { member, isLoading: authLoading, isGuest } = useAuth();
    const { data, isLoading } = useQuery<PassportStatsResponse>({
        queryKey: PASSPORT_STATS_KEY,
        queryFn: fetchPassportStats,
        // 비로그인은 부르지 않는다 — 내 도장은 로그인 필수라 401 만 돌아온다
        enabled: !!member,
    });

    const mine = useMemo(() => {
        const states = bookStates<ShownStamp>((data?.stamps ?? []).map(shownStamp), (data?.recordStamps ?? []).map(shownStamp));
        return { states, summary: stampSummary(states) };
    }, [data]);

    const full = opts.guest === "full";
    return {
        sample: isGuest, isGuest,
        // 회원은 늘 내 것 — 도장이 없으면 빈 도장첩 그대로
        states: isGuest ? (full ? FULL_SAMPLE_STATES : SAMPLE_STATES) : mine.states,
        summary: isGuest ? (full ? FULL_SAMPLE_SUMMARY : SAMPLE_SUMMARY) : mine.summary,
        isLoading: authLoading || (!!member && isLoading),
    };
}
