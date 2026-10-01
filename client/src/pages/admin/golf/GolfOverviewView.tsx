/**
 * 골프 관리 — 골프 현황(2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자").
 * 데이터: GET /api/hiq/admin/golf/overview (1분마다). 숫자를 누르면 그 일을 하는 골프 탭으로 간다.
 *
 * 그전엔 골프 상태를 보려면 DB 를 직접 열어야 했다 — 멈춘 방, 사진 이의제기, 랭킹·시세 수집이 멈췄는지(시세는 9/24 뒤로
 * 한 번도 안 들어왔다) 어디에도 안 보였다. 위에서 아래로 "처리할 일 → 라운드 → 조인·부킹 → 사진 → 골프장 데이터 → 외부 자료".
 *
 * 외부 자료 카드는 랭킹 4개 투어와 회원권 시세가 '들어오고 있나'를 본다. 판정(정상·늦음·멈춤)은 서버가 한다 —
 * 운영자 알림(feedHealth)과 같은 함수라 화면과 알림의 기준이 갈리지 않는다.
 * '시세 동기화 미리 보기'는 피드를 받아 골프장에 붙여 보기만 한다(쓰지 않는다).
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LucideCheckCircle, LucideRefreshCw } from "@/lib/icons";
import { GOLF_TOUR_META, type GolfTour } from "@shared/golfTours";
import { KpiTile, Panel, Pill, agoLabel, kstDateTime } from "../adminUtils";

export const GOLF_OVERVIEW_KEY = ["/api/hiq/admin/golf/overview"] as const;
const DRY_RUN_URL = "/api/hiq/admin/golf/overview/price-sync/dry-run";

// ── 서버 응답 모양(server/routes/modules/adminGolf/overview.ts) ──────────────
type FeedState = "ok" | "late" | "stopped";
type Tour = GolfTour;

interface Rounds {
    finishedToday: number; finished7d: number; finished30d: number; abandoned30d: number;
    playing: number; waiting: number; stale: number; staleWaiting: number; stalePlaying: number;
    golfers30d: number; records30d: number; recorders30d: number;
    onSite: { verified: number; unverified: number; legacy: number };
}
interface Listings {
    upcomingJoin: number; upcomingBooking: number; upcomingJoinToday: number; upcomingBookingToday: number;
    createdToday: number; createdTodayJoin: number; createdTodayBooking: number;
    appliedUpcoming: number; appliedTotal: number; blinded: number; blindedUpcoming: number;
    urgentToday: number; urgentNow: number; urgentPosts7d: number; urgentRecipients7d: number; watchAlerts7d: number;
}
interface Photos { total: number; public: number; hidden: number; appealsOpen: number; uploaded7d: number; uploadedToday: number }
interface Courses {
    pages: number; withLogo: number; withWebsite: number; withPhone: number; withCourses: number; withClub: number;
    nines: number; ninesWithPars: number; clubs: number; clubsNoCoords: number; clubsNoCoordsAnywhere: number;
    watches: number; watchers: number;
}
interface Orders { pending: number; contacted: number; oldestPendingAt: string | null }
interface RankingFeed {
    tour: Tour; edition: string | null; ingestedAt: string | null; lastSyncAt: string | null;
    state: FeedState; editionAgeDays: number | null; syncAgeHours: number | null; limitDays: number | null;
    alert: boolean; reason: string; detail: string;
}
interface PriceFeed {
    asOf: string | null; items: number; updatedAt: string | null;
    state: FeedState; asOfAgeDays: number | null; syncAgeHours: number | null; reason: string; detail: string;
}
interface GolfOverview {
    generatedAt: string;
    rounds: Rounds | null; listings: Listings | null; photos: Photos | null; courses: Courses | null; orders: Orders | null;
    feeds: { rankings: RankingFeed[] | null; prices: PriceFeed | null };
    failed: string[];
}
type DryRun =
    | { ok: true; generatedAt: string | null; feedItems: number; wouldWrite: number; historyPoints: number; unmatchedCount: number; unmatched: string[]; checkedAt: string }
    | { ok: false; reason: string; feedItems: number | null; checkedAt: string };

// ── 표기 ─────────────────────────────────────────────────────────
const fmt = (v: number) => v.toLocaleString("ko-KR");
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const TOUR_NAME: Record<Tour, string> = { owgr: "남자 세계 · OWGR", rolex: "여자 세계 · 롤렉스", kpga: "KPGA", klpga: "KLPGA" };
const TOUR_SHORT: Record<Tour, string> = { owgr: "OWGR", rolex: "롤렉스", kpga: "KPGA", klpga: "KLPGA" };
/** 크론 시각은 vercel.json(golf-sync 21:40~22:10 UTC · golf-prices 12:40 UTC)을 한국 시각으로 */
const TOUR_RULE: Record<Tour, string> = {
    owgr: "매주 월요일 발표 · 매일 06:40 확인",
    rolex: "매주 월요일 발표 · 매일 06:50 확인",
    kpga: "대회가 끝나면 바뀜 · 매일 07:00 확인",
    klpga: "대회가 끝나면 바뀜 · 매일 07:10 확인",
};
const FAILED_NAME: Record<string, string> = { rounds: "라운드", listings: "조인·부킹", photos: "사진", courses: "골프장 데이터", orders: "회원권 접수", prices: "회원권 시세", rankings: "랭킹 수집" };
const STATE_PILL: Record<FeedState, { tone: "brand" | "warn" | "alert"; label: string }> = {
    ok: { tone: "brand", label: "정상" }, late: { tone: "warn", label: "늦음" }, stopped: { tone: "alert", label: "멈춤" },
};

