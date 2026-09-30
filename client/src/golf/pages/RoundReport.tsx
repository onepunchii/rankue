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
 *  - 2026-10-01 홀 기록 통계: 요약 밑에 평균 퍼트·페어웨이 안착·그린 적중·OB(components/HoleStatsReport) — 적은 라운드만.
 *  - 2026-10-01 공식·미인증(오너 결정): 공식 = 현장 인증 + 규칙 전 옛 기록(shared countsOnSite). 목록은 공식만,
 *    미인증은 아래 '미인증 라운딩 N' 에 접어 둔다(지우지 않는다). 평균·베스트·막대·홀 기록 통계는 기본 공식만 세고,
 *    '미인증 포함' 스위치로 합쳐 볼 수 있다 — 내 기록 화면일 뿐이라 서버의 등급·랭킹(늘 공식만)은 이 스위치와 상관없다.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { LucideChevronDown, LucideChevronRight, LucideFlag } from "lucide-react";
import { cn } from "@/lib/utils";
import { countsOnSite } from "@shared/golfOnSite";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { GolfBackButton } from "../components/common/GolfBackButton";
import { RoundDetailSheet, ymd, type RoundTarget } from "../components/photos/RoundDetailSheet";
import { MyPhotoAlbum } from "../components/photos/MyPhotoAlbum";
import { HoleStatsReport } from "../components/HoleStatsReport";

/** onSite: 현장 인증(2026-09-30) — true 인증 · false 미인증 · null/없음 이 규칙 전 기록(공식, 표시 안 함) */
type Round = { id: string; score: number; innings?: number | null; createdAt: string; locationName?: string | null; subType?: string | null; golfSessionId?: string | null; onSite?: boolean | null };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** '미인증 포함' 스위치 — 기기마다 기억한다(못 읽으면 꺼진 채 = 공식만) */
const INCLUDE_KEY = "golf.report.withUnverified";
const readIncludePref = () => { try { return localStorage.getItem(INCLUDE_KEY) === "1"; } catch { return false; } };
const saveIncludePref = (on: boolean) => { try { localStorage.setItem(INCLUDE_KEY, on ? "1" : "0"); } catch { /* 못 적어도 이번 화면에선 바뀐다 */ } };

type MonthGroup = { key: string; label: string; items: Round[] };
function groupByMonth(list: Round[]): MonthGroup[] {
    const g: MonthGroup[] = [];
    for (const r of list) {
        const { y, m } = ymd(r.createdAt);
        const key = `${y}-${m}`;
        const last = g[g.length - 1];
        if (last?.key === key) last.items.push(r); else g.push({ key, label: `${y}년 ${m}월`, items: [r] });
    }
    return g;
}

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

