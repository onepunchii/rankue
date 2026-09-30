/**
 * 라운딩 리포트(골프 /history) — 2026-09-24 오너: "라운딩 리포트 뒤로가기·헤더·카드, 공식 라운딩 리스트, 스코어 카드 디자인 — 니 스타일로".
 *
 * 당구와 같이 쓰던 기록 화면(pages/hiq/history)은 당구 문법(등급 ALBATROSS·STROKES·HOLE 대문자)이 골프에 그대로 입혀져 있었다.
 * 골프일 때만 이 화면으로 갈라낸다 — 당구 쪽은 한 글자도 바뀌지 않는다.
 *  - 머리: 골프 화면 공통(뒤로 단추 + 제목 한 줄).
 *  - 요약: 평균 타수 큰 숫자 + 베스트·라운드·최근 한 띠 + **최근 라운드 막대**(실제 기록만, 베스트는 주황).
 *  - 목록: 달별 묶음, 날짜 칸 · 골프장 · 타수. 베스트 라운드에 주황 칩.
 *  - 스코어카드: 아래에서 올라오는 시트, 선수마다 경기 화면과 같은 기록표(HoleGrid — 버디 동그라미·보기 네모).
 *  - 2026-09-30 사진: 시트가 **스코어카드 | 앨범** 두 탭(components/photos/RoundDetailSheet), 요약 밑에 '사진첩'(라운드별 묶음).
 *    알림의 ?album=<경기 id> 로 들어오면 그 라운드 앨범을 바로 연다(사진이 가려졌다는 알림).
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { LucideChevronRight, LucideFlag } from "lucide-react";
import { cn } from "@/lib/utils";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { GolfBackButton } from "../components/common/GolfBackButton";
import { RoundDetailSheet, ymd, type RoundTarget } from "../components/photos/RoundDetailSheet";
import { MyPhotoAlbum } from "../components/photos/MyPhotoAlbum";

type Round = { id: string; score: number; innings?: number | null; createdAt: string; locationName?: string | null; subType?: string | null; golfSessionId?: string | null };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


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

export function GolfRoundReport({ history }: { history: Round[] }) {
    const [, setLocation] = useLocation();
    const [open, setOpen] = useState<RoundTarget | null>(null);

    const rounds = useMemo(() => [...history].filter((r) => Number(r.score) > 0).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [history]);
    /** 경기 id → 그 라운드의 내 기록(있으면 기록 상세로 스코어카드를 읽는다) */
    const bySession = useMemo(() => new Map(rounds.filter((r) => r.golfSessionId).map((r) => [r.golfSessionId!, r])), [rounds]);
    const openRound = (r: Round, tab: RoundTarget["tab"] = "score") =>
        setOpen({ historyId: r.id, sessionId: r.golfSessionId ?? null, title: r.locationName, date: r.createdAt, subType: r.subType ?? "18홀", tab });
    const openSession = (sessionId: string, fallback: { courseName?: string | null; playedAt?: string | null } = {}) => {
        const r = bySession.get(sessionId);
        if (r) return openRound(r, "album");
        // 기록이 없는 라운드(18홀을 다 못 적었거나 게스트였던 판)도 앨범은 있다 — 경기로 연다
        setOpen({ sessionId, title: fallback.courseName, date: fallback.playedAt ?? null, tab: "album" });
    };

    // 알림(사진이 가려졌어요)의 ?album=<경기 id> — 그 라운드 앨범을 바로 연다. 표시는 지운다(새로고침에 또 열리지 않게).
    useEffect(() => {
        const u = new URL(window.location.href);
        const id = u.searchParams.get("album");
        if (!id) return;
        u.searchParams.delete("album");
        window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
        if (UUID_RE.test(id)) openSession(id);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
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

                {/* ── 사진첩(2026-09-30) ── */}
                <MyPhotoAlbum onOpen={(g) => openSession(g.sessionId, { courseName: g.courseName, playedAt: g.playedAt })} />

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
                                                    <button type="button" onClick={() => openRound(r)} className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left active:bg-[#FFFFFF0A]">
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

            <RoundDetailSheet target={open} onClose={() => setOpen(null)} />
            <HiqNavigation />
        </div>
    );
}