/** "11시간" · "3일" */
function hoursText(h: number | null): string {
    if (h === null) return "-";
    if (h < 1) return "방금";
    return h < 48 ? `${Math.round(h)}시간` : `${Math.floor(h / 24)}일`;
}
/** "2026-09-27" → "9/27" */
function md(day: string | null): string {
    if (!day) return "-";
    const [, m, d] = day.split("-");
    return m && d ? `${Number(m)}/${Number(d)}` : day;
}
/** 한국 날짜 'YYYY-MM-DD' */
const kstToday = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

// ── 조각 ─────────────────────────────────────────────────────────
function Section({ title, sub, onMore, moreLabel, children }: {
    title: string; sub?: string; onMore?: () => void; moreLabel?: string; children: React.ReactNode;
}) {
    return (
        <section>
            <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                    <h3 className="text-[14px] font-black text-black/60">{title}</h3>
                    {sub && <p className="mt-0.5 text-[11.5px] text-black/40">{sub}</p>}
                </div>
                {onMore && <button type="button" onClick={onMore} className="shrink-0 h-9 -my-2 px-1 -mr-1 text-[12.5px] font-bold text-brand">{moreLabel ?? "자세히"} →</button>}
            </div>
            {children}
        </section>
    );
}

function Missing({ what }: { what: string }) {
    return <div className="rounded-2xl bg-white border border-black/[0.08] p-4 text-[13px] text-black/50">{what} 숫자를 불러오지 못했습니다.</div>;
}

/** 한 줄 막대(여러 칸) + 범례. 색은 칸마다 정한다(브랜드 = 좋은 쪽). */
function StackBar({ parts, empty }: { parts: { label: string; value: number; dot: string }[]; empty: string }) {
    const total = parts.reduce((a, p) => a + p.value, 0);
    if (total === 0) return <p className="text-[12.5px] text-black/40">{empty}</p>;
    return (
        <div>
            <div className="h-2.5 rounded-full bg-black/[0.05] overflow-hidden flex" role="img"
                aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
                {parts.map((p) => p.value > 0 && <div key={p.label} className={p.dot} style={{ width: `${(p.value / total) * 100}%` }} />)}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-black/55 tabular-nums">
                {parts.map((p) => (
                    <span key={p.label} className="inline-flex items-center gap-1.5">
                        <i className={`w-2 h-2 rounded-full ${p.dot}`} aria-hidden />
                        {p.label} <b className="text-[rgba(0,0,0,0.8)]">{fmt(p.value)}</b>
                        <span className="text-black/35">{pct(p.value, total)}%</span>
                    </span>
                ))}
            </div>
        </div>
    );
}

