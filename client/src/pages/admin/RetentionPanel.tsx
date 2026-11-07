/**
 * 어드민 · 회원 › '회원이 다시 오나요'(2026-11-07 오너: "타 플랫폼 대비 리텐션" → "니가 보고 내가 알아보기 쉽게 만들어주고").
 * 위에서부터: 한두 줄 요약 → 1일째 · 7일째 · 30일째 막대(앱으로 시작 · 웹으로 시작 · 전체, 업계 평균선) → 종목별 표 → 앱을 얼마나 자주 여나.
 * 셈과 기준선은 shared/retention(업계와 같은 '그날' 셈), 값은 GET /admin/activity 의 retention.
 */
import { Panel, Pill } from "./adminUtils";
import {
    RETENTION_BENCH, RETENTION_BENCH_SOURCE, RETENTION_DAYS, RETENTION_GRADE_LABEL, RETENTION_MIN_N, STICKINESS_BENCH, STICKINESS_BENCH_SOURCE,
    retentionGrade, retentionHeadline, retentionRate, stickinessRate,
    type RetentionCell, type RetentionDay, type RetentionGrade, type RetentionGroup, type RetentionReport,
} from "@shared/retention";

const DAY_LABEL: Record<RetentionDay, string> = { 1: "다음 날(1일째)", 7: "1주 뒤(7일째)", 30: "한 달 뒤(30일째)" };
const GRADE_TONE: Record<RetentionGrade, "brand" | "warn" | "alert" | "neutral"> = { good: "brand", near: "warn", low: "alert", few: "neutral" };
const GRADE_BAR: Record<RetentionGrade, string> = { good: "bg-brand", near: "bg-amber-500", low: "bg-red-500", few: "bg-black/25" };
/** 막대의 끝 — 50% 를 가득으로(우리 숫자가 대개 30% 아래라 100% 로 그리면 다 바닥에 붙는다) */
const SCALE = 50;

const pctText = (c: RetentionCell) => { const r = retentionRate(c); return r === null ? "-" : `${r < 10 && r > 0 ? r.toFixed(1) : Math.round(r)}%`; };

function Bar({ g, day }: { g: RetentionGroup; day: RetentionDay }) {
    const c = g.days[day];
    const r = retentionRate(c);
    const grade = retentionGrade(c, day);
    const bench = RETENTION_BENCH[day];
    return (
        <div data-testid={`ret-bar-${g.key}-${day}`}>
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-bold text-black/70">{g.label}</span>
                <span className="tabular-nums">
                    <b className="text-[15px] font-black text-[rgba(0,0,0,0.87)]">{pctText(c)}</b>
                    <span className="ml-1 text-[11px] text-black/40">{c.returned}/{c.eligible}명</span>
                </span>
            </div>
            <div className="relative mt-1 h-3 rounded-full bg-black/[0.06]">
                {r !== null && <div className={`h-full rounded-full ${GRADE_BAR[grade]}`} style={{ width: `${Math.max(r > 0 ? 2 : 0, Math.min(100, (r / SCALE) * 100))}%` }} />}
                {/* 업계 평균선 */}
                <div className="absolute -top-1 -bottom-1 w-0.5 bg-black/70" style={{ left: `${(bench / SCALE) * 100}%` }} title={`업계 평균 ${bench}%`} />
            </div>
        </div>
    );
}

function DayCard({ day, groups }: { day: RetentionDay; groups: RetentionGroup[] }) {
    return (
        <Panel className="p-4 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-[13.5px] font-black text-[rgba(0,0,0,0.87)]">{DAY_LABEL[day]}</h4>
                <span className="text-[11.5px] font-bold text-black/50 tabular-nums">업계 평균 <b className="text-black/80">{RETENTION_BENCH[day]}%</b> <span className="inline-block w-2.5 h-0.5 bg-black/70 align-middle" /></span>
            </div>
            {groups.map((g) => <Bar key={g.key} g={g} day={day} />)}
        </Panel>
    );
}

