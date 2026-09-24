/**
 * 라운딩 리포트(골프 /history) — 2026-09-24 오너: "라운딩 리포트 뒤로가기·헤더·카드, 공식 라운딩 리스트, 스코어 카드 디자인 — 니 스타일로".
 *
 * 당구와 같이 쓰던 기록 화면(pages/hiq/history)은 당구 문법(등급 ALBATROSS·STROKES·HOLE 대문자)이 골프에 그대로 입혀져 있었다.
 * 골프일 때만 이 화면으로 갈라낸다 — 당구 쪽은 한 글자도 바뀌지 않는다.
 *  - 머리: 골프 화면 공통(뒤로 단추 + 제목 한 줄).
 *  - 요약: 평균 타수 큰 숫자 + 베스트·라운드·최근 한 띠 + **최근 라운드 막대**(실제 기록만, 베스트는 주황).
 *  - 목록: 달별 묶음, 날짜 칸 · 골프장 · 타수. 베스트 라운드에 주황 칩.
 *  - 스코어카드: 아래에서 올라오는 시트, 선수마다 경기 화면과 같은 기록표(HoleGrid — 버디 동그라미·보기 네모).
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LucideChevronRight, LucideFlag, LucideLoader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { kstDateKey } from "@/lib/kst";
import { GolfBackButton } from "../components/common/GolfBackButton";
import { HoleGrid, toParText } from "../components/ScoreCard";

type Round = { id: string; score: number; innings?: number | null; createdAt: string; locationName?: string | null; subType?: string | null };

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const ymd = (iso: string) => { const [y, m, d] = kstDateKey(iso).split("-").map(Number); return { y, m, d, w: WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] }; };

/**
 * 최근 라운드 막대 — 왼쪽이 옛날. 골프는 **적게 칠수록 좋아서** 막대를 뒤집는다: 잘 친 라운드가 높다(숫자는 막대 위에 그대로).
 * 베스트만 주황. 라운드가 적어도 막대가 흩어지지 않게 가운데로 모은다.
 */
function RecentBars({ rounds, best }: { rounds: Round[]; best: number }) {
    const list = rounds.slice(0, 12).reverse();
    if (list.length < 2) return null;
    const scores = list.map((r) => r.score);
    const lo = Math.min(...scores) - 1, hi = Math.max(...scores) + 3;
    return (
        <div className="mt-5">
            <div className="flex items-end justify-center gap-2.5 h-24" aria-label="최근 라운드 타수">
                {list.map((r) => {
                    const h = 14 + ((hi - r.score) / Math.max(1, hi - lo)) * 56;
                    const isBest = r.score === best;
                    return (
                        <span key={r.id} className="w-[22px] flex flex-col items-center justify-end gap-1">
                            <span className={cn("text-[11px] tabular-nums", isBest ? "text-[#FFB27A] font-semibold" : "text-[#FFFFFF73]")}>{r.score}</span>
                            <span className={cn("w-full rounded-md", isBest ? "bg-gradient-to-t from-[#E85200] to-[#FF8A3D]" : "bg-[#FFFFFF24]")} style={{ height: h }} />
                        </span>
                    );
                })}
            </div>
            <p className="mt-2 text-center text-[12px] text-[#FFFFFF59]">최근 {list.length}라운드 · 높을수록 잘 친 날 · 주황이 베스트</p>
        </div>
    );
}