/** 빈칸 채움 막대 한 줄(골프장 데이터) */
function CoverageRow({ label, have, total }: { label: string; have: number; total: number }) {
    const p = pct(have, total);
    return (
        <div className="grid grid-cols-[64px_1fr_auto] items-center gap-2.5 py-1">
            <span className="text-[12.5px] text-black/60">{label}</span>
            <div className="h-2.5 rounded-full bg-black/[0.05] overflow-hidden"><div className="h-full rounded-full bg-brand" style={{ width: `${p}%` }} /></div>
            <span className="text-[12.5px] tabular-nums text-right min-w-[92px]">
                <b className="text-[rgba(0,0,0,0.8)]">{fmt(have)}</b><span className="text-black/40"> / {fmt(total)} · {p}%</span>
            </span>
        </div>
    );
}

function FeedRow({ name, state, extra, facts, rule, problem }: {
    name: string; state: FeedState; extra?: React.ReactNode; facts: string; rule: string; problem?: string;
}) {
    const p = STATE_PILL[state];
    return (
        <li className="px-4 py-3 md:grid md:grid-cols-[200px_1fr] md:gap-4 md:items-start">
            <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[13.5px] font-bold text-[rgba(0,0,0,0.85)]">{name}</span>
                <Pill tone={p.tone}>{p.label}</Pill>
                {extra}
            </div>
            <div className="mt-1 md:mt-0 min-w-0">
                <p className="text-[12.5px] text-[rgba(0,0,0,0.75)] tabular-nums">{facts}</p>
                {problem && <p className={`mt-0.5 text-[12px] font-bold ${state === "stopped" ? "text-red-600" : "text-amber-700"}`}>{problem}</p>}
                <p className="mt-0.5 text-[11.5px] text-black/40">{rule}</p>
            </div>
        </li>
    );
}

/** 문제 줄 — 서버의 짧은 이유 + 무엇을 확인할지 */
function rankingProblem(f: RankingFeed): string | undefined {
    if (f.state === "ok") return undefined;
    if (f.state === "stopped") return `${f.reason} — 크론 응답·출처를 확인해 주세요`;
    return `${f.reason} — ${GOLF_TOUR_META[f.tour]?.world ? "출처 발표가 밀렸는지 확인" : "대회가 없던 주인지 확인"}`;
}

function DryRunResult({ r }: { r: DryRun }) {
    if (!r.ok) {
        return (
            <div className="mt-3 rounded-xl bg-red-500/[0.05] border border-red-500/20 p-3 text-[12.5px]">
                <p className="font-bold text-red-600">{r.reason}</p>
                <p className="mt-1 text-black/55 leading-relaxed">
                    {r.reason.includes("404") ? "피드 주소에 아무것도 없습니다 — TGM 쪽 /api/feed/golf-prices 가 배포됐는지 확인해 주세요. " : ""}
                    미리 보기라 아무것도 쓰지 않았습니다.
                </p>
                <p className="mt-1 text-[11.5px] text-black/40 tabular-nums">{kstDateTime(r.checkedAt)} 확인</p>
            </div>
        );
    }
    return (
        <div className="mt-3 rounded-xl bg-black/[0.03] p-3 text-[12.5px]">
            <div className="grid grid-cols-3 gap-2 tabular-nums">
                {[
                    { label: "피드 종목", value: r.feedItems },
                    { label: "골프장에 붙음", value: r.wouldWrite },
                    { label: "이력 점", value: r.historyPoints },
                ].map((x) => (
                    <div key={x.label} className="rounded-lg bg-white border border-black/[0.06] px-2.5 py-2">
                        <p className="text-[11px] font-bold text-black/45">{x.label}</p>
                        <p className="text-[16px] font-black text-[rgba(0,0,0,0.85)]">{fmt(x.value)}</p>
                    </div>
                ))}
            </div>
            <p className="mt-2.5 text-black/60">
                못 붙은 종목 <b className={r.unmatchedCount > 0 ? "text-amber-700" : "text-[rgba(0,0,0,0.8)]"}>{fmt(r.unmatchedCount)}개</b>
                {r.unmatchedCount > 0 ? " — 새 골프장은 적재 스크립트로 짝을 지어야 들어갑니다." : " — 전부 골프장에 붙습니다."}
            </p>
            {r.unmatched.length > 0 && (
                <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-white border border-black/[0.06] divide-y divide-black/[0.05]">
                    {r.unmatched.map((u) => <li key={u} className="px-2.5 py-1.5 text-[12px] text-black/65 break-all">{u}</li>)}
                </ul>
            )}
            {r.unmatchedCount > r.unmatched.length && <p className="mt-1 text-[11.5px] text-black/40">앞의 {fmt(r.unmatched.length)}개만 보여 줍니다.</p>}
            <p className="mt-2 text-[11.5px] text-black/40 tabular-nums">
                피드 기준 {r.generatedAt ?? "-"} · {kstDateTime(r.checkedAt)} 확인 · 미리 보기라 아무것도 쓰지 않았습니다.
            </p>
        </div>
    );
}