function Cell({ c, day }: { c: RetentionCell; day: RetentionDay }) {
    if (c.eligible === 0) return <span className="text-black/25">아직</span>;
    const grade = retentionGrade(c, day);
    return (
        <span className="inline-flex items-center gap-1.5">
            <b className={`tabular-nums ${grade === "good" ? "text-brand" : grade === "low" ? "text-red-600" : grade === "near" ? "text-amber-700" : "text-black/45"}`}>{pctText(c)}</b>
            <span className="text-[11px] text-black/35 tabular-nums">{c.eligible}명 중</span>
        </span>
    );
}

export default function RetentionPanel({ r }: { r: RetentionReport }) {
    const lines = retentionHeadline(r);
    const stick = stickinessRate(r.stickiness);
    const oneDayShare = r.stickiness.appMonthly > 0 ? Math.round((100 * r.stickiness.appOneDay) / r.stickiness.appMonthly) : null;
    return (
        <section className="space-y-3" data-testid="admin-retention">
            <div>
                <h3 className="text-[15px] font-black text-[rgba(0,0,0,0.87)]">회원이 다시 오나요</h3>
                <p className="text-[12px] text-black/50">가입하고 그날(1일째 · 7일째 · 30일째) 다시 연 사람의 비율 — 업계 보고서와 같은 셈이에요.</p>
            </div>
            <Panel className="p-4 space-y-1.5 bg-brand/[0.04] border-brand/20">
                {lines.map((l, i) => <p key={i} className="text-[13.5px] font-bold text-[rgba(0,0,0,0.85)] leading-snug">{l}</p>)}
            </Panel>

            <div className="grid gap-2 md:grid-cols-3">
                {RETENTION_DAYS.map((d) => <DayCard key={d} day={d} groups={[r.app, r.web, r.all]} />)}
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11.5px]">
                {(["good", "near", "low", "few"] as const).map((g) => <Pill key={g} tone={GRADE_TONE[g]}>{RETENTION_GRADE_LABEL[g]}{g === "near" ? "(평균의 60% 이상)" : g === "few" ? `(${RETENTION_MIN_N}명 미만)` : ""}</Pill>)}
            </div>

            <Panel className="overflow-x-auto">
                <table className="w-full text-left text-[13px] whitespace-nowrap" data-testid="admin-retention-sports">
                    <thead>
                        <tr className="border-b border-black/10 bg-black/[0.02]">
                            <th className="p-3 font-black text-black/55">처음 고른 종목</th>
                            <th className="p-3 font-black text-black/55 text-right">가입</th>
                            {RETENTION_DAYS.map((d) => <th key={d} className="p-3 font-black text-black/55">{d}일째</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {r.sports.map((g) => (
                            <tr key={g.key} className="border-b border-black/[0.06]">
                                <td className="p-3 font-bold text-black/75">{g.label}</td>
                                <td className="p-3 text-right tabular-nums text-black/60">{g.signed}명</td>
                                {RETENTION_DAYS.map((d) => <td key={d} className="p-3"><Cell c={g.days[d]} day={d} /></td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Panel>

            <Panel className="p-4" >
                <p className="text-[13px] font-black text-[rgba(0,0,0,0.87)]">앱을 얼마나 자주 여나</p>
                <p className="mt-1 text-[13px] text-black/70 leading-relaxed" data-testid="admin-retention-stickiness">
                    최근 한 달 앱을 연 사람 <b className="tabular-nums">{r.stickiness.appMonthly}명</b> 가운데 하루 평균 <b className="tabular-nums">{r.stickiness.appAvgDaily}명</b>이 열어요
                    {stick !== null && <> — <b className="tabular-nums">{Math.round(stick)}%</b>(앱 중간값 {STICKINESS_BENCH}%)</>}.
                    {oneDayShare !== null && <> 한 달 동안 <b className="tabular-nums">하루만</b> 연 사람이 {r.stickiness.appOneDay}명({oneDayShare}%)이에요.</>}
                </p>
            </Panel>
            <p className="text-[11px] text-black/40 leading-relaxed">
                사람 기준(매장마다 따로 생긴 회원 줄은 한 사람) · 탈퇴 제외 · 접속 기록이 쌓인 {r.since} 이후 가입한 사람만 · 앱/웹은 처음 연 곳 · 웹은 로그인한 접속만 셉니다.
                기준선: {RETENTION_BENCH_SOURCE}, {STICKINESS_BENCH_SOURCE}.
            </p>
        </section>
    );
}