/** 달별 목록 — 공식·미인증이 같은 줄 모양을 쓴다. 미인증 묶음 안에선 '미인증' 칩을 또 달지 않는다(묶음 제목이 말한다) */
function MonthList({ groups, isBest, onOpen, dim }: { groups: MonthGroup[]; isBest: (r: Round) => boolean; onOpen: (r: Round) => void; dim?: boolean }) {
    return (
        <div className="space-y-5">
            {groups.map((g) => (
                <div key={g.key}>
                    <p className="mb-2 text-[12.5px] font-medium text-[#FFFFFF73]">{g.label}</p>
                    <ul className="rounded-2xl bg-[#FFFFFF08] divide-y divide-[#FFFFFF0F] overflow-hidden">
                        {g.items.map((r) => {
                            const d = ymd(r.createdAt);
                            return (
                                <li key={r.id}>
                                    <button type="button" onClick={() => onOpen(r)} className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left active:bg-[#FFFFFF0A]">
                                        <span className="w-11 shrink-0 text-center">
                                            <span className={cn("block text-[20px] leading-none font-bold tabular-nums", dim ? "text-[#FFFFFFB3]" : "text-[#ffffff]")}>{d.d}</span>
                                            <span className="block mt-1 text-[11.5px] text-[#FFFFFF66]">{d.w}요일</span>
                                        </span>
                                        <span className="flex-1 min-w-0">
                                            <span className="flex items-center gap-1.5 min-w-0">
                                                <span className={cn("text-[15px] font-semibold truncate", dim ? "text-[#FFFFFFB3]" : "text-[#ffffff]")}>{r.locationName || "골프장"}</span>
                                                {isBest(r) && <span className="shrink-0 h-5 px-1.5 rounded bg-[#FF8A3D] text-[11px] font-semibold text-[#ffffff] leading-5">베스트</span>}
                                                {/* 현장 인증만 칩을 단다. 옛 기록(null)은 공식이지만 표시하지 않는다 */}
                                                {r.onSite === true && <span className="shrink-0 h-5 px-1.5 rounded bg-[#64DD171F] text-[11px] font-semibold text-[#9BEF5C] leading-5">현장 인증</span>}
                                            </span>
                                            <span className="block mt-0.5 text-[12.5px] text-[#FFFFFF73] truncate">{[r.subType, `${r.innings || 18}홀`].filter(Boolean).join(" · ")}</span>
                                        </span>
                                        <span className="shrink-0 text-right tabular-nums">
                                            <span className={cn("text-[24px] leading-none font-bold", dim ? "text-[#FFFFFFB3]" : "text-[#ffffff]")}>{r.score}</span>
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
    );
}

export function GolfRoundReport({ history }: { history: Round[] }) {
    const [, setLocation] = useLocation();
    const [open, setOpen] = useState<RoundTarget | null>(null);

    const rounds = useMemo(() => [...history].filter((r) => Number(r.score) > 0).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [history]);
    const official = useMemo(() => rounds.filter((r) => countsOnSite(r.onSite)), [rounds]);
    const unverified = useMemo(() => rounds.filter((r) => !countsOnSite(r.onSite)), [rounds]);
    const [withUnverified, setWithUnverified] = useState(readIncludePref);
    const [showUnverified, setShowUnverified] = useState(false);
    /** 숫자(평균·베스트·막대·홀 기록 통계)가 세는 라운드 */
    const counted = withUnverified ? rounds : official;
    const countedIds = useMemo(() => new Set(counted.map((r) => r.id)), [counted]);

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
        if (!counted.length) return null;
        const s = counted.map((r) => r.score);
        const avg = s.reduce((a, b) => a + b, 0) / s.length;
        const recent = s.slice(0, 5);
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        return { avg, best: Math.min(...s), n: s.length, last: s[0], recentAvg, recentN: recent.length };
    }, [counted]);
    const isBest = (r: Round) => stats?.best === r.score && countedIds.has(r.id);

    // 달별 묶음
    const groups = useMemo(() => groupByMonth(official), [official]);
    const unverifiedGroups = useMemo(() => groupByMonth(unverified), [unverified]);

    const toggleInclude = () => {
        const next = !withUnverified;
        setWithUnverified(next);
        saveIncludePref(next);
    };

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
                    {stats && <RecentBars rounds={counted} best={stats.best} />}
                    {/* 미인증이 있을 때만 — 켜면 위 숫자와 아래 홀 기록 통계가 미인증까지 합친다 */}
                    {unverified.length > 0 && (
                        <div className="mt-5 pt-4 border-t border-[#FFFFFF0F] flex items-center gap-3">
                            <span className="flex-1 min-w-0">
                                <span className="block text-[14px] font-medium text-[#ffffff]">미인증 포함</span>
                                <span className="block mt-0.5 text-[12px] text-[#FFFFFF73] break-keep tabular-nums">
                                    {withUnverified ? `미인증 ${unverified.length}회까지 합친 숫자예요` : `공식 라운드만 셌어요 · 미인증 ${unverified.length}회 빠짐`}
                                </span>
                            </span>
                            <button
                                type="button" role="switch" aria-checked={withUnverified} aria-label="미인증 라운드 포함"
                                onClick={toggleInclude}
                                className={cn("relative shrink-0 w-[46px] h-[28px] rounded-full transition-colors", withUnverified ? "bg-[#64DD17]" : "bg-[#FFFFFF24]")}
                            >
                                <span className={cn(
                                    "absolute top-[3px] left-[3px] w-[22px] h-[22px] rounded-full bg-[#ffffff] shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform motion-reduce:transition-none",
                                    withUnverified && "translate-x-[18px]",
                                )} />
                            </button>
                        </div>
                    )}
                </section>

                {/* ── 홀 기록 통계(2026-10-01) — 경기 화면 '이 홀 기록'을 적은 라운드만. 없으면 칸째 없다. 위 숫자와 같은 라운드로 센다 ── */}
                <HoleStatsReport historyIds={countedIds} />

                {/* ── 사진첩(2026-09-30) ── */}
                <MyPhotoAlbum onOpen={(g) => openSession(g.sessionId, { courseName: g.courseName, playedAt: g.playedAt })} />

                {/* ── 공식 라운딩(현장 인증 + 옛 기록) ── */}
                <section>
                    <div className="flex items-baseline justify-between mb-2.5">
                        <h2 className="text-[17px] font-bold tracking-tight text-[#ffffff]">공식 라운딩</h2>
                        <span className="text-[12.5px] text-[#FFFFFF59] tabular-nums">{official.length}회</span>
                    </div>
                    {official.length === 0 ? (
                        <div className="rounded-2xl bg-[#FFFFFF08] px-5 py-8 text-center">
                            <p className="text-[15px] font-semibold text-[#ffffff]">아직 공식 라운딩이 없어요</p>
                            <p className="mt-1 text-[13px] text-[#FFFFFF73] break-keep">
                                {unverified.length > 0 ? "골프장에서 현장 인증을 받은 라운드가 여기에 쌓여요." : "랭큐매치로 18홀을 끝까지 적으면 여기에 쌓여요."}
                            </p>
                            <button type="button" onClick={() => setLocation("/golf/game/new?mode=match")} className="mt-4 h-11 px-5 rounded-full bg-gradient-to-br from-[#FF8A3D] to-[#E85200] text-[14px] font-semibold text-[#ffffff] inline-flex items-center gap-1.5">
                                <LucideFlag className="w-4 h-4" />라운드 시작
                            </button>
                        </div>
                    ) : (
                        <MonthList groups={groups} isBest={isBest} onOpen={openRound} />
                    )}
                </section>

                {/* ── 미인증 라운딩 — 지우지 않고 접어 둔다. 등급·랭킹·크루 평균엔 들어가지 않는다 ── */}
                {unverified.length > 0 && (
                    <section>
                        <button
                            type="button" onClick={() => setShowUnverified((v) => !v)} aria-expanded={showUnverified}
                            className="w-full flex items-center gap-3 rounded-2xl bg-[#FFFFFF08] px-4 py-3.5 text-left active:bg-[#FFFFFF0A]"
                        >
                            <span className="flex-1 min-w-0">
                                <span className="block text-[15px] font-semibold text-[#ffffff]">
                                    미인증 라운딩 <span className="ml-0.5 font-medium text-[#FFFFFF73] tabular-nums">{unverified.length}</span>
                                </span>
                                <span className="block mt-0.5 text-[12.5px] text-[#FFFFFF73] break-keep">현장 인증 없이 끝난 라운드예요 · 등급·랭킹엔 들어가지 않아요</span>
                            </span>
                            <LucideChevronDown className={cn("w-4 h-4 shrink-0 text-[#FFFFFF59] transition-transform motion-reduce:transition-none", showUnverified && "rotate-180")} />
                        </button>
                        {showUnverified && (
                            <div className="mt-4">
                                <MonthList groups={unverifiedGroups} isBest={isBest} onOpen={openRound} dim />
                            </div>
                        )}
                    </section>
                )}
            </main>

            <RoundDetailSheet target={open} onClose={() => setOpen(null)} />
            <HiqNavigation />
        </div>
    );
}