/** 스코어카드 시트 — 기록 한 줄을 누르면 */
function ScorecardSheet({ round, onClose }: { round: Round | null; onClose: () => void }) {
    const { data: game, isLoading } = useQuery<any>({
        queryKey: [`/api/hiq/history/${round?.id}/detail`],
        queryFn: () => apiRequest(`/api/hiq/history/${round!.id}/detail`),
        enabled: !!round,
    });
    const pars: number[] = Array.isArray(game?.pars) && game.pars.length === 18 ? game.pars : [];
    const parTotal = pars.reduce((a, b) => a + b, 0);
    const players = [1, 2, 3, 4].map((i) => game?.[`player${i}Id`] ? {
        id: game[`player${i}Id`], name: game[`player${i}Name`] || `선수 ${i}`,
        scores: (game[`player${i}Innings`] as number[] | undefined) ?? [], total: Number(game[`player${i}Score`] ?? 0),
    } : null).filter(Boolean) as { id: string; name: string; scores: number[]; total: number }[];
    const d = round ? ymd(round.createdAt) : null;

    return (
        <Sheet open={!!round} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="bottom" className="bg-[#0F0F0F] border-[#FFFFFF0F] rounded-t-3xl px-0 pb-0 max-h-[88vh] flex flex-col [&>button]:right-5 [&>button]:top-5 [&>button]:opacity-60">
                <div className="px-5 pt-5 pb-4 shrink-0 border-b border-[#FFFFFF0F]">
                    <p className="text-[13px] text-[#FFFFFF8C] tabular-nums">{d ? `${d.y}년 ${d.m}월 ${d.d}일 (${d.w})` : ""}</p>
                    <SheetTitle className="mt-0.5 text-[22px] font-bold tracking-tight text-[#ffffff] truncate pr-8">{round?.locationName || game?.locationName || "스코어카드"}</SheetTitle>
                    {parTotal > 0 && <p className="mt-1 text-[12.5px] text-[#FFFFFF73]">파 {parTotal} · {round?.subType ?? "18홀"}</p>}
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scrollbar-hide" style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}>
                    {isLoading ? (
                        <div className="py-10 flex justify-center text-[#FFFFFF59]"><LucideLoader2 className="w-5 h-5 animate-spin" /></div>
                    ) : !game ? (
                        <p className="py-10 text-center text-[13px] text-[#FFFFFF73]">이 라운드의 홀별 기록이 없어요.</p>
                    ) : players.map((p) => {
                        const toPar = parTotal ? p.total - parTotal : null;
                        return (
                            <section key={p.id} className="rounded-2xl bg-[#FFFFFF08] ring-1 ring-inset ring-[#FFFFFF0F] px-4 py-4">
                                <div className="flex items-baseline justify-between mb-3">
                                    <span className="text-[15px] font-semibold text-[#ffffff] truncate">{p.name}</span>
                                    <span className="shrink-0 tabular-nums">
                                        <span className="text-[22px] font-bold text-[#ffffff]">{p.total || "–"}</span>
                                        <span className="text-[13px] text-[#FFFFFF73]">타</span>
                                        {toPar != null && p.total > 0 && (
                                            <span className={cn("ml-1.5 text-[13px] font-semibold", toPar < 0 ? "text-[#7DD3FC]" : toPar > 0 ? "text-[#FFB27A]" : "text-[#FFFFFFB3]")}>{toParText(toPar)}</span>
                                        )}
                                    </span>
                                </div>
                                {pars.length === 18 ? (
                                    <HoleGrid scores={p.scores} pars={pars} currentHole={-1} />
                                ) : (
                                    // 파 자료가 없는 코스 — 동그라미·네모(파 대비)를 지어내지 않고 타수만
                                    <div className="grid grid-cols-9 gap-1 text-center">
                                        {Array.from({ length: 18 }, (_, i) => (
                                            <span key={i} className="flex flex-col items-center py-1 rounded-md bg-[#FFFFFF06]">
                                                <span className="text-[11px] text-[#FFFFFF59] tabular-nums">{i + 1}</span>
                                                <span className="text-[13px] font-semibold text-[#ffffff] tabular-nums">{p.scores[i] || "·"}</span>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            </SheetContent>
        </Sheet>
    );
}

export function GolfRoundReport({ history }: { history: Round[] }) {
    const [, setLocation] = useLocation();
    const [open, setOpen] = useState<Round | null>(null);

    const rounds = useMemo(() => [...history].filter((r) => Number(r.score) > 0).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [history]);
    const stats = useMemo(() => {
        if (!rounds.length) return null;
        const s = rounds.map((r) => r.score);
        const avg = s.reduce((a, b) => a + b, 0) / s.length;
        const recent = s.slice(0, 5);
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        return { avg, best: Math.min(...s), n: s.length, last: s[0], recentAvg, recentN: recent.length };
    }, [rounds]);

    // 달별 묶음
    const groups = useMemo(() => {
        const g: { key: string; label: string; items: Round[] }[] = [];
        for (const r of rounds) {
            const { y, m } = ymd(r.createdAt);
            const key = `${y}-${m}`;
            const last = g[g.length - 1];
            if (last?.key === key) last.items.push(r); else g.push({ key, label: `${y}년 ${m}월`, items: [r] });
        }
        return g;
    }, [rounds]);

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white pb-nav font-sans">
            <header className="sticky top-0 z-40 bg-[#0A0A0AE6] backdrop-blur-md border-b border-[#FFFFFF0F]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
                <div className="h-14 px-3 flex items-center gap-1.5">
                    <GolfBackButton onClick={() => setLocation("/dashboard")} className="-ml-1" />
                    <h1 className="text-[17px] font-semibold tracking-tight text-[#ffffff]">라운딩 리포트</h1>
                </div>
            </header>

            <main className="max-w-md mx-auto px-5 pt-5 pb-8 space-y-7">
                {/* ── 요약 ── */}
                <section className="rounded-3xl bg-[#FFFFFF08] ring-1 ring-inset ring-[#FFFFFF0F] p-5">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[13px] text-[#FFFFFF8C]">평균 타수</p>
                            <p className="mt-1 text-[44px] leading-none font-bold tracking-tight text-[#ffffff] tabular-nums">{stats ? stats.avg.toFixed(1) : "–"}</p>
                        </div>
                        {stats && stats.n >= 2 && (
                            <span className="shrink-0 mt-1 h-7 px-2.5 rounded-full bg-[#FF8A3D26] text-[12.5px] font-semibold text-[#FFB27A] leading-7 tabular-nums">
                                최근 {stats.recentN}R {stats.recentAvg.toFixed(1)}
                            </span>
                        )}
                    </div>
                    <div className="mt-5 grid grid-cols-3 rounded-2xl bg-[#FFFFFF06] divide-x divide-[#FFFFFF0F]">
                        {([["베스트", stats?.best, "타"], ["라운드", stats?.n, "회"], ["최근", stats?.last, "타"]] as const).map(([label, v, unit]) => (
                            <div key={label} className="px-3.5 py-3 min-w-0">
                                <p className="text-[12px] text-[#FFFFFF73]">{label}</p>
                                <p className="mt-1 text-[20px] leading-none font-semibold text-[#ffffff] tabular-nums">
                                    {v ?? "–"}{v != null && <span className="ml-0.5 text-[13px] font-medium text-[#FFFFFF73]">{unit}</span>}
                                </p>
                            </div>
                        ))}
                    </div>
                    {stats && <RecentBars rounds={rounds} best={stats.best} />}
                </section>

                {/* ── 공식 라운딩 ── */}
                <section>
                    <div className="flex items-baseline justify-between mb-2.5">
                        <h2 className="text-[17px] font-bold tracking-tight text-[#ffffff]">공식 라운딩</h2>
                        <span className="text-[12.5px] text-[#FFFFFF59] tabular-nums">{rounds.length}회</span>
                    </div>
                    {rounds.length === 0 ? (
                        <div className="rounded-2xl bg-[#FFFFFF08] px-5 py-8 text-center">
                            <p className="text-[15px] font-semibold text-[#ffffff]">아직 공식 라운딩이 없어요</p>
                            <p className="mt-1 text-[13px] text-[#FFFFFF73] break-keep">랭큐매치로 18홀을 끝까지 적으면 여기에 쌓여요.</p>
                            <button type="button" onClick={() => setLocation("/golf/game/new?mode=match")} className="mt-4 h-11 px-5 rounded-full bg-gradient-to-br from-[#FF8A3D] to-[#E85200] text-[14px] font-semibold text-[#ffffff] inline-flex items-center gap-1.5">
                                <LucideFlag className="w-4 h-4" />라운드 시작
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {groups.map((g) => (
                                <div key={g.key}>
                                    <p className="mb-2 text-[12.5px] font-medium text-[#FFFFFF73]">{g.label}</p>
                                    <ul className="rounded-2xl bg-[#FFFFFF08] divide-y divide-[#FFFFFF0F] overflow-hidden">
                                        {g.items.map((r) => {
                                            const d = ymd(r.createdAt);
                                            const isBest = stats?.best === r.score;
                                            return (
                                                <li key={r.id}>
                                                    <button type="button" onClick={() => setOpen(r)} className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left active:bg-[#FFFFFF0A]">
                                                        <span className="w-11 shrink-0 text-center">
                                                            <span className="block text-[20px] leading-none font-bold text-[#ffffff] tabular-nums">{d.d}</span>
                                                            <span className="block mt-1 text-[11.5px] text-[#FFFFFF66]">{d.w}요일</span>
                                                        </span>
                                                        <span className="flex-1 min-w-0">
                                                            <span className="flex items-center gap-1.5 min-w-0">
                                                                <span className="text-[15px] font-semibold text-[#ffffff] truncate">{r.locationName || "골프장"}</span>
                                                                {isBest && <span className="shrink-0 h-5 px-1.5 rounded bg-[#FF8A3D] text-[11px] font-semibold text-[#ffffff] leading-5">베스트</span>}
                                                            </span>
                                                            <span className="block mt-0.5 text-[12.5px] text-[#FFFFFF73] truncate">{[r.subType, `${r.innings || 18}홀`].filter(Boolean).join(" · ")}</span>
                                                        </span>
                                                        <span className="shrink-0 text-right tabular-nums">
                                                            <span className="text-[24px] leading-none font-bold text-[#ffffff]">{r.score}</span>
                                                            <span className="text-[12.5px] text-[#FFFFFF73]">타</span>
                                                        </span>
                                                        <LucideChevronRight className="w-4 h-4 shrink-0 text-[#FFFFFF33]" />
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </main>

            <ScorecardSheet round={open} onClose={() => setOpen(null)} />
            <HiqNavigation />
        </div>
    );
}
