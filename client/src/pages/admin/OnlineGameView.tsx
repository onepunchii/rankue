/**
 * 어드민 · 온라인게임 대시보드(2026-09-08 오너 → 2026-09-26 개편: "이용 현황 대시보드가 중요 — 완벽하게").
 * 데이터: GET /api/hiq/admin/online-game?days= (storage.sim.adminOverview). 날짜는 전부 한국 기준.
 *
 * 위에서 아래로 "지금 → 오늘 → 기간 → 왜" 순서로 읽힌다.
 *  1. 지금: 플레이 중인 사람 · 진행 중 싱글/대전 · 열린 방 (1분마다 갱신)
 *  2. 오늘: 이용자(어제 같은 시각 대비) · 싱글 · 대전 · 드릴
 *  3. 기간 핵심 숫자: 이용자 · 신규 · 플레이 · 완료 대전 · 플레이 시간 · 재방문 — 모두 **직전 같은 길이 기간 대비**
 *  4. 깔때기: 앱 접속 → 온라인게임 → 대전 → (누적) 배치 완료
 *  5. 일별 추이 4개(지표마다 차트 하나, 축 하나) · 요일×시간 히트맵(언제 붐비나)
 *  6. 첫 플레이 주 코호트 재방문(D1·D7)
 *  7. 대전 품질(성사율·취소·대기·길이·종료 사유·무결성) · 싱글/드릴 품질 · 종목별
 *  8. 상위 이용자 · 새 이용자 · 최근 대전 — 이름을 누르면 회원 상세
 * 차트는 시뮬레이터 대시보드의 SVG 차트(TrendLine/Columns — 읽기 줄·문지르기 포함)를 그대로 쓴다. 색은 브랜드 한 색.
 */
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Columns, TrendLine } from "@/sim/dash/charts";
import { LucideRefreshCw } from "@/lib/icons";
import { kstDateTime, agoLabel, Pill } from "./adminUtils";

