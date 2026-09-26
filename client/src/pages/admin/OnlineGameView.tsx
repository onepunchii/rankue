/**
 * 어드민 "온라인당구 게임" 탭(2026-09-08 오너): 얼마나 쓰는지 — 싱글(세션)·멀티(대전)·멀티방·드릴·활성 이용자·일별 추이·종목별·상위 이용자·최근 대전.
 * 데이터: GET /api/hiq/admin/online-game (storage.sim.adminOverview). 차트는 시뮬레이터 대시보드의 SVG 차트(TrendLine/Columns)를 그대로 쓴다 — 축 하나, 지표마다 차트 하나.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Columns, TrendLine } from "@/sim/dash/charts";

interface Overview {
    generatedAt: string;
    days: number;
    sessions: { total: number; finished: number; playing: number; drillKind: number; players: number; shots: number; innings: number; mismatches: number; d1: number; d7: number; d30: number; avgInnings: number | null; avgMinutes: number | null };
    matches: { total: number; finished: number; playing: number; waiting: number; canceled: number; openRooms: number; publicTotal: number; passwordTotal: number; invitedTotal: number; reality: number; players: number; shots: number; mismatches: number; endReasons: { target: number; inningCap: number; resign: number; claim: number }; d1: number; d7: number; d30: number };
    drills: { attempts: number; successes: number; players: number; weeks: number; d7: number };
    activePlayers: { d1: number; d7: number; d30: number };
    daily: { day: string; sessions: number; matches: number; drills: number; players: number }[];
    byGame: { gameType: string; tableId: string; sessions: number; matches: number }[];
    topPlayers: { memberId: string; name: string; sessions: number; matches: number; wins: number; rating: number; bestAvg: number; lastAt: string | null }[];
    recentMatches: { id: string; status: string; gameType: string; tableId: string; isPublic: boolean; endReason: string | null; shots: number; hostName: string; guestName: string | null; createdAt: string; finishedAt: string | null }[];
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");
const gameName = (g: string, t: string) => `${g === "3c" ? "3쿠션" : "4구"} · ${t === "DAEDAE" ? "대대" : "중대"}`;
const dayLabel = (day: string) => { const [, m, d] = day.split("-"); return `${Number(m)}/${Number(d)}`; };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "–");
const STATUS: Record<string, string> = { waiting: "대기", playing: "진행 중", finished: "종료", canceled: "취소" };
const END: Record<string, string> = { target: "다마수", inningCap: "이닝 제한", resign: "기권", claim: "무응답 승" };

function Tile({ label, value, sub, highlight = false }: { label: string; value: string; sub?: string; highlight?: boolean }) {
    return (
        <div className={`p-4 rounded-2xl border ${highlight ? "bg-brand/[0.06] border-brand/25" : "bg-white border-black/[0.08]"}`}>
            <span className="text-[12px] font-bold text-black/50 block mb-1">{label}</span>
            <div className={`text-[24px] leading-none font-black tabular-nums mb-1.5 ${highlight ? "text-brand" : "text-[rgba(0,0,0,0.87)]"}`}>{value}</div>
            {sub && <div className="text-[11.5px] text-black/45 leading-snug">{sub}</div>}
        </div>
    );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
    return (
        <section className="bg-white rounded-2xl border border-black/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.06)] p-5">
            <header className="mb-3">
                <h3 className="text-[15px] font-bold text-[rgba(0,0,0,0.87)]">{title}</h3>
                {sub && <p className="text-xs text-black/45 mt-0.5">{sub}</p>}
            </header>
            {children}
        </section>
    );
}

export default function OnlineGameView() {
    const [days, setDays] = useState(30);
    const { data, isPending, isError, refetch, isFetching } = useQuery<Overview>({ queryKey: [`/api/hiq/admin/online-game?days=${days}`], staleTime: 30_000 });
    const daily = useMemo(() => data?.daily ?? [], [data]);
    if (isPending) return <p className="text-sm text-black/50 p-6">불러오는 중…</p>;
    if (isError || !data) return (
        <div className="p-6 flex items-center gap-3">
            <p className="text-sm text-black/60">이용 현황을 불러오지 못했어요.</p>
            <button type="button" onClick={() => { void refetch(); }} className="h-9 px-3 rounded-lg border border-black/10 text-sm font-semibold">다시 시도</button>
        </div>
    );
    const s = data.sessions, m = data.matches, d = data.drills, a = data.activePlayers;
    const sum = (k: "sessions" | "matches" | "drills") => daily.reduce((acc, x) => acc + x[k], 0);
    const series = (k: "sessions" | "matches" | "drills" | "players") => daily.map((x) => ({ label: dayLabel(x.day), value: x[k] }));

    return (
        <div className={`space-y-6 ${isFetching ? "opacity-80" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-bold text-black/50">기간</span>
                {[7, 30, 90].map((n) => (
                    <button
                        key={n} type="button" onClick={() => setDays(n)} aria-pressed={days === n}
                        className={`h-9 px-3 rounded-lg border text-sm font-semibold ${days === n ? "bg-[rgba(0,0,0,0.87)] text-white border-transparent" : "border-black/10 text-black/60"}`}
                    >
                        최근 {n}일
                    </button>
                ))}
                <span className="text-xs text-black/40 ml-auto">기준 {when(data.generatedAt)}</span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <Tile label="활성 이용자 · 오늘" value={fmt(a.d1)} sub={`7일 ${fmt(a.d7)} · 30일 ${fmt(a.d30)}`} highlight />
                <Tile label="싱글 세션 (전체)" value={fmt(s.total)} sub={`마침 ${fmt(s.finished)} · 진행 중 ${fmt(s.playing)} · 이용자 ${fmt(s.players)}`} />
                <Tile label="멀티 대전 (전체)" value={fmt(m.total)} sub={`종료 ${fmt(m.finished)} · 진행 중 ${fmt(m.playing)} · 대기 ${fmt(m.waiting)} · 이용자 ${fmt(m.players)}`} />
                <Tile label="열린 멀티방 (지금)" value={fmt(m.openRooms)} sub={`공개 방 누적 ${fmt(m.publicTotal)} · 비밀번호 ${fmt(m.passwordTotal)} · 푸시 초대 ${fmt(m.invitedTotal)}`} />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <Tile label="세션 · 오늘 / 7일 / 30일" value={fmt(s.d1)} sub={`${fmt(s.d7)} / ${fmt(s.d30)}`} />
                <Tile label="대전 · 오늘 / 7일 / 30일" value={fmt(m.d1)} sub={`${fmt(m.d7)} / ${fmt(m.d30)}`} />
                <Tile label="드릴 시도" value={fmt(d.attempts)} sub={`성공 ${fmt(d.successes)} (${pct(d.successes, d.attempts)}) · 이용자 ${fmt(d.players)} · 7일 ${fmt(d.d7)}`} />
                <Tile label="세션 평균" value={s.avgInnings === null ? "–" : `${s.avgInnings.toFixed(1)}이닝`} sub={`${s.avgMinutes === null ? "–" : `${s.avgMinutes.toFixed(0)}분`} · 샷 ${fmt(s.shots + m.shots)} · 해시 불일치 ${fmt(s.mismatches + m.mismatches)}`} />
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
                <Card title="일별 싱글 세션" sub={`최근 ${data.days}일 합 ${fmt(sum("sessions"))}`}>
                    <Columns points={series("sessions")} format={(v) => String(Math.round(v))} ariaLabel="일별 싱글 세션 막대 그래프" emptyText="기록 없음" height={180} labelEvery={Math.max(1, Math.ceil(daily.length / 8))} />
                </Card>
                <Card title="일별 멀티 대전" sub={`최근 ${data.days}일 합 ${fmt(sum("matches"))}`}>
                    <Columns points={series("matches")} format={(v) => String(Math.round(v))} ariaLabel="일별 멀티 대전 막대 그래프" emptyText="기록 없음" height={180} labelEvery={Math.max(1, Math.ceil(daily.length / 8))} />
                </Card>
                <Card title="일별 활성 이용자" sub="세션·대전·드릴 중 하나라도 한 회원">
                    <TrendLine points={series("players")} format={(v) => String(Math.round(v))} ariaLabel="일별 활성 이용자 선 그래프" emptyText="기록 없음" height={180} />
                </Card>
                <Card title="일별 드릴 시도" sub={`최근 ${data.days}일 합 ${fmt(sum("drills"))}`}>
                    <Columns points={series("drills")} format={(v) => String(Math.round(v))} ariaLabel="일별 드릴 시도 막대 그래프" emptyText="기록 없음" height={180} labelEvery={Math.max(1, Math.ceil(daily.length / 8))} />
                </Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
                <Card title="종목 · 테이블별" sub="싱글 세션 / 멀티 대전">
                    <table className="w-full text-sm">
                        <thead><tr className="text-[11px] text-black/45"><th className="text-left font-semibold py-1">종목</th><th className="text-right font-semibold">세션</th><th className="text-right font-semibold">대전</th></tr></thead>
                        <tbody>
                            {data.byGame.map((g) => (
                                <tr key={`${g.gameType}-${g.tableId}`} className="border-t border-black/[0.06]">
                                    <td className="py-2 font-medium text-[rgba(0,0,0,0.87)]">{gameName(g.gameType, g.tableId)}</td>
                                    <td className="py-2 text-right tabular-nums">{fmt(g.sessions)}</td>
                                    <td className="py-2 text-right tabular-nums">{fmt(g.matches)}</td>
                                </tr>
                            ))}
                            {data.byGame.length === 0 && <tr><td colSpan={3} className="py-3 text-black/40">기록 없음</td></tr>}
                        </tbody>
                    </table>
                </Card>
                <Card title="대전 모드 · 방" sub="멀티 대전 누적">
                    <ul className="text-sm space-y-2">
                        <li className="flex justify-between"><span className="text-black/60">일반 모드</span><span className="tabular-nums font-semibold">{fmt(m.total - m.reality)}</span></li>
                        <li className="flex justify-between"><span className="text-black/60">리얼리티 모드</span><span className="tabular-nums font-semibold">{fmt(m.reality)}</span></li>
                        <li className="flex justify-between"><span className="text-black/60">공개 멀티방</span><span className="tabular-nums font-semibold">{fmt(m.publicTotal)}</span></li>
                        <li className="flex justify-between"><span className="text-black/60">비밀번호 방</span><span className="tabular-nums font-semibold">{fmt(m.passwordTotal)}</span></li>
                        <li className="flex justify-between"><span className="text-black/60">푸시 초대</span><span className="tabular-nums font-semibold">{fmt(m.invitedTotal)}</span></li>
                        <li className="flex justify-between"><span className="text-black/60">취소된 방</span><span className="tabular-nums font-semibold">{fmt(m.canceled)}</span></li>
                    </ul>
                </Card>
                <Card title="대전 종료 사유" sub={`종료 ${fmt(m.finished)}건`}>
                    <ul className="text-sm space-y-2">
                        {(["target", "inningCap", "resign", "claim"] as const).map((k) => (
                            <li key={k} className="flex justify-between"><span className="text-black/60">{END[k]}</span><span className="tabular-nums font-semibold">{fmt(m.endReasons[k])} <span className="text-black/40 font-normal">({pct(m.endReasons[k], m.finished)})</span></span></li>
                        ))}
                    </ul>
                </Card>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
                <Card title="상위 이용자" sub="세션 + 대전 수 기준 10명">
                    <div className="overflow-x-auto -mx-1 px-1"><table className="w-full text-sm whitespace-nowrap">
                        <thead><tr className="text-[11px] text-black/45"><th className="text-left font-semibold py-1">이름</th><th className="text-right font-semibold">세션</th><th className="text-right font-semibold">대전</th><th className="text-right font-semibold">승</th><th className="text-right font-semibold">레이팅</th><th className="text-right font-semibold">최고 에버</th></tr></thead>
                        <tbody>
                            {data.topPlayers.map((p) => (
                                <tr key={p.memberId} className="border-t border-black/[0.06]">
                                    <td className="py-2 font-medium text-[rgba(0,0,0,0.87)]">{p.name}</td>
                                    <td className="py-2 text-right tabular-nums">{fmt(p.sessions)}</td>
                                    <td className="py-2 text-right tabular-nums">{fmt(p.matches)}</td>
                                    <td className="py-2 text-right tabular-nums">{fmt(p.wins)}</td>
                                    <td className="py-2 text-right tabular-nums">{fmt(p.rating)}</td>
                                    <td className="py-2 text-right tabular-nums">{p.bestAvg.toFixed(2)}</td>
                                </tr>
                            ))}
                            {data.topPlayers.length === 0 && <tr><td colSpan={6} className="py-3 text-black/40">기록 없음</td></tr>}
                        </tbody>
                    </table></div>
                </Card>
                <Card title="최근 대전" sub="최근 10건">
                    <div className="overflow-x-auto -mx-1 px-1"><table className="w-full text-sm whitespace-nowrap">
                        <thead><tr className="text-[11px] text-black/45"><th className="text-left font-semibold py-1">대전</th><th className="text-left font-semibold">종목</th><th className="text-right font-semibold">상태</th><th className="text-right font-semibold">만든 시각</th></tr></thead>
                        <tbody>
                            {data.recentMatches.map((r) => (
                                <tr key={r.id} className="border-t border-black/[0.06]">
                                    <td className="py-2 font-medium text-[rgba(0,0,0,0.87)]">{r.hostName} vs {r.guestName ?? "–"}{r.isPublic ? " · 멀티방" : ""}</td>
                                    <td className="py-2 text-black/60">{gameName(r.gameType, r.tableId)}</td>
                                    <td className="py-2 text-right">{STATUS[r.status] ?? r.status}{r.endReason ? ` · ${END[r.endReason] ?? r.endReason}` : ""}</td>
                                    <td className="py-2 text-right text-black/50 tabular-nums">{when(r.createdAt)}</td>
                                </tr>
                            ))}
                            {data.recentMatches.length === 0 && <tr><td colSpan={4} className="py-3 text-black/40">기록 없음</td></tr>}
                        </tbody>
                    </table></div>
                </Card>
            </div>
        </div>
    );
}
