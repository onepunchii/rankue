/**
 * 회원 리텐션 — 업계와 같은 셈으로, 한눈에(2026-11-07 오너: "타 플랫폼 대비 리텐션이 얼마나" → "니가 보고 내가 알아보기 쉽게 만들어주고").
 *
 * 셈(서버 storage/appSession.repo retention 이 이 정의로 센다)
 *  - 사람 = profile_id(없으면 회원 id) — 매장마다 회원 줄이 따로 생겨도 한 사람. 탈퇴(번호 'del-')는 뺀다.
 *  - 가입 = 그 사람의 가장 이른 회원 줄. 접속 = hiq_app_sessions(앱 · 로그인한 웹, 2026-09-13 부터 쌓임) — 그래서 그날 이후 가입한 사람만 센다.
 *  - **N일째 재방문 = 가입 뒤 N일째(24시간 단위) 그날에 다시 열었나.** 업계 보고서(Adjust · AppsFlyer)가 쓰는 '그날' 셈이다.
 *    예전 표(가입 주별)는 'N일 안에 한 번이라도'라 이보다 높게 나온다 — 둘을 섞어 견주지 않는다.
 *  - 분모 = 가입한 지 N+1일이 지난 사람(아직 그날이 안 온 사람은 빼야 낮게 보이지 않는다).
 *  - 앱 / 웹 = 처음 연 곳(첫 접속의 platform). 종목 = 처음 고른 주 종목.
 * 기준선: 업계 평균(전 분야)은 1일째 26% · 7일째 13% · 30일째 7%(Adjust 2025). 앱 하루/한 달 비율 중간값 14%(MWM 2026).
 */

export const RETENTION_DAYS = [1, 7, 30] as const;
export type RetentionDay = (typeof RETENTION_DAYS)[number];

/** 업계 평균(전 분야) — 가입 · 설치 뒤 그날 다시 연 비율(%) */
export const RETENTION_BENCH: Readonly<Record<RetentionDay, number>> = { 1: 26, 7: 13, 30: 7 };
export const RETENTION_BENCH_SOURCE = "Adjust 2025 · 전 분야 평균";
/** 앱 하루 이용자 ÷ 한 달 이용자 중간값(%) */
export const STICKINESS_BENCH = 14;
export const STICKINESS_BENCH_SOURCE = "MWM 2026 · 앱 중간값";
/** 이보다 적은 사람으로 낸 비율은 '표본 적음'으로 — 몇 명이 오가면 크게 출렁인다 */
export const RETENTION_MIN_N = 20;

export interface RetentionCell {
    /** 그날이 지난(셀 수 있는) 사람 */
    eligible: number;
    /** 그날 다시 연 사람 */
    returned: number;
}
export interface RetentionGroup {
    key: string;
    label: string;
    signed: number;
    days: Readonly<Record<RetentionDay, RetentionCell>>;
}
export interface RetentionReport {
    /** 접속 기록이 쌓이기 시작한 날(이날 이후 가입한 사람만 센다) */
    since: string;
    all: RetentionGroup;
    app: RetentionGroup;
    web: RetentionGroup;
    sports: RetentionGroup[];
    stickiness: {
        /** 최근 28일 앱 하루 평균 이용자 */
        appAvgDaily: number;
        /** 최근 30일 앱 이용자 */
        appMonthly: number;
        /** 그 가운데 30일 동안 하루만 연 사람 */
        appOneDay: number;
    };
}

/** 비율(%) — 셀 사람이 없으면 null */
export const retentionRate = (c: RetentionCell): number | null => (c.eligible > 0 ? (100 * c.returned) / c.eligible : null);

export type RetentionGrade = "good" | "near" | "low" | "few";
export const RETENTION_GRADE_LABEL: Readonly<Record<RetentionGrade, string>> = { good: "평균 이상", near: "조금 낮음", low: "낮음", few: "표본 적음" };

/** 업계 평균에 견준 등급 — 평균 이상 · 평균의 60% 이상(조금 낮음) · 그 아래(낮음). 셀 사람이 적으면 표본 적음 */
export function retentionGrade(c: RetentionCell, day: RetentionDay): RetentionGrade {
    if (c.eligible < RETENTION_MIN_N) return "few";
    const r = retentionRate(c) ?? 0;
    const b = RETENTION_BENCH[day];
    return r >= b ? "good" : r >= b * 0.6 ? "near" : "low";
}

/** 앱 하루/한 달 비율(%) */
export const stickinessRate = (s: RetentionReport["stickiness"]): number | null => (s.appMonthly > 0 ? (100 * s.appAvgDaily) / s.appMonthly : null);

const pct = (v: number | null) => (v === null ? "-" : `${Math.round(v)}%`);

/**
 * 한두 줄 요약 — 맨 위에 굵게. 앱 회원과 웹 회원의 1일째를 업계 평균과 견준다(표본이 적으면 그렇게 말한다).
 * 지어낸 말 없이 숫자에서만 고른다.
 */
export function retentionHeadline(r: Pick<RetentionReport, "app" | "web" | "all">): string[] {
    const out: string[] = [];
    const app1 = r.app.days[1], web1 = r.web.days[1];
    const appRate = retentionRate(app1), webRate = retentionRate(web1);
    const g = retentionGrade(app1, 1);
    if (g === "few") out.push(`앱 회원은 아직 셀 사람이 적어요(${app1.eligible}명).`);
    else out.push(`앱 회원은 다음 날 ${pct(appRate)}가 다시 와요 — 업계 평균 ${RETENTION_BENCH[1]}%${g === "good" ? "보다 높아요" : g === "near" ? "에 조금 못 미쳐요" : "보다 많이 낮아요"}.`);
    if (webRate !== null && web1.eligible >= RETENTION_MIN_N) {
        const far = appRate !== null && webRate * 3 <= appRate;
        out.push(far
            ? `웹으로 가입한 회원은 다음 날 ${pct(webRate)}만 다시 와요 — 웹 가입자를 앱으로 넘기는 게 가장 큰 숙제예요.`
            : `웹으로 가입한 회원은 다음 날 ${pct(webRate)}가 다시 와요.`);
    }
    return out;
}