// ── 화면 ─────────────────────────────────────────────────────────
export default function GolfOverviewView({ onOpenTab }: { onOpenTab?: (tab: string) => void }) {
    const { toast } = useToast();
    const [dry, setDry] = useState<DryRun | null>(null);
    const { data, isPending, isError, refetch, isFetching } = useQuery<GolfOverview>({
        queryKey: GOLF_OVERVIEW_KEY,
        staleTime: 30_000,
        refetchInterval: 60_000,
    });
    const run = useMutation({
        mutationFn: async () => apiRequest(DRY_RUN_URL, { method: "POST" }) as Promise<DryRun>,
        onSuccess: (r) => {
            setDry(r);
            toast(r.ok ? { title: "미리 보기를 마쳤습니다 — 쓴 것은 없습니다" } : { title: "피드 받기 실패", variant: "destructive" });
        },
        onError: (e: any) => toast({ title: e?.message || "미리 보기 실패", variant: "destructive" }),
    });

    if (isPending) return <p className="text-sm text-black/50 p-6">불러오는 중…</p>;
    // 모양까지 확인 — 옛 캐시가 올라와도 화면이 멈추지 않게
    if (isError || !data || !data.feeds) return (
        <div className="p-6 flex items-center gap-3">
            <p className="text-sm text-black/60">골프 현황을 불러오지 못했어요.</p>
            <button type="button" onClick={() => { void refetch(); }} className="h-9 px-3 rounded-lg border border-black/10 text-sm font-semibold">다시 시도</button>
        </div>
    );

    const { rounds: r, listings: l, photos: ph, courses: c, orders: o } = data;
    const rankings = Array.isArray(data.feeds.rankings) ? data.feeds.rankings : null;
    const prices = data.feeds.prices;
    const failed = Array.isArray(data.failed) ? data.failed : [];
    const go = (tab: string) => (onOpenTab ? () => onOpenTab(tab) : undefined);
    const toFeeds = () => document.getElementById("golf-feeds")?.scrollIntoView({ behavior: "smooth", block: "start" });

    // 처리할 일 — 쌓인 것만. 외부 자료는 알림 대상(멈춤·세계 랭킹 늦음)과 시세 멈춤만 센다 —
    // 투어 랭킹 늦음·시세 기준일은 출처 사정(대회 없는 주·연휴)일 때가 많아 노란 표시로만 둔다.
    const feedProblems = [
        ...(rankings ?? []).filter((x) => x.alert).map((x) => TOUR_SHORT[x.tour]),
        ...(prices?.state === "stopped" ? ["회원권 시세"] : []),
    ];
    const todos = [
        { key: "stale", label: "멈춘 방", n: r?.stale ?? 0, unit: "방", sub: r ? `대기 ${r.staleWaiting} · 진행 ${r.stalePlaying}` : "", onClick: go("golf-rounds") },
        { key: "appeals", label: "사진 이의제기", n: ph?.appealsOpen ?? 0, unit: "건", sub: "가려진 사진", onClick: go("golf-photos") },
        { key: "feeds", label: "외부 자료 문제", n: feedProblems.length, unit: "개", sub: feedProblems.join(" · "), onClick: toFeeds },
        { key: "orders", label: "회원권 접수 대기", n: o?.pending ?? 0, unit: "건", sub: o?.oldestPendingAt ? `가장 오래된 것 ${agoLabel(o.oldestPendingAt)}` : "상담 접수", onClick: go("golf-orders") },
    ].filter((t) => t.n > 0);
    const today = kstToday();

    return (
        <div className="space-y-6 break-keep">
            <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] text-black/45 tabular-nums">{kstDateTime(data.generatedAt)} 기준 · 1분마다 새로 고침 · 한국 시각</p>
                <button type="button" onClick={() => { void refetch(); }} disabled={isFetching}
                    className="shrink-0 h-9 px-3 rounded-lg border border-black/10 bg-white inline-flex items-center gap-1.5 text-[12.5px] font-bold text-black/60 disabled:opacity-60">
                    <LucideRefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> 새로 고침
                </button>
            </div>

            {failed.length > 0 && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-[12.5px] text-amber-800">
                    일부 숫자를 불러오지 못했습니다: {failed.map((f) => FAILED_NAME[f] ?? f).join(", ")}
                </div>
            )}

            <section>
                <h3 className="text-[14px] font-black text-black/60 mb-2">처리할 일</h3>
                {todos.length === 0 ? (
                    <div className="rounded-2xl bg-white border border-black/[0.08] p-4 flex items-center gap-2 text-[13.5px] text-black/55">
                        <LucideCheckCircle className="w-4 h-4 text-brand" /> 지금 밀린 일이 없습니다.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                        {todos.map((t) => <KpiTile key={t.key} label={t.label} value={t.n} unit={t.unit} tone="alert" sub={t.sub} onClick={t.onClick} />)}
                    </div>
                )}
            </section>

            <Section title="라운드" sub="7일·30일은 오늘 포함 · 멈춘 방 = 대기 6시간, 진행 중 12시간 넘게 그대로" onMore={go("golf-rounds")} moreLabel="라운드">
                {!r ? <Missing what="라운드" /> : (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                            <KpiTile label="끝난 라운드 · 오늘" value={fmt(r.finishedToday)} unit="판" sub={`7일 ${fmt(r.finished7d)} · 30일 ${fmt(r.finished30d)}`} onClick={go("golf-rounds")} />
                            <KpiTile label="진행 중" value={fmt(r.playing)} unit="방" sub={`대기 중 ${fmt(r.waiting)}방`} onClick={go("golf-rounds")} />
                            <KpiTile label="멈춘 방" value={fmt(r.stale)} unit="방" tone={r.stale > 0 ? "alert" : "default"}
                                sub={`대기 ${r.staleWaiting} · 진행 ${r.stalePlaying}`} onClick={go("golf-rounds")} />
                            <KpiTile label="골퍼 · 30일" value={fmt(r.golfers30d)} unit="명" sub={`기록 ${fmt(r.records30d)}건 · ${fmt(r.recorders30d)}명`} />
                        </div>
                        <div className="mt-2.5 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            <Panel className="p-4">
                                <p className="text-[12px] font-bold text-black/50 mb-2.5">현장 인증 · 30일 기록</p>
                                <StackBar empty="최근 30일 기록이 없습니다." parts={[
                                    { label: "현장 인증", value: r.onSite.verified, dot: "bg-brand" },
                                    { label: "확인 못 함", value: r.onSite.unverified, dot: "bg-amber-400" },
                                    { label: "규칙 전 기록", value: r.onSite.legacy, dot: "bg-black/20" },
                                ]} />
                            </Panel>
                            <Panel className="p-4">
                                <p className="text-[12px] font-bold text-black/50 mb-2.5">방 결과 · 30일</p>
                                <StackBar empty="최근 30일에 끝나거나 접은 방이 없습니다." parts={[
                                    { label: "끝까지 침", value: r.finished30d, dot: "bg-brand" },
                                    { label: "방장이 접음", value: r.abandoned30d, dot: "bg-black/25" },
                                ]} />
                            </Panel>
                        </div>
                    </>
                )}
            </Section>

            <Section title="조인·부킹" sub="다가오는 글은 가려진 글을 뺀 수" onMore={go("golf-listings")} moreLabel="조인·부킹">
                {!l ? <Missing what="조인·부킹" /> : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                        <KpiTile label="다가오는 조인" value={fmt(l.upcomingJoin)} unit="건" sub={`오늘 티 ${fmt(l.upcomingJoinToday)}`} onClick={go("golf-listings")} />
                        <KpiTile label="다가오는 부킹" value={fmt(l.upcomingBooking)} unit="건" sub={`오늘 티 ${fmt(l.upcomingBookingToday)}`} onClick={go("golf-listings")} />
                        <KpiTile label="오늘 올라온 글" value={fmt(l.createdToday)} unit="건" tone={l.createdToday > 0 ? "brand" : "default"}
                            sub={`조인 ${l.createdTodayJoin} · 부킹 ${l.createdTodayBooking}`} onClick={go("golf-listings")} />
                        <KpiTile label="결정 대기 신청" value={fmt(l.appliedUpcoming)} unit="건" sub={`지난 글 포함 ${fmt(l.appliedTotal)}`} onClick={go("golf-listings")} />
                        <KpiTile label="긴급 조인 · 오늘" value={fmt(l.urgentToday)} unit="건" sub={`지금 긴급 표시 ${fmt(l.urgentNow)}`} onClick={go("golf-listings")} />
                        <KpiTile label="긴급 알림 · 7일" value={fmt(l.urgentPosts7d)} unit="건" sub={`받은 사람 ${fmt(l.urgentRecipients7d)}명`} onClick={go("golf-listings")} />
                        <KpiTile label="가려진 글" value={fmt(l.blinded)} unit="건" sub={`다가오는 글 ${fmt(l.blindedUpcoming)}`} onClick={go("golf-listings")} />
                        {o ? (
                            <KpiTile label="회원권 접수 대기" value={fmt(o.pending)} unit="건" tone={o.pending > 0 ? "alert" : "default"}
                                sub={`연락함 ${fmt(o.contacted)}`} onClick={go("golf-orders")} />
                        ) : <KpiTile label="회원권 접수 대기" value="-" sub="불러오지 못함" onClick={go("golf-orders")} />}
                    </div>
                )}
            </Section>

            <Section title="라운드 사진" sub="공개하면 골프장 페이지에 바로 · 신고 3명이면 자동 가림" onMore={go("golf-photos")} moreLabel="사진">
                {!ph ? <Missing what="사진" /> : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                        <KpiTile label="공개 사진" value={fmt(ph.public)} unit="장" sub={`전체 ${fmt(ph.total)}장`} onClick={go("golf-photos")} />
                        <KpiTile label="가려진 사진" value={fmt(ph.hidden)} unit="장" sub="올린 사람만 봄" onClick={go("golf-photos")} />
                        <KpiTile label="이의제기" value={fmt(ph.appealsOpen)} unit="건" tone={ph.appealsOpen > 0 ? "alert" : "default"}
                            sub="가려진 뒤 낸 것" onClick={go("golf-photos")} />
                        <KpiTile label="올라온 사진 · 7일" value={fmt(ph.uploaded7d)} unit="장" sub={`오늘 ${fmt(ph.uploadedToday)}장`} onClick={go("golf-photos")} />
                    </div>
                )}
            </Section>

            <Section title="골프장 데이터" sub="골프장 페이지의 빈칸과 랭큐매치 명부(코스별 파·좌표)" onMore={go("golf-courses")} moreLabel="골프장 데이터">
                {!c ? <Missing what="골프장 데이터" /> : (
                    <>
                        <Panel className="p-4">
                            <p className="text-[12px] font-bold text-black/50 mb-1.5">골프장 페이지 {fmt(c.pages)}곳 · 채워진 칸</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-8">
                                <CoverageRow label="로고" have={c.withLogo} total={c.pages} />
                                <CoverageRow label="홈페이지" have={c.withWebsite} total={c.pages} />
                                <CoverageRow label="전화" have={c.withPhone} total={c.pages} />
                                <CoverageRow label="코스·파" have={c.withCourses} total={c.pages} />
                                <CoverageRow label="명부 연결" have={c.withClub} total={c.pages} />
                            </div>
                        </Panel>
                        <div className="mt-2.5 grid grid-cols-2 md:grid-cols-3 gap-2.5">
                            <KpiTile label="홀별 파가 있는 코스" value={fmt(c.ninesWithPars)} unit={`/ ${fmt(c.nines)}`}
                                sub={`파 없는 코스 ${fmt(c.nines - c.ninesWithPars)}`} onClick={go("golf-courses")} />
                            <KpiTile label="좌표 없는 명부" value={fmt(c.clubsNoCoords)} unit={`/ ${fmt(c.clubs)}곳`}
                                sub={`페이지 좌표도 없음 ${fmt(c.clubsNoCoordsAnywhere)}`} onClick={go("golf-courses")} />
                            <div className="col-span-2 md:col-span-1 grid">
                                <KpiTile label="관심 골프장" value={fmt(c.watches)} unit="개" sub={`${fmt(c.watchers)}명 · 7일 알림 ${fmt(l?.watchAlerts7d ?? 0)}통`} />
                            </div>
                        </div>
                    </>
                )}
            </Section>

            <div id="golf-feeds" className="scroll-mt-20">
                <Section title="외부 자료" sub="매일 받아 옵니다 · 30시간 넘게 못 받으면 멈춤 · 한국 시각">
                    <Panel className="overflow-hidden">
                        <ul className="divide-y divide-black/[0.06]">
                            {!rankings ? (
                                <li className="px-4 py-3 text-[13px] text-black/50">랭킹 수집 상태를 불러오지 못했습니다.</li>
                            ) : rankings.map((f) => {
                                const ahead = !!f.edition && f.edition > today;
                                return (
                                    <FeedRow key={f.tour} name={TOUR_NAME[f.tour]} state={f.state}
                                        extra={f.limitDays === null ? <Pill tone="neutral">비시즌</Pill> : undefined}
                                        facts={f.edition
                                            ? `${md(f.edition)} 회차${ahead ? "(미리 붙은 날짜)" : ""} · 들어온 지 ${hoursText((f.editionAgeDays ?? 0) * 24)} · 수집 ${hoursText(f.syncAgeHours)} 전`
                                            : `회차 없음 · 수집 ${hoursText(f.syncAgeHours)} 전`}
                                        problem={rankingProblem(f)}
                                        rule={`${TOUR_RULE[f.tour]} · ${f.limitDays === null ? "비시즌이라 회차 날짜는 재지 않음" : `새 회차가 ${f.limitDays}일 넘게 없으면 늦음`}`} />
                                );
                            })}
                            {!prices ? (
                                <li className="px-4 py-3 text-[13px] text-black/50">회원권 시세 상태를 불러오지 못했습니다.</li>
                            ) : (
                                <FeedRow name="회원권 시세 · TGM" state={prices.state}
                                    facts={`기준일 ${md(prices.asOf)} · ${fmt(prices.items)}종목 · 마지막 반영 ${hoursText(prices.syncAgeHours)} 전`}
                                    problem={prices.state === "ok" ? undefined : prices.state === "stopped" ? `${prices.reason} — 아래 미리 보기로 피드를 확인해 주세요` : prices.reason}
                                    rule="TGM 이 20시에 갱신 · 매일 21:40 받아 옴 · 기준일이 6일 넘게 그대로면 늦음" />
                            )}
                        </ul>
                        <div className="border-t border-black/[0.06] bg-black/[0.015] p-4">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                <button type="button" disabled={run.isPending} onClick={() => run.mutate()}
                                    className="h-10 px-4 rounded-lg bg-white border border-black/10 text-[13px] font-bold text-[rgba(0,0,0,0.8)] hover:border-brand/40 hover:text-brand disabled:opacity-50">
                                    {run.isPending ? "피드 받아 보는 중…" : "시세 동기화 미리 보기"}
                                </button>
                                <p className="text-[12px] text-black/45">피드를 받아 골프장에 붙여 보기만 합니다 — 시세는 바뀌지 않아요.</p>
                            </div>
                            {dry && <DryRunResult r={dry} />}
                        </div>
                    </Panel>
                </Section>
            </div>
        </div>
    );
}
