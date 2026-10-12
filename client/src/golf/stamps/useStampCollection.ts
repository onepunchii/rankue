/**
 * 도장첩에 보여 줄 도장(2026-10-12).
 *
 *   비로그인 방문자            → 예시 인물의 도장첩(shared/golfStampSample). 내 것을 부르지 않는다(401 만 돌아온다).
 *   엘리트 도장이 아직 없는 회원 → 처음에는 예시를 보여 주고(오너: "처음 오는 사람도 예시를 보여줘서 와 하게"), '내 도장첩'으로 바꿀 수 있다.
 *   엘리트 도장이 있는 회원      → 내 도장첩만.
 *
 * 내 도장은 여권과 같은 응답(/api/hiq/golf/passport-stats — 서버 golfStamps.collectStamps)이다. 열쇠가 같아 캐시를 같이 쓴다.
 * 어느 도장이 어느 칸인지는 shared/golfStampBooks 가 정한다. 예시를 그리는 화면은 반드시 "예시" 표시(SampleBadge)를 붙인다 — sample 이 true 일 때.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { bookStates, stampSummary, type BookState, type StampLike, type StampSummary } from "@shared/golfStampBooks";
import { GOLF_STAMP_SAMPLE } from "@shared/golfStampSample";
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

const shown = (s: ServerStamp): ShownStamp => ({ clubId: s.clubId, name: s.name, date: stampDate(s.firstDate), score: s.bestScore > 0 ? s.bestScore : null, rounds: s.rounds });

const SAMPLE_STATES = bookStates<ShownStamp>(GOLF_STAMP_SAMPLE.map((s) => ({ clubId: s.clubId, name: s.name, date: s.date, score: s.score, rounds: s.rounds })));
const SAMPLE_SUMMARY = stampSummary(SAMPLE_STATES);

export interface StampCollection {
    /** 예시를 그리고 있는가 — true 면 화면이 "예시" 표시를 붙인다 */
    sample: boolean;
    /** 비로그인 방문자인가(가입 안내를 붙인다) */
    isGuest: boolean;
    /** 회원인데 엘리트 도장이 아직 없어 예시와 내 것을 오갈 수 있는가 */
    canSwitch: boolean;
    /** 예시 ↔ 내 도장첩 */
    showSample: (on: boolean) => void;
    states: BookState<ShownStamp>[];
    summary: StampSummary;
    /** 내 도장을 받아 오는 중(회원만) */
    isLoading: boolean;
}

export function useStampCollection(): StampCollection {
    const { member, isLoading: authLoading, isGuest } = useAuth();
    const { data, isLoading } = useQuery<PassportStatsResponse>({
        queryKey: PASSPORT_STATS_KEY,
        queryFn: fetchPassportStats,
        // 비로그인은 부르지 않는다 — 내 도장은 로그인 필수라 401 만 돌아온다
        enabled: !!member,
    });
    // 회원이 고른 것(null = 아직 안 골랐다 → 도장이 없으면 예시부터)
    const [choice, setChoice] = useState<boolean | null>(null);

    const mine = useMemo(() => {
        const states = bookStates<ShownStamp>((data?.stamps ?? []).map(shown), (data?.recordStamps ?? []).map(shown));
        return { states, summary: stampSummary(states) };
    }, [data]);

    const loading = authLoading || (!!member && isLoading);
    const empty = !!member && !loading && mine.summary.stamped === 0;
    const sample = isGuest || (empty && (choice ?? true));
    return {
        sample, isGuest,
        canSwitch: empty,
        showSample: setChoice,
        states: sample ? SAMPLE_STATES : mine.states,
        summary: sample ? SAMPLE_SUMMARY : mine.summary,
        isLoading: loading,
    };
}