interface Overview {
    generatedAt: string;
    days: number;
    live: { players: number; singles: number; matches: number; openRooms: number };
    today: { players: number; playersYesterdaySoFar: number; singles: number; matchPlays: number; drills: number };
    kpi: { players: number; playersPrev: number; newPlayers: number; newPlayersPrev: number; plays: number; playsPrev: number; returningPlayers: number; playersAll: number; minutes: number; minutesPrev: number };
    sessions: { total: number; totalPrev: number; finished: number; drillKind: number; players: number; shots: number; mismatches: number; mismatchGames: number; avgInnings: number | null; avgMinutes: number | null };
    matches: {
        created: number; createdPrev: number; started: number; finished: number; finishedPrev: number; canceled: number;
        publicRooms: number; passwordRooms: number; invited: number; reality: number; handicap: number; players: number;
        shots: number; mismatches: number; mismatchGames: number; medianWaitSec: number | null; avgMinutes: number | null; avgShots: number | null;
        endReasons: { target: number; inningCap: number; resign: number; claim: number };
    };
    drills: { attempts: number; attemptsPrev: number; successes: number; players: number };
    funnel: { appUsers: number; gameUsers: number; matchUsers: number; placedAll: number };
    daily: { day: string; players: number; newPlayers: number; sessions: number; matches: number; finishedMatches: number; drills: number }[];
    heatmap: number[][];
    cohorts: { week: string; players: number; d1: number; d7: number; d1Ready: boolean; d7Ready: boolean }[];
    byGame: { gameType: string; tableId: string; sessions: number; matches: number }[];
    topPlayers: { memberId: string; name: string; sessions: number; matches: number; drills: number; days: number; wins: number; rating: number | null; bestAvg: number; lastAt: string | null }[];
    newPlayers: { memberId: string; name: string; firstAt: string; plays: number; firstKind: string }[];
    recentMatches: {
        id: string; status: string; gameType: string; tableId: string; isPublic: boolean; hasPassword: boolean; invited: boolean; reality: boolean;
        endReason: string | null; shots: number; mismatches: number; hostName: string; guestName: string | null; winnerName: string | null;
        createdAt: string; startedAt: string | null; lastShotAt: string | null;
    }[];
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const pctText = (a: number, b: number) => { const p = pctOf(a, b); return p === null ? "–" : `${p}%`; };
const gameName = (g: string, t: string) => `${g === "3c" ? "3쿠션" : g === "4c" ? "4구" : g} · ${t === "DAEDAE" ? "대대" : "중대"}`;
const dayLabel = (day: string) => { const [, m, d] = day.split("-"); return `${Number(m)}/${Number(d)}`; };
const WEEK = ["월", "화", "수", "목", "금", "토", "일"];
const STATUS: Record<string, { label: string; tone: "brand" | "info" | "warn" | "neutral" }> = {
    waiting: { label: "대기", tone: "warn" }, playing: { label: "진행 중", tone: "info" }, finished: { label: "종료", tone: "brand" }, canceled: { label: "취소", tone: "neutral" },
};
const END: Record<string, string> = { target: "목표 점수", inningCap: "이닝 제한", resign: "기권", claim: "무응답 승" };
const KIND: Record<string, string> = { single: "싱글", match: "대전", drill: "드릴" };

function minutesLabel(min: number) {
    if (min < 60) return `${Math.round(min)}분`;
    const h = min / 60;
    return h < 100 ? `${h.toFixed(1)}시간` : `${fmt(Math.round(h))}시간`;
}
function secLabel(sec: number | null) {
    if (sec === null) return "–";
    if (sec < 60) return `${Math.round(sec)}초`;
    return `${Math.round(sec / 60)}분`;
}

/** 직전 기간 대비 — 오르면 ▲(브랜드), 내리면 ▼(빨강). 직전이 0 이면 비교하지 않는다. */
function Delta({ cur, prev }: { cur: number; prev: number }) {
    if (prev === 0) return <span className="text-black/35">{cur > 0 ? "직전 기간 0" : "–"}</span>;
    const p = Math.round(((cur - prev) / prev) * 100);
    if (p === 0) return <span className="text-black/45">직전과 같음</span>;
    return <span className={p > 0 ? "text-brand font-bold" : "text-red-600 font-bold"}>{p > 0 ? "▲" : "▼"} {Math.abs(p)}%<span className="font-medium text-black/40"> · 직전 {fmt(prev)}</span></span>;
}

function Stat({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: React.ReactNode; tone?: "default" | "brand" | "live" }) {
    const box = tone === "brand" ? "bg-brand/[0.06] border-brand/25" : tone === "live" ? "bg-[rgba(0,98,65,0.92)] border-transparent text-white" : "bg-white border-black/[0.08]";
    return (
        <div className={`p-4 rounded-2xl border ${box}`}>
            <span className={`text-[12px] font-bold block mb-1 ${tone === "live" ? "text-white/75" : "text-black/50"}`}>{label}</span>
            <div className={`text-[24px] leading-none font-black tabular-nums ${tone === "brand" ? "text-brand" : tone === "live" ? "text-white" : "text-[rgba(0,0,0,0.87)]"}`}>{value}</div>
            {sub && <div className={`mt-1.5 text-[11.5px] leading-snug tabular-nums ${tone === "live" ? "text-white/70" : "text-black/45"}`}>{sub}</div>}
        </div>
    );
}

function Card({ title, sub, children, right }: { title: string; sub?: string; children: React.ReactNode; right?: React.ReactNode }) {
    return (
        <section className="bg-white rounded-2xl border border-black/[0.07] p-4 md:p-5 min-w-0">
            <header className="mb-3 flex items-start justify-between gap-2">
                <div>
                    <h3 className="text-[15px] font-bold text-[rgba(0,0,0,0.87)]">{title}</h3>
                    {sub && <p className="text-[12px] text-black/45 mt-0.5">{sub}</p>}
                </div>
                {right}
            </header>
            {children}
        </section>
    );
}

/** 가로 막대 한 줄(깔때기·종료 사유·종목) — 값 글자는 잉크 색, 막대만 브랜드 */
function BarRow({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
    const w = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
    return (
        <div className="grid grid-cols-[88px_1fr_auto] items-center gap-2 py-1">
            <span className="text-[12.5px] text-black/60 truncate">{label}</span>
            <div className="h-3 rounded-full bg-black/[0.05] overflow-hidden"><div className="h-full rounded-full bg-brand" style={{ width: `${w}%` }} /></div>
            <span className="text-[12.5px] font-bold tabular-nums text-[rgba(0,0,0,0.8)] text-right min-w-[64px]">{fmt(value)}{suffix && <span className="font-medium text-black/40"> {suffix}</span>}</span>
        </div>
    );
}

/** 요일 × 시간 히트맵(한 색, 연한→진한). 칸을 누르거나 가리키면 아래 읽기 줄에 값이 나온다. */
function Heatmap({ grid }: { grid: number[][] }) {
    const max = Math.max(1, ...grid.flat());
    const [pick, setPick] = useState<{ d: number; h: number } | null>(null);
    const step = (v: number) => (v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
    const alpha = [0, 0.18, 0.4, 0.65, 1];
    const total = grid.flat().reduce((a, b) => a + b, 0);
    // 가장 붐비는 칸
    let best = { d: 0, h: 0, v: -1 };
    grid.forEach((row, d) => row.forEach((v, h) => { if (v > best.v) best = { d, h, v }; }));
    const shown = pick ?? (best.v > 0 ? { d: best.d, h: best.h } : null);
    return (
        <div>
            <div className="overflow-x-auto">
                <div className="min-w-[340px]">
                    <div className="grid grid-cols-[22px_repeat(24,minmax(0,1fr))] gap-[2px]" role="grid" aria-label="요일·시간별 플레이 수">
                        <span />
                        {Array.from({ length: 24 }, (_, h) => (
                            <span key={h} className="text-[9.5px] text-black/35 text-center tabular-nums">{h % 3 === 0 ? h : ""}</span>
                        ))}
                        {grid.map((row, d) => (
                            <Fragment key={d}>
                                <span className="text-[11px] text-black/50 leading-[14px]">{WEEK[d]}</span>
                                {row.map((v, h) => {
                                    const on = shown?.d === d && shown?.h === h;
                                    return (
                                        <button key={`${d}-${h}`} type="button" title={`${WEEK[d]} ${h}시 · ${fmt(v)}회`}
                                            onMouseEnter={() => setPick({ d, h })} onFocus={() => setPick({ d, h })} onClick={() => setPick({ d, h })}
                                            className={`h-[14px] rounded-[3px] ${on ? "ring-2 ring-[rgba(0,0,0,0.75)] ring-offset-1" : ""}`}
                                            style={{ background: v === 0 ? "rgba(0,0,0,0.05)" : `rgb(var(--brand) / ${alpha[step(v)]})` }}
                                            aria-label={`${WEEK[d]}요일 ${h}시 ${v}회`} />
                                    );
                                })}
                            </Fragment>
                        ))}
                    </div>
                </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
                <span className="text-black/60 tabular-nums">
                    {shown ? <><b className="text-[rgba(0,0,0,0.85)]">{WEEK[shown.d]}요일 {shown.h}시</b> · {fmt(grid[shown.d][shown.h])}회{!pick && best.v > 0 ? " (가장 붐빔)" : ""}</> : "기록 없음"}
                </span>
                <span className="flex items-center gap-1 text-black/40">
                    적음{alpha.slice(1).map((a) => <span key={a} className="w-3 h-3 rounded-[3px]" style={{ background: `rgb(var(--brand) / ${a})` }} />)}많음
                </span>
            </div>
            <p className="mt-1 text-[11px] text-black/35 tabular-nums">기간 합 {fmt(total)}회 · 한국 시각</p>
        </div>
    );
}


type RecomputeSummary = {
    dryRun: boolean; finishedMatches: number; ratedMatches: number;
    skipped: { manual: number; tooShort: number; noGuest: number };
    players: number; rowsBefore: number;
    top: { memberId: string; gameType: string; rating: number; matches: number; wins: number }[];
};

/**
 * 레이팅 다시 계산(2026-09-26 오너: 핸디전만 반영 · 기대 승률 50:50 — 규칙이 바뀌어 기존 점수를 핸디전 기록으로 새로 쌓는다).
 * 먼저 미리보기(계산만)로 몇 판이 반영되는지 보고, 적용을 누르면 온라인 대전 레이팅 표를 통째로 다시 쓴다.
 */
function RatingRecomputeCard() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const [preview, setPreview] = useState<RecomputeSummary | null>(null);
    const run = useMutation({
        mutationFn: async (apply: boolean) => apiRequest("/api/hiq/admin/sim/recompute-ratings", { method: "POST", body: { apply } }) as Promise<RecomputeSummary>,
        onSuccess: (r) => {
            setPreview(r);
            if (!r.dryRun) {
                toast({ title: `레이팅을 다시 계산했습니다 — ${fmt(r.players)}명 · ${fmt(r.ratedMatches)}판 반영` });
                qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").includes("/sim/") });
            }
        },
        onError: (e: any) => toast({ title: e?.message || "다시 계산 실패", variant: "destructive" }),
    });
    return (
        <Card title="온라인 대전 레이팅 규칙" sub="핸디전만 반영 · 기대 승률 50:50 · 두 사람 다 3샷 이상 · 같은 상대 24시간 안 연속은 줄여서">
            <p className="text-[12.5px] text-black/55 leading-relaxed">
                다마수를 직접 넣는 방(맞대결)은 친선전이라 레이팅·판 수에 넣지 않습니다. 규칙이 바뀌기 전 점수에는 맞대결이 섞여 있어,
                끝난 대전을 핸디전만 골라 처음부터 다시 쌓을 수 있습니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={run.isPending} onClick={() => run.mutate(false)}
                    className="h-9 px-3 rounded-lg border border-black/10 text-[13px] font-bold text-black/70 disabled:opacity-50">
                    {run.isPending && !preview ? "계산 중…" : "미리보기"}
                </button>
                {preview?.dryRun && (
                    <button type="button" disabled={run.isPending}
                        onClick={() => { if (window.confirm(`온라인 대전 레이팅을 다시 씁니다.\n${fmt(preview.players)}명 · 핸디전 ${fmt(preview.ratedMatches)}판 반영\n(지금 ${fmt(preview.rowsBefore)}줄은 지워집니다)\n\n진행할까요?`)) run.mutate(true); }}
                        className="h-9 px-3 rounded-lg bg-brand text-white text-[13px] font-bold disabled:opacity-50">
                        {run.isPending ? "적용 중…" : "이대로 적용"}
                    </button>
                )}
            </div>
            {preview && (
                <div className="mt-3 rounded-xl bg-black/[0.03] p-3 text-[12.5px] tabular-nums space-y-1">
                    <p><b>{preview.dryRun ? "미리보기" : "적용 완료"}</b> · 끝난 대전 {fmt(preview.finishedMatches)}판 중 <b className="text-brand">{fmt(preview.ratedMatches)}판</b> 반영 → {fmt(preview.players)}명</p>
                    <p className="text-black/50">빠진 판: 맞대결 {fmt(preview.skipped.manual)} · 3샷 미만 {fmt(preview.skipped.tooShort)}</p>
                    {preview.top.length > 0 && (
                        <p className="text-black/50">상위: {preview.top.map((t) => `${t.gameType === "3c" ? "3쿠션" : "4구"} ${t.rating}(${t.matches}판)`).join(" · ")}</p>
                    )}
                </div>
            )}
        </Card>
    );
}

export default function OnlineGameView({ onOpenMember }: { onOpenMember?: (memberId: string) => void }) {
    const [days, setDays] = useState(30);
    const [matchFilter, setMatchFilter] = useState<"all" | "playing" | "finished" | "canceled">("all");
    const { data, isPending, isError, refetch, isFetching, dataUpdatedAt } = useQuery<Overview>({
        queryKey: [`/api/hiq/admin/online-game?days=${days}`],
        staleTime: 30_000,
        refetchInterval: 60_000,
    });
    const daily = useMemo(() => (Array.isArray(data?.daily) ? data!.daily : []), [data]);

    if (isPending) return <p className="text-sm text-black/50 p-6">불러오는 중…</p>;
    // 모양까지 확인 — 옛 캐시(개편 전 응답)가 올라와도 화면이 멈추지 않게
    if (isError || !data || !data.kpi || !Array.isArray(data.heatmap)) return (
        <div className="p-6 flex items-center gap-3">
            <p className="text-sm text-black/60">이용 현황을 불러오지 못했어요.</p>
            <button type="button" onClick={() => { void refetch(); }} className="h-9 px-3 rounded-lg border border-black/10 text-sm font-semibold">다시 시도</button>
        </div>
    );

    const { kpi, sessions: s, matches: m, drills: d, funnel: f, live, today } = data;
    const every = Math.max(1, Math.ceil(daily.length / 8));
    const series = (k: "players" | "newPlayers" | "sessions" | "matches" | "finishedMatches" | "drills") =>
        daily.map((x) => ({ label: dayLabel(x.day), value: x[k] }));
    const sumOf = (k: "sessions" | "matches" | "drills" | "newPlayers") => daily.reduce((a, x) => a + x[k], 0);
    const periodLabel = days === 1 ? "오늘" : `최근 ${days}일`;
    const funnelMax = Math.max(f.appUsers, f.gameUsers, 1);
    const endMax = Math.max(1, ...Object.values(m.endReasons));
    const gameMax = Math.max(1, ...data.byGame.map((g) => g.sessions + g.matches));
    const todayDiff = today.players - today.playersYesterdaySoFar;
    const matchesShown = data.recentMatches.filter((r) => matchFilter === "all" || r.status === matchFilter);
    const nameBtn = (id: string, name: string) => onOpenMember
        ? <button type="button" onClick={() => onOpenMember(id)} className="font-semibold text-[rgba(0,0,0,0.87)] hover:text-brand hover:underline text-left">{name}</button>
        : <span className="font-semibold text-[rgba(0,0,0,0.87)]">{name}</span>;

    return (
        <div className={`space-y-5 ${isFetching ? "opacity-90" : ""}`}>
            {/* 기간 · 새로고침 */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex p-1 rounded-xl bg-black/[0.05]">
                    {[7, 30, 90].map((n) => (
                        <button key={n} type="button" onClick={() => setDays(n)} aria-pressed={days === n}
                            className={`h-8 px-3 rounded-lg text-[13px] font-bold ${days === n ? "bg-white text-[rgba(0,0,0,0.87)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-black/50"}`}>
                            {n}일
                        </button>
                    ))}
                </div>
                <button type="button" onClick={() => { void refetch(); }} className="ml-auto flex items-center gap-1.5 text-[12px] text-black/45 hover:text-brand">
                    <LucideRefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
                    {kstDateTime(new Date(dataUpdatedAt || Date.parse(data.generatedAt)).toISOString())} 기준 · 1분마다 갱신
                </button>
            </div>

            {/* 1. 지금 */}
            <section>
                <h3 className="text-[13px] font-black text-black/55 mb-2 flex items-center gap-1.5">
                    <span className="relative flex w-2 h-2"><span className="absolute inline-flex h-full w-full rounded-full bg-brand opacity-60 animate-ping" /><span className="relative inline-flex w-2 h-2 rounded-full bg-brand" /></span>
                    지금
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                    <Stat tone="live" label="지금 플레이 중" value={`${fmt(live.players)}명`} sub="싱글 10분 · 대전 2분 안에 활동" />
                    <Stat label="진행 중 싱글" value={fmt(live.singles)} />
                    <Stat label="진행 중 대전" value={fmt(live.matches)} sub="양쪽 중 한 명이라도 접속" />
                    <Stat label="열린 멀티방" value={fmt(live.openRooms)} sub="1시간 안에 만든 공개 대기 방" />
                </div>
            </section>

            {/* 2. 오늘 */}
            <section>
                <h3 className="text-[13px] font-black text-black/55 mb-2">오늘 <span className="font-medium text-black/35">(한국 0시부터)</span></h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                    <Stat tone="brand" label="오늘 이용자" value={`${fmt(today.players)}명`}
                        sub={<span>어제 이 시각 {fmt(today.playersYesterdaySoFar)}명 · <b className={todayDiff >= 0 ? "text-brand" : "text-red-600"}>{todayDiff >= 0 ? "+" : ""}{todayDiff}</b></span>} />
                    <Stat label="오늘 싱글" value={fmt(today.singles)} />
                    <Stat label="오늘 대전 참여" value={fmt(today.matchPlays)} sub="방 만들기 + 입장" />
                    <Stat label="오늘 드릴" value={fmt(today.drills)} />
                </div>
            </section>

            {/* 3. 기간 핵심 */}
            <section>
                <h3 className="text-[13px] font-black text-black/55 mb-2">{periodLabel} <span className="font-medium text-black/35">· 직전 {days}일과 비교</span></h3>
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5">
                    <Stat tone="brand" label="이용자" value={`${fmt(kpi.players)}명`} sub={<Delta cur={kpi.players} prev={kpi.playersPrev} />} />
                    <Stat label="신규 이용자" value={`${fmt(kpi.newPlayers)}명`} sub={<Delta cur={kpi.newPlayers} prev={kpi.newPlayersPrev} />} />
                    <Stat label="플레이" value={`${fmt(kpi.plays)}회`} sub={<Delta cur={kpi.plays} prev={kpi.playsPrev} />} />
                    <Stat label="끝난 대전" value={`${fmt(m.finished)}판`} sub={<Delta cur={m.finished} prev={m.finishedPrev} />} />
                    <Stat label="싱글 플레이 시간" value={minutesLabel(kpi.minutes)} sub={<Delta cur={kpi.minutes} prev={kpi.minutesPrev} />} />
                    <Stat label="재방문 이용자" value={pctText(kpi.returningPlayers, kpi.players)} sub={`${fmt(kpi.returningPlayers)}명이 이틀 이상 · 누적 ${fmt(kpi.playersAll)}명`} />
                </div>
            </section>

            {/* 4. 깔때기 + 코호트 */}
            <div className="grid lg:grid-cols-2 gap-4">
                <Card title="이용 깔때기" sub={`${periodLabel} — 앱을 연 회원 중 얼마나 게임까지 오나`}>
                    <BarRow label="앱 접속" value={f.appUsers} max={funnelMax} suffix="명" />
                    <BarRow label="온라인게임" value={f.gameUsers} max={funnelMax} suffix={`명 · ${pctText(f.gameUsers, f.appUsers)}`} />
                    <BarRow label="대전 1판+" value={f.matchUsers} max={funnelMax} suffix={`명 · ${pctText(f.matchUsers, f.appUsers)}`} />
                    <BarRow label="배치 완료(누적)" value={f.placedAll} max={funnelMax} suffix="명" />
                    <p className="mt-2 text-[11.5px] text-black/40">앱 접속은 접속 기록을 켠 날(9/13)부터 쌓입니다. 배치 완료 = 대전 3판 이상(랭킹 등재), 전체 기간.</p>
                </Card>
                <Card title="첫 플레이 주별 재방문" sub="그 주에 처음 게임한 사람이 다음 날(D1)·7일 안(D7)에 다시 했나">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm whitespace-nowrap">
                            <thead><tr className="text-[11.5px] text-black/45"><th className="text-left font-semibold py-1">첫 주</th><th className="text-right font-semibold">신규</th><th className="text-right font-semibold">D1</th><th className="text-right font-semibold">D7</th></tr></thead>
                            <tbody>
                                {data.cohorts.map((c) => (
                                    <tr key={c.week} className="border-t border-black/[0.06]">
                                        <td className="py-2 tabular-nums text-black/60">{c.week}~</td>
                                        <td className="py-2 text-right tabular-nums font-semibold">{fmt(c.players)}</td>
                                        {([[c.d1, c.d1Ready], [c.d7, c.d7Ready]] as [number, boolean][]).map(([v, ready], i) => {
                                            const p = pctOf(v, c.players);
                                            return (
                                                <td key={i} className="py-2 text-right tabular-nums">
                                                    <span className={p !== null && p >= 30 ? "font-bold text-brand" : "text-[rgba(0,0,0,0.8)]"}>{p === null ? "–" : `${p}%`}</span>
                                                    <span className="text-black/35 text-[11px]"> ({v}){ready ? "" : " 진행 중"}</span>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                                {data.cohorts.length === 0 && <tr><td colSpan={4} className="py-3 text-black/40">최근 8주 새 이용자가 없습니다</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            {/* 5. 추이 */}
            <div className="grid lg:grid-cols-2 gap-4">
                <Card title="일별 이용자" sub="싱글·대전·드릴 중 하나라도 한 회원">
                    <TrendLine points={series("players")} format={(v) => `${Math.round(v)}명`} ariaLabel="일별 이용자 선 그래프" emptyText="기록 없음" height={180} />
                </Card>
                <Card title="일별 신규 이용자" sub={`처음 게임한 날 기준 · ${periodLabel} 합 ${fmt(sumOf("newPlayers"))}명`}>
                    <Columns points={series("newPlayers")} format={(v) => `${Math.round(v)}명`} ariaLabel="일별 신규 이용자 막대 그래프" emptyText="기록 없음" height={180} labelEvery={every} />
                </Card>
                <Card title="일별 싱글 세션" sub={`${periodLabel} 합 ${fmt(sumOf("sessions"))}`}>
                    <Columns points={series("sessions")} format={(v) => String(Math.round(v))} ariaLabel="일별 싱글 세션 막대 그래프" emptyText="기록 없음" height={180} labelEvery={every} />
                </Card>
                <Card title="일별 대전(만든 방)" sub={`${periodLabel} 합 ${fmt(sumOf("matches"))} · 끝난 판 ${fmt(daily.reduce((a, x) => a + x.finishedMatches, 0))}`}>
                    <Columns points={daily.map((x) => ({ label: dayLabel(x.day), value: x.matches, detail: `끝난 판 ${x.finishedMatches}` }))} format={(v) => String(Math.round(v))} ariaLabel="일별 대전 막대 그래프" emptyText="기록 없음" height={180} labelEvery={every} />
                </Card>
            </div>

            <Card title="언제 붐비나" sub={`${periodLabel} 요일 × 시간별 플레이 수`}>
                <Heatmap grid={data.heatmap} />
            </Card>

            {/* 7. 품질 */}
            <div className="grid lg:grid-cols-3 gap-4">
                <Card title="대전 품질" sub={`${periodLabel} 만든 방 ${fmt(m.created)}개`}>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="rounded-xl bg-black/[0.03] p-3"><p className="text-[11px] font-bold text-black/45">성사율</p><p className="text-[18px] font-black tabular-nums">{pctText(m.started, m.created)}</p><p className="text-[11px] text-black/40 tabular-nums">상대 입장 {fmt(m.started)}</p></div>
                        <div className="rounded-xl bg-black/[0.03] p-3"><p className="text-[11px] font-bold text-black/45">취소율</p><p className="text-[18px] font-black tabular-nums">{pctText(m.canceled, m.created)}</p><p className="text-[11px] text-black/40 tabular-nums">취소 {fmt(m.canceled)}</p></div>
                        <div className="rounded-xl bg-black/[0.03] p-3"><p className="text-[11px] font-bold text-black/45">상대 기다림</p><p className="text-[18px] font-black tabular-nums">{secLabel(m.medianWaitSec)}</p><p className="text-[11px] text-black/40">중앙값</p></div>
                        <div className="rounded-xl bg-black/[0.03] p-3"><p className="text-[11px] font-bold text-black/45">한 판 길이</p><p className="text-[18px] font-black tabular-nums">{m.avgMinutes === null ? "–" : `${Math.round(m.avgMinutes)}분`}</p><p className="text-[11px] text-black/40 tabular-nums">평균 샷 {m.avgShots === null ? "–" : Math.round(m.avgShots)}</p></div>
                    </div>
                    <p className="text-[12px] font-bold text-black/50 mb-1">끝난 이유 <span className="font-medium text-black/35">(끝난 판 {fmt(m.finished)})</span></p>
                    {(["target", "inningCap", "resign", "claim"] as const).map((k) => (
                        <BarRow key={k} label={END[k]} value={m.endReasons[k]} max={endMax} suffix={pctText(m.endReasons[k], m.finished)} />
                    ))}
                    {m.finished > 0 && (m.endReasons.claim / m.finished) >= 0.2 && (
                        <p className="mt-1 text-[11.5px] text-amber-700">무응답 승이 {pctText(m.endReasons.claim, m.finished)} — 중간에 나가는 대전이 많습니다.</p>
                    )}
                </Card>
                <Card title="대전 방 설정" sub={`${periodLabel} · 대전한 사람 ${fmt(m.players)}명`}>
                    <ul className="text-[13px] space-y-2">
                        {([
                            ["공개 멀티방", m.publicRooms], ["비밀번호 방", m.passwordRooms], ["푸시 초대", m.invited],
                            ["리얼리티 모드", m.reality], ["핸디 적용", m.handicap],
                        ] as [string, number][]).map(([label, v]) => (
                            <li key={label} className="flex justify-between"><span className="text-black/60">{label}</span><span className="tabular-nums font-bold">{fmt(v)} <span className="text-black/40 font-normal">({pctText(v, m.created)})</span></span></li>
                        ))}
                    </ul>
                    <div className="mt-4 rounded-xl bg-black/[0.03] p-3">
                        <p className="text-[11px] font-bold text-black/45">무결성 — 해시 불일치</p>
                        <p className="text-[13px] tabular-nums mt-0.5">
                            대전 <b className={m.mismatchGames ? "text-red-600" : ""}>{fmt(m.mismatchGames)}</b>판 · 싱글 <b className={s.mismatchGames ? "text-red-600" : ""}>{fmt(s.mismatchGames)}</b>판
                            <span className="text-black/40"> (샷 {fmt(m.mismatches + s.mismatches)}건)</span>
                        </p>
                        <p className="text-[11px] text-black/40 mt-0.5">기기와 서버의 물리 결과가 달랐던 판 — 늘면 엔진 버전·조작을 의심합니다.</p>
                    </div>
                </Card>
                <Card title="싱글 · 드릴" sub={periodLabel}>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-black/[0.03] p-3"><p className="text-[11px] font-bold text-black/45">싱글 세션</p><p className="text-[18px] font-black tabular-nums">{fmt(s.total)}</p><p className="text-[11px] tabular-nums"><Delta cur={s.total} prev={s.totalPrev} /></p></div>
                        <div className="rounded-xl bg-black/[0.03] p-3"><p className="text-[11px] font-bold text-black/45">끝까지 친 비율</p><p className="text-[18px] font-black tabular-nums">{pctText(s.finished, s.total)}</p><p className="text-[11px] text-black/40 tabular-nums">이용자 {fmt(s.players)}명</p></div>
                        <div className="rounded-xl bg-black/[0.03] p-3"><p className="text-[11px] font-bold text-black/45">평균 이닝 · 시간</p><p className="text-[18px] font-black tabular-nums">{s.avgInnings === null ? "–" : s.avgInnings.toFixed(1)}</p><p className="text-[11px] text-black/40 tabular-nums">{s.avgMinutes === null ? "–" : `${Math.round(s.avgMinutes)}분`} · 샷 {fmt(s.shots)}</p></div>
                        <div className="rounded-xl bg-black/[0.03] p-3"><p className="text-[11px] font-bold text-black/45">드릴 성공률</p><p className="text-[18px] font-black tabular-nums">{pctText(d.successes, d.attempts)}</p><p className="text-[11px] text-black/40 tabular-nums">시도 {fmt(d.attempts)} · {fmt(d.players)}명</p></div>
                    </div>
                    <p className="text-[12px] font-bold text-black/50 mt-4 mb-1">종목 · 테이블 <span className="font-medium text-black/35">(싱글+대전)</span></p>
                    {data.byGame.map((g) => (
                        <BarRow key={`${g.gameType}-${g.tableId}`} label={gameName(g.gameType, g.tableId)} value={g.sessions + g.matches} max={gameMax} />
                    ))}
                    {data.byGame.length === 0 && <p className="text-[12.5px] text-black/40">기록 없음</p>}
                </Card>
            </div>

            {/* 8. 사람 */}
            <div className="grid lg:grid-cols-[3fr_2fr] gap-4">
                <Card title="많이 한 이용자" sub={`${periodLabel} 플레이 수 기준 15명 — 이름을 누르면 회원 상세`}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm whitespace-nowrap">
                            <thead><tr className="text-[11.5px] text-black/45">
                                <th className="text-left font-semibold py-1">이름</th><th className="text-right font-semibold">싱글</th><th className="text-right font-semibold">대전</th>
                                <th className="text-right font-semibold">승</th><th className="text-right font-semibold">드릴</th><th className="text-right font-semibold" title="기간 중 게임한 날 수">날</th>
                                <th className="text-right font-semibold">레이팅</th><th className="text-right font-semibold">최고 에버</th><th className="text-right font-semibold">최근</th>
                            </tr></thead>
                            <tbody>
                                {data.topPlayers.map((p, i) => (
                                    <tr key={p.memberId} className="border-t border-black/[0.06]">
                                        <td className="py-2"><span className="inline-block w-5 text-black/35 tabular-nums">{i + 1}</span>{nameBtn(p.memberId, p.name)}</td>
                                        <td className="py-2 text-right tabular-nums">{fmt(p.sessions)}</td>
                                        <td className="py-2 text-right tabular-nums">{fmt(p.matches)}</td>
                                        <td className="py-2 text-right tabular-nums">{fmt(p.wins)}</td>
                                        <td className="py-2 text-right tabular-nums">{fmt(p.drills)}</td>
                                        <td className="py-2 text-right tabular-nums">{p.days}</td>
                                        <td className="py-2 text-right tabular-nums">{p.rating === null ? "–" : fmt(p.rating)}</td>
                                        <td className="py-2 text-right tabular-nums">{p.bestAvg ? p.bestAvg.toFixed(2) : "–"}</td>
                                        <td className="py-2 text-right text-black/45 tabular-nums">{agoLabel(p.lastAt)}</td>
                                    </tr>
                                ))}
                                {data.topPlayers.length === 0 && <tr><td colSpan={9} className="py-3 text-black/40">기록 없음</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </Card>
                <Card title="새로 시작한 이용자" sub={`${periodLabel} 처음 게임한 사람 — 최근 15명`}>
                    <ul className="divide-y divide-black/[0.06]">
                        {data.newPlayers.map((p) => (
                            <li key={p.memberId} className="py-2 flex items-center gap-2 text-[13px]">
                                <span className="min-w-0 flex-1 truncate">{nameBtn(p.memberId, p.name)}</span>
                                <Pill>{KIND[p.firstKind] ?? p.firstKind}로 시작</Pill>
                                <span className={`w-14 text-right tabular-nums ${p.plays >= 3 ? "font-bold text-brand" : "text-black/55"}`} title="지금까지 플레이 수">{fmt(p.plays)}회</span>
                                <span className="w-16 text-right text-[12px] text-black/40 tabular-nums">{agoLabel(p.firstAt)}</span>
                            </li>
                        ))}
                        {data.newPlayers.length === 0 && <li className="py-3 text-[13px] text-black/40">기간 중 새 이용자가 없습니다</li>}
                    </ul>
                    <p className="mt-2 text-[11px] text-black/35">3회 이상 한 사람은 초록색 — 첫 경험 뒤에 다시 왔는지 봅니다.</p>
                </Card>
            </div>

            <Card title="최근 대전" sub="최근 20판" right={
                <div className="flex gap-1">
                    {([["all", "전체"], ["playing", "진행 중"], ["finished", "종료"], ["canceled", "취소"]] as const).map(([k, label]) => (
                        <button key={k} type="button" onClick={() => setMatchFilter(k)}
                            className={`h-7 px-2.5 rounded-full text-[12px] font-bold ${matchFilter === k ? "bg-brand text-white" : "bg-black/[0.05] text-black/55"}`}>{label}</button>
                    ))}
                </div>
            }>
                <ul className="divide-y divide-black/[0.06]">
                    {matchesShown.map((r) => {
                        const st = STATUS[r.status] ?? { label: r.status, tone: "neutral" as const };
                        const lenMin = r.startedAt && r.lastShotAt ? Math.round((Date.parse(r.lastShotAt) - Date.parse(r.startedAt)) / 60000) : null;
                        return (
                            <li key={r.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-[13px]">
                                <span className="flex items-center gap-1.5 min-w-0 sm:flex-1">
                                    <Pill tone={st.tone}>{st.label}</Pill>
                                    <span className="font-semibold truncate">{r.hostName} <span className="text-black/35 font-normal">vs</span> {r.guestName ?? "–"}</span>
                                    {r.winnerName && <span className="shrink-0 text-[11.5px] text-brand font-bold">🏆 {r.winnerName}</span>}
                                </span>
                                <span className="text-[12px] text-black/50 tabular-nums">
                                    {gameName(r.gameType, r.tableId)}
                                    {r.isPublic ? " · 멀티방" : r.hasPassword ? " · 비번" : r.invited ? " · 초대" : ""}
                                    {r.reality ? " · 리얼리티" : ""}
                                    {r.endReason ? ` · ${END[r.endReason] ?? r.endReason}` : ""}
                                    {r.shots ? ` · 샷 ${r.shots}` : ""}{lenMin !== null && lenMin >= 0 ? ` · ${lenMin}분` : ""}
                                    {r.mismatches ? <b className="text-red-600"> · 불일치 {r.mismatches}</b> : null}
                                </span>
                                <span className="text-[12px] text-black/40 tabular-nums sm:w-20 sm:text-right">{agoLabel(r.createdAt)}</span>
                            </li>
                        );
                    })}
                    {matchesShown.length === 0 && <li className="py-3 text-[13px] text-black/40">해당하는 대전이 없습니다</li>}
                </ul>
            </Card>

            <RatingRecomputeCard />
        </div>
    );
}
