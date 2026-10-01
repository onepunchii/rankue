/**
 * 골프 관리 — 라운드(2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자").
 *
 * 왜: 랭큐매치 라운드(golf_match_sessions)를 운영자가 볼 곳이 없었다. 9/9 에 멈춘 대기·진행 중 방이 그대로 남아 있고,
 * 잘못 적은 라운드가 평균·골프 등급·랭킹·여권 도장에 들어가도 DB 를 직접 만지는 수밖에 없었다.
 * - 칩: 전체 · 진행 중 · 대기 · 끝남 · 접음 · 멈춘 방(대기 6시간 · 진행 중 12시간 손 안 댐 — 핀·'이어하기'가 끊기는 시간).
 *   기간은 끝난·접은 라운드에만 걸린다 — 오래 멈춘 방이 기간 밖이라 안 보이는 일이 없게.
 * - 줄을 누르면 상세: 점수판(전반·후반 표) · 현장 인증 확인 · 게임 결과(읽기 전용) · 기록 · 조치.
 * - 조치: 접기(대기·진행 중 — 기록은 남지 않는다), 기록 무효화(끝난 라운드 — 모든 참가 회원의 평균·등급·랭킹·도장에서 빠진다),
 *   '오래된 대기방 정리'(하루 넘게 시작 안 한 대기방만. 미리 보기로 개수를 보고 그 방들만 접는다 — 진행 중 방은 점수가 있어 건드리지 않는다).
 * - 이름·점수가 실린다: 쿼리 캐시가 localStorage 에 영속화되므로(lib/queryClient) 캐시 수명을 0 으로 두고 화면을 떠날 때 지운다.
 * 서버: server/routes/modules/adminGolf/rounds.ts · server/storage/adminGolfRounds.ts
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LucideRefreshCw, LucideChevronRight, LucideTimer } from "@/lib/icons";
import { formatRelative } from "@shared/golfMatch";
import { FilterChips, SearchBox, EmptyState, Panel, Pill, kstDateTime, kstDate, agoLabel } from "../adminUtils";

export const GOLF_ROUNDS_KEY = ["/api/hiq/admin/golf/rounds"] as const;
const BASE = GOLF_ROUNDS_KEY[0];
const PAGE = 30;

type RoundStatus = "waiting" | "playing" | "finished" | "abandoned";
type Chip = "all" | RoundStatus | "stale";
type Days = "7" | "30" | "90" | "";
type Tone = "brand" | "alert" | "warn" | "neutral" | "info";

type OnSiteView =
    | { source: "history"; verdict: "onsite" | "unverified" | "legacy" | "none" }
    | { source: "checkins"; verdict: "verified" | "tried" | "none"; total: number; verified: number };

interface RoundRow {
    id: string;
    status: RoundStatus;
    stale: "waiting" | "playing" | null;
    courseName: string | null;
    frontCourseName: string | null;
    backCourseName: string | null;
    gameMode: string;
    solo: boolean;
    host: { id: string; name: string | null };
    members: number;
    guests: number;
    holesEntered: number;
    createdAt: string;
    startedAt: string | null;
    updatedAt: string;
    finishedAt: string | null;
    onSite: OnSiteView;
    historyCount: number;
}
interface RoundCounts { total: number; waiting: number; playing: number; finished: number; abandoned: number; stale: number }
interface RoundsPage { items: RoundRow[]; total: number; hasMore: boolean; offset: number; limit: number; counts: RoundCounts }

type VerdictReason = "ok" | "too-fast" | "no-course" | "no-checkin" | "far" | "no-fix";
interface DetailPlayer {
    memberId: string; name: string; isGuest: boolean; isMember: boolean; hasHistory: boolean;
    scores: number[]; out: number; in: number; strokes: number; holesPlayed: number; relative: number; complete: boolean;
}
interface RoundDetail {
    id: string;
    status: RoundStatus;
    stale: "waiting" | "playing" | null;
    courseName: string | null;
    frontCourseName: string | null;
    backCourseName: string | null;
    gameMode: string;
    solo: boolean;
    currentHole: number;
    host: { id: string; name: string | null };
    createdAt: string | null;
    startedAt: string | null;
    updatedAt: string | null;
    finishedAt: string | null;
    pars: number[];
    parKnown: boolean[];
    players: DetailPlayer[];
    rules: { stake: number; useDouble: boolean; doublingMode: string; birdieAmount: number; eagleAmount: number };
    settlement: null | { totals: { memberId: string; name: string; amount: number }[]; transfers: { from: string; to: string; amount: number }[]; lines: number };
    onSite: { courseKnown: boolean; verdict: { onSite: boolean; reason: VerdictReason }; recorded: "onsite" | "unverified" | "legacy" | "none" | null };
    checkins: { memberId: string; name: string | null; verified: boolean; bucket: string; source: string; at: string }[];
    photos: { total: number; public: number; hidden: number };
    history: { id: string; memberId: string; name: string | null; score: number; onSite: boolean | null; isWinner: boolean; at: string }[];
    missingHistory: boolean;
    actions: { abandon: boolean; void: boolean; finish: boolean };
}
interface StatSnap { avg: number | null; best: number | null; grade: string | null; rounds: number }
interface VoidResult {
    sessionId: string;
    deletedRows: number;
    detachedPosts: number;
    members: { id: string; name: string; removedRound: boolean; before: StatSnap | null; after: StatSnap | null; reset: boolean; error: string | null }[];
}
interface CleanupResult { dryRun: boolean; hours: number; count: number; rounds?: { id: string; courseName: string | null; hostName: string | null; createdAt: string | null }[]; ids?: string[] }

const STATUS_UI: Record<RoundStatus, { label: string; tone: Tone }> = {
    playing: { label: "진행 중", tone: "info" },
    waiting: { label: "대기", tone: "warn" },
    finished: { label: "끝남", tone: "brand" },
    abandoned: { label: "접음", tone: "neutral" },
};
const CHIPS: { id: Chip; label: string }[] = [
    { id: "all", label: "전체" },
    { id: "playing", label: "진행 중" },
    { id: "waiting", label: "대기" },
    { id: "finished", label: "끝남" },
    { id: "abandoned", label: "접음" },
    { id: "stale", label: "멈춘 방" },
];
const HINT: Record<Chip, string> = {
    all: "대기·진행 중 방은 기간과 상관없이 모두 보입니다.",
    playing: "점수를 적는 중인 라운드.",
    waiting: "동반자를 기다리는 방 — 6시간이 지나면 핀으로 못 들어옵니다.",
    finished: "기록(평균·도장)은 18홀을 다 적은 회원만 남습니다.",
    abandoned: "방장이나 운영자가 접은 방 — 기록이 없습니다.",
    stale: "대기 6시간 · 진행 중 12시간 넘게 손대지 않은 방.",
};
const VERDICT_UI: Record<VerdictReason, string> = {
    ok: "골프장 2km 안에서 확인됨",
    "too-fast": "18홀을 30분 안에 다 적음(시간 규칙)",
    "no-course": "골프장 좌표가 없어 인증할 수 없음",
    "no-checkin": "라운드 중 위치 확인이 없음",
    far: "골프장 2km 밖에서만 확인됨",
    "no-fix": "위치를 잡지 못함",
};
const BUCKET_UI: Record<string, string> = {
    "<2km": "2km 안", "2-10km": "2–10km", ">10km": "10km 밖", "no-fix": "위치 못 잡음", "no-course": "골프장 좌표 없음",
};
const SOURCE_UI: Record<string, string> = {
    start: "시작", hole9: "9번 홀", hole18: "18번 홀", finish: "끝내기", retry: "다시 확인", result: "결과 화면",
};
const DANGER_BTN = "bg-white border border-red-500/30 text-red-600 hover:bg-red-500/[0.06]";

function onSiteUi(v: OnSiteView): { label: string; tone: Tone } {
    if (v.source === "history") {
        return {
            onsite: { label: "현장 인증", tone: "brand" as Tone },
            unverified: { label: "미인증", tone: "warn" as Tone },
            legacy: { label: "옛 기록(인정)", tone: "neutral" as Tone },
            none: { label: "기록 없음", tone: "neutral" as Tone },
        }[v.verdict];
    }
    if (v.verdict === "verified") return { label: "위치 확인됨", tone: "brand" };
    if (v.verdict === "tried") return { label: `확인 ${v.total}회 · 미인증`, tone: "warn" };
    return { label: "확인 없음", tone: "neutral" };
}

const courseOf = (r: { courseName: string | null }) => r.courseName || "골프장 미정";
const ninesOf = (r: { frontCourseName: string | null; backCourseName: string | null }) =>
    [r.frontCourseName, r.backCourseName].filter(Boolean).join(" · ");
const modeOf = (r: { gameMode: string; solo: boolean }) => (r.gameMode === "skins" ? "스킨스" : r.solo ? "스트로크 · 혼자" : "스트로크");
const peopleOf = (r: { members: number; guests: number }) => `회원 ${r.members}${r.guests ? ` · 게스트 ${r.guests}` : ""}`;
const avgText = (s: StatSnap | null) => (s && s.avg ? `${s.avg.toFixed(1)}타` : "없음");
const points = (n: number, signed = false) => `${n < 0 ? "−" : signed && n > 0 ? "+" : ""}${Math.abs(n).toLocaleString()}P`;

function useDebounced<T>(value: T, ms: number): T {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setV(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return v;
}

export default function GolfRoundsView({ onOpenMember }: { onOpenMember?: (id: string) => void }) {
    const { toast } = useToast();
    const qc = useQueryClient();
    const [chip, setChip] = useState<Chip>("all");
    const [search, setSearch] = useState("");
    const [days, setDays] = useState<Days>("30");
    const q = useDebounced(search.trim(), 300);
    // 쪽 번호는 조건에 묶는다 — 조건이 바뀌면 첫 쪽부터
    const sig = `${chip}|${q}|${days}`;
    const [page, setPage] = useState({ sig, offset: 0 });
    const offset = page.sig === sig ? page.offset : 0;
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [cleaning, setCleaning] = useState(false);

    const status = chip === "all" || chip === "stale" ? undefined : chip;
    const { data, isLoading, isError, error, refetch, isFetching } = useQuery<RoundsPage>({
        queryKey: [...GOLF_ROUNDS_KEY, { status, stale: chip === "stale" ? 1 : undefined, days: days || undefined, q: q || undefined, limit: PAGE, offset }],
        gcTime: 0,
        staleTime: 0,
        placeholderData: (prev) => prev, // 쪽·칩을 바꿀 때 빈 화면으로 깜빡이지 않게
    });
    // 화면을 떠나면 캐시에서 지운다 → 영속화된 localStorage 스냅샷에서도 빠진다
    useEffect(() => () => { qc.removeQueries({ queryKey: GOLF_ROUNDS_KEY }); }, [qc]);

    const pageData = data && Array.isArray(data.items) ? data : undefined;
    const items = Array.isArray(pageData?.items) ? pageData!.items : [];
    const counts = pageData?.counts;
    const countOf = (c: Chip) => (!counts ? undefined : c === "all" ? counts.total : counts[c]);

    /** 오래된 대기방 정리 — 미리 보기(dryRun) → 개수·목록 확인 → 미리 본 방들만 접는다 */
    const runCleanup = async () => {
        setCleaning(true);
        try {
            const preview = await apiRequest(`${BASE}/cleanup-stale`, { method: "POST", body: { dryRun: true } }) as CleanupResult;
            const rounds = Array.isArray(preview?.rounds) ? preview.rounds : [];
            if (rounds.length === 0) {
                toast({ title: `${preview?.hours ?? 24}시간 넘은 대기방이 없습니다.` });
                return;
            }
            const list = rounds.slice(0, 5).map((r) => `· ${r.courseName || "골프장 미정"} — ${r.hostName ?? "?"} (${kstDate(r.createdAt)})`).join("\n");
            const more = rounds.length > 5 ? `\n외 ${rounds.length - 5}개` : "";
            const ok = await appConfirm({
                message: `${preview.hours}시간 넘게 시작하지 않은 대기방 ${rounds.length}개를 접을까요?\n\n${list}${more}\n\n기록은 남지 않습니다. 진행 중인 방은 건드리지 않습니다.`,
                tone: "danger",
                confirmText: `${rounds.length}개 접기`,
            });
            if (!ok) return;
            const done = await apiRequest(`${BASE}/cleanup-stale`, { method: "POST", body: { dryRun: false, ids: rounds.map((r) => r.id) } }) as CleanupResult;
            const n = Number(done?.count ?? 0);
            toast({
                title: `대기방 ${n}개를 접었습니다`,
                description: n < rounds.length ? `${rounds.length - n}개는 그사이 시작했거나 이미 접혀 그대로 두었습니다.` : undefined,
            });
        } catch (e: any) {
            toast({ title: "대기방 정리 실패", description: e?.message ?? "", variant: "destructive" });
        } finally {
            setCleaning(false);
            qc.invalidateQueries({ queryKey: GOLF_ROUNDS_KEY });
        }
    };

    return (
        <div className="space-y-3">
            {/* 도구 줄: 상태 칩 · 검색 · 기간 · 새로고침 */}
            <div className="sticky top-14 md:top-0 z-10 -mx-4 md:mx-0 px-4 md:px-0 py-2 bg-surface-0/95 backdrop-blur space-y-2">
                <FilterChips value={chip} onChange={setChip} options={CHIPS.map((c) => ({ id: c.id, label: c.label, count: countOf(c.id), alert: c.id === "stale" }))} />
                <div className="flex gap-2">
                    <SearchBox value={search} onChange={setSearch} placeholder="골프장·방장·참가자 이름" className="flex-1 min-w-0" />
                    <select value={days} onChange={(e) => setDays(e.target.value as Days)} aria-label="끝난·접은 라운드 기간"
                        className="h-10 shrink-0 px-2 rounded-xl bg-white border border-black/10 text-[13px] font-bold text-black/65 outline-none">
                        <option value="7">최근 7일</option>
                        <option value="30">최근 30일</option>
                        <option value="90">최근 90일</option>
                        <option value="">전체 기간</option>
                    </select>
                    <button onClick={() => refetch()} aria-label="새로고침" title="새로고침"
                        className="h-10 w-10 shrink-0 rounded-xl bg-white border border-black/10 flex items-center justify-center text-black/55 hover:text-brand">
                        <LucideRefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                    </button>
                </div>
            </div>

            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[13px] font-bold text-black/60">
                        {CHIPS.find((c) => c.id === chip)?.label} <span className="text-brand tabular-nums">{(pageData?.total ?? 0).toLocaleString()}</span>개
                    </p>
                    <p className="text-[12.5px] text-black/45 leading-snug">{HINT[chip]}</p>
                </div>
                <button onClick={runCleanup} disabled={cleaning}
                    className="shrink-0 h-9 px-3 rounded-xl bg-white border border-black/10 inline-flex items-center gap-1.5 text-[13px] font-bold text-black/65 hover:border-red-500/30 hover:text-red-600 disabled:opacity-50">
                    <LucideTimer className={`w-4 h-4 ${cleaning ? "animate-pulse" : ""}`} />
                    오래된 대기방 정리
                </button>
            </div>

            {isLoading ? (
                <EmptyState>불러오는 중…</EmptyState>
            ) : isError ? (
                <EmptyState>
                    <span className="block text-red-600 mb-3">{(error as any)?.message || "라운드 목록을 불러오지 못했습니다"}</span>
                    <button onClick={() => refetch()} className="h-9 px-4 rounded-xl text-[13px] font-bold bg-white border border-black/10 text-black/70 hover:bg-black/[0.04]">
                        다시 시도
                    </button>
                </EmptyState>
            ) : items.length === 0 ? (
                <EmptyState>해당하는 라운드가 없습니다.</EmptyState>
            ) : (
                <>
                    {/* 폰: 카드 목록 */}
                    <ul className="md:hidden rounded-2xl bg-white border border-black/[0.08] divide-y divide-black/[0.05] overflow-hidden">
                        {items.map((r) => {
                            const st = STATUS_UI[r.status] ?? STATUS_UI.abandoned;
                            const os = onSiteUi(r.onSite);
                            const nines = ninesOf(r);
                            return (
                                <li key={r.id}>
                                    <button onClick={() => setSelectedId(r.id)} className="w-full flex items-start gap-3 px-4 py-3 text-left active:bg-black/[0.04]">
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5">
                                                <Pill tone={st.tone}>{st.label}</Pill>
                                                {r.stale && <Pill tone="alert">멈춘 방</Pill>}
                                                <span className="ml-auto shrink-0 text-[12px] text-black/40 tabular-nums">{agoLabel(r.updatedAt)}</span>
                                            </span>
                                            <span className="mt-1.5 block font-bold text-[14.5px] text-[rgba(0,0,0,0.87)] truncate">
                                                {courseOf(r)}{nines && <span className="font-normal text-[12.5px] text-black/45"> · {nines}</span>}
                                            </span>
                                            <span className="block text-[12.5px] text-black/55 tabular-nums truncate">
                                                {r.host.name ?? "?"} · {peopleOf(r)} · {r.holesEntered}/18홀
                                            </span>
                                            <span className="mt-1.5 flex items-center gap-1.5">
                                                <Pill tone={os.tone}>{os.label}</Pill>
                                                {r.status === "finished" && <span className="text-[12px] text-black/45 tabular-nums">기록 {r.historyCount}건</span>}
                                                <span className="ml-auto text-[11.5px] text-black/35 tabular-nums">{kstDateTime(r.createdAt)}</span>
                                            </span>
                                        </span>
                                        <LucideChevronRight className="mt-1 w-4 h-4 text-black/25 shrink-0" />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    {/* 넓은 화면: 표 */}
                    <div className="hidden md:block rounded-2xl overflow-hidden border border-black/10">
                        <table className="w-full text-left bg-white text-sm">
                            <thead>
                                <tr className="border-b border-black/10 bg-black/[0.02] text-[12px]">
                                    <th className="px-4 py-3 font-black text-black/55">상태</th>
                                    <th className="px-3 py-3 font-black text-black/55">골프장</th>
                                    <th className="px-3 py-3 font-black text-black/55">방장</th>
                                    <th className="px-3 py-3 font-black text-black/55">인원</th>
                                    <th className="px-3 py-3 font-black text-black/55 text-right">홀</th>
                                    <th className="px-3 py-3 font-black text-black/55">현장 인증</th>
                                    <th className="px-3 py-3 font-black text-black/55 text-right" title="평균·도장에 들어간 골프 기록 수">기록</th>
                                    <th className="px-3 py-3 font-black text-black/55">만든 때</th>
                                    <th className="px-3 py-3 font-black text-black/55">마지막 활동</th>
                                    <th className="px-3 py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((r) => {
                                    const st = STATUS_UI[r.status] ?? STATUS_UI.abandoned;
                                    const os = onSiteUi(r.onSite);
                                    const nines = ninesOf(r);
                                    return (
                                        <tr key={r.id} onClick={() => setSelectedId(r.id)} className="border-b border-black/[0.05] hover:bg-brand/[0.03] cursor-pointer">
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className="flex items-center gap-1"><Pill tone={st.tone}>{st.label}</Pill>{r.stale && <Pill tone="alert">멈춤</Pill>}</span>
                                            </td>
                                            <td className="px-3 py-3 max-w-[220px]">
                                                <div className="font-bold text-[rgba(0,0,0,0.87)] truncate">{courseOf(r)}</div>
                                                <div className="text-[12px] text-black/45 truncate">{[nines, modeOf(r)].filter(Boolean).join(" · ")}</div>
                                            </td>
                                            <td className="px-3 py-3 text-black/70 whitespace-nowrap">{r.host.name ?? "?"}</td>
                                            <td className="px-3 py-3 text-black/60 whitespace-nowrap tabular-nums">{peopleOf(r)}</td>
                                            <td className="px-3 py-3 text-right tabular-nums text-black/60">{r.holesEntered}<span className="text-black/30">/18</span></td>
                                            <td className="px-3 py-3 whitespace-nowrap"><Pill tone={os.tone}>{os.label}</Pill></td>
                                            <td className="px-3 py-3 text-right tabular-nums text-black/60">{r.status === "finished" ? r.historyCount : <span className="text-black/25">-</span>}</td>
                                            <td className="px-3 py-3 tabular-nums text-[12.5px] text-black/50 whitespace-nowrap">{kstDateTime(r.createdAt)}</td>
                                            <td className="px-3 py-3 tabular-nums text-[12.5px] text-black/50 whitespace-nowrap">{agoLabel(r.updatedAt)}</td>
                                            <td className="px-3 py-3 text-right"><LucideChevronRight className="w-4 h-4 text-black/25 inline" /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {pageData && (offset > 0 || pageData.hasMore) && (
                <div className="flex items-center justify-center gap-2 pt-2">
                    <button disabled={offset === 0} onClick={() => setPage({ sig, offset: Math.max(0, offset - PAGE) })}
                        className="h-9 px-4 rounded-xl text-[13px] font-bold bg-white border border-black/10 text-black/70 hover:bg-black/[0.04] disabled:opacity-40">
                        이전
                    </button>
                    <span className="text-[13px] text-black/55 tabular-nums">{items.length ? `${offset + 1}–${offset + items.length}` : "–"}</span>
                    <button disabled={!pageData.hasMore} onClick={() => setPage({ sig, offset: offset + PAGE })}
                        className="h-9 px-4 rounded-xl text-[13px] font-bold bg-white border border-black/10 text-black/70 hover:bg-black/[0.04] disabled:opacity-40">
                        다음
                    </button>
                </div>
            )}

            <RoundSheet
                id={selectedId}
                onClose={() => setSelectedId(null)}
                onOpenMember={onOpenMember ? (mid) => { setSelectedId(null); onOpenMember(mid); } : undefined}
            />
        </div>
    );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl bg-white border border-black/[0.06] px-3 py-2 min-w-0">
            <p className="text-[11px] font-bold text-black/45">{label}</p>
            <div className="mt-0.5 text-[13.5px] font-bold text-[rgba(0,0,0,0.87)] tabular-nums truncate">{children}</div>
        </div>
    );
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
    return (
        <section>
            <div className="flex items-baseline justify-between gap-2 mb-2">
                <h3 className="text-[12px] font-black text-black/45">{title}</h3>
                {right}
            </div>
            {children}
        </section>
    );
}

function MemberName({ id, name, onOpen, className = "" }: { id: string; name: string; onOpen?: (id: string) => void; className?: string }) {
    if (!onOpen) return <span className={`font-bold truncate ${className}`}>{name}</span>;
    return (
        <button onClick={() => onOpen(id)} className={`font-bold text-brand hover:underline truncate text-left ${className}`}>{name}</button>
    );
}

/** 점수 칸 색 — 파를 아는 홀만 판정한다(파 미확인 홀은 판정하지 않는다, 앱과 같은 규칙) */
function scoreTone(s: number, par: number, known: boolean): string {
    if (!s) return "text-black/20";
    if (!known) return "text-black/70";
    if (s <= par - 1) return "text-brand font-black";
    if (s >= par + 2) return "text-red-600";
    return "text-black/80";
}

function NineTable({ d, from, onOpenMember }: { d: RoundDetail; from: 0 | 9; onOpenMember?: (id: string) => void }) {
    const idx = Array.from({ length: 9 }, (_, i) => from + i);
    const parSum = idx.reduce((s, i) => s + (d.pars[i] ?? 0), 0);
    const allKnown = idx.every((i) => d.parKnown[i]);
    return (
        <table className="w-full table-fixed text-center text-[12px] tabular-nums">
            <colgroup>
                <col className="w-[64px]" />
                {idx.map((i) => <col key={i} />)}
                <col className="w-[34px]" />
            </colgroup>
            <thead>
                <tr className="text-[11px] font-bold text-black/40">
                    <th className="text-left pl-3 py-1.5 font-black">{from === 0 ? "전반" : "후반"}</th>
                    {idx.map((i) => <th key={i} className="py-1.5 font-bold">{i + 1}</th>)}
                    <th className="py-1.5 pr-1 font-black">{from === 0 ? "OUT" : "IN"}</th>
                </tr>
                <tr className="bg-black/[0.03] text-black/50">
                    <td className="text-left pl-3 py-1 text-[11px] font-bold">파</td>
                    {idx.map((i) => <td key={i} className={`py-1 ${d.parKnown[i] ? "" : "text-black/25"}`}>{d.pars[i] ?? "-"}</td>)}
                    <td className={`py-1 pr-1 ${allKnown ? "" : "text-black/25"}`}>{parSum}</td>
                </tr>
            </thead>
            <tbody>
                {d.players.map((p) => (
                    <tr key={p.memberId} className="border-t border-black/[0.05]">
                        <td className="text-left pl-3 py-1.5 text-[12px] overflow-hidden">
                            {p.isMember ? <MemberName id={p.memberId} name={p.name} onOpen={onOpenMember} className="block" />
                                : <span className="block truncate text-black/50">{p.name}</span>}
                        </td>
                        {idx.map((i) => (
                            <td key={i} className={`py-1.5 ${scoreTone(p.scores[i] ?? 0, d.pars[i] ?? 4, !!d.parKnown[i])}`}>{p.scores[i] || "·"}</td>
                        ))}
                        <td className="py-1.5 pr-1 font-black text-[rgba(0,0,0,0.87)]">{(from === 0 ? p.out : p.in) || "·"}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function RoundSheet({ id, onClose, onOpenMember }: { id: string | null; onClose: () => void; onOpenMember?: (id: string) => void }) {
    const { toast } = useToast();
    const qc = useQueryClient();
    const [result, setResult] = useState<VoidResult | null>(null);
    useEffect(() => { setResult(null); }, [id]);

    const { data, isLoading, isError, error, refetch } = useQuery<RoundDetail>({
        queryKey: [...GOLF_ROUNDS_KEY, id ?? ""],
        enabled: !!id,
        gcTime: 0,
        staleTime: 0,
    });
    const d = data && data.id === id && Array.isArray(data.players) ? data : undefined;

    const abandon = useMutation({
        mutationFn: async (sid: string) => apiRequest(`${BASE}/${sid}/abandon`, { method: "POST" }),
        onSuccess: () => toast({ title: "방을 접었습니다" }),
        onError: (e: any) => toast({ title: "접기 실패", description: e?.message ?? "", variant: "destructive" }),
        onSettled: () => qc.invalidateQueries({ queryKey: GOLF_ROUNDS_KEY }),
    });
    const voidRound = useMutation({
        mutationFn: async (sid: string) => apiRequest(`${BASE}/${sid}/void`, { method: "POST" }) as Promise<VoidResult>,
        onSuccess: (r) => {
            const members = Array.isArray(r?.members) ? r.members : [];
            const failed = members.filter((m) => m.error).length;
            setResult({ ...r, members });
            toast({
                title: "기록을 무효화했습니다",
                description: `기록 ${r.deletedRows}건을 지우고 ${members.length}명의 평균을 다시 셌습니다.${failed ? ` ${failed}명은 다시 세지 못했습니다 — 아래 결과를 보세요.` : ""}`,
                variant: failed ? "destructive" : undefined,
            });
        },
        onError: (e: any) => toast({ title: "무효화 실패", description: e?.message ?? "", variant: "destructive" }),
        onSettled: () => qc.invalidateQueries({ queryKey: GOLF_ROUNDS_KEY }),
    });
    const finish = useMutation({
        mutationFn: async (sid: string) => apiRequest(`${BASE}/${sid}/finish`, { method: "POST" }) as Promise<{ recordedMemberIds: string[]; legacy: boolean }>,
        onSuccess: (r) => toast({
            title: "기록으로 끝냈습니다",
            description: `${Array.isArray(r?.recordedMemberIds) ? r.recordedMemberIds.length : 0}명의 기록을 남겼습니다.${r?.legacy ? " 현장 인증 규칙 전 라운드라 옛 기록으로 남겼습니다." : ""}`,
        }),
        onError: (e: any) => toast({ title: "끝내기 실패", description: e?.message ?? "", variant: "destructive" }),
        onSettled: () => qc.invalidateQueries({ queryKey: GOLF_ROUNDS_KEY }),
    });
    const busy = abandon.isPending || voidRound.isPending || finish.isPending;
    const askFinish = async (r: RoundDetail) => {
        const done = r.players.filter((p) => !p.isGuest && p.holesPlayed >= 18).length;
        const message = `이 라운드를 끝내고 기록으로 남길까요?\n\n${courseOf(r)} · 방장 ${r.host.name ?? "?"}\n`
            + `18홀을 다 적은 회원 ${done}명의 기록이 평균·등급·여권 도장에 들어갑니다. 정산도 지금 점수로 굳습니다.`
            + (Date.parse(r.startedAt ?? r.createdAt ?? "") < Date.parse("2026-09-30T00:00:00+09:00") ? "\n현장 인증 규칙(9/30) 전 라운드라 옛 기록으로 남습니다." : "");
        if (!(await appConfirm({ message, confirmText: "기록으로 끝내기" }))) return;
        finish.mutate(r.id);
    };

    const askAbandon = async (r: RoundDetail) => {
        const holes = r.players.reduce((m, p) => Math.max(m, p.holesPlayed), 0);
        const who = `${courseOf(r)} · 방장 ${r.host.name ?? "?"}`;
        const message = r.status === "waiting"
            ? `이 대기방을 접을까요?\n\n${who}\n핀으로 더는 들어올 수 없고, 기록은 남지 않습니다.`
            : `진행 중인 라운드를 접을까요?\n\n${who}\n${holes > 0 ? `${holes}홀까지 적힌 점수가 기록(평균·도장)으로 남지 않습니다.` : "아직 적힌 점수는 없습니다."} 되돌릴 수 없습니다.`;
        if (!(await appConfirm({ message, tone: "danger", confirmText: "접기" }))) return;
        abandon.mutate(r.id);
    };
    const askVoid = async (r: RoundDetail) => {
        const n = new Set(r.history.map((h) => h.memberId)).size;
        const message = `이 라운드의 기록을 무효화할까요?\n\n${courseOf(r)} · ${kstDate(r.finishedAt ?? r.createdAt)}\n`
            + `참가 회원 ${n}명의 평균·베스트·골프 등급·랭킹과 여권 도장·발자국에서 이 라운드가 빠집니다. 점수판은 남지만 되돌릴 수 없습니다.`;
        if (!(await appConfirm({ message, tone: "danger", confirmText: "무효화" }))) return;
        voidRound.mutate(r.id);
    };

    const st = d ? STATUS_UI[d.status] ?? STATUS_UI.abandoned : null;
    const nines = d ? ninesOf(d) : "";
    const holesDone = d ? d.players.reduce((m, p) => Math.max(m, p.holesPlayed), 0) : 0;
    const members = d ? d.players.filter((p) => !p.isGuest).length : 0;
    const guests = d ? d.players.length - members : 0;
    const checkins = Array.isArray(d?.checkins) ? d!.checkins : [];
    const history = Array.isArray(d?.history) ? d!.history : [];
    const hasActions = !!d && (d.actions.abandon || d.actions.void || d.actions.finish);

    return (
        <Sheet open={!!id} onOpenChange={(o) => { if (!o) onClose(); }}>
            <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col bg-surface-0">
                {!d ? (
                    <div className="p-6">
                        <SheetTitle className="text-[17px] font-bold text-[rgba(0,0,0,0.87)]">라운드</SheetTitle>
                        <SheetDescription className="mt-6 text-center text-[13.5px] text-black/45">
                            {isLoading || !isError ? "불러오는 중…" : <span className="text-red-600">{(error as any)?.message || "라운드를 불러오지 못했습니다"}</span>}
                        </SheetDescription>
                        {isError && (
                            <div className="mt-3 text-center">
                                <button onClick={() => refetch()} className="h-9 px-4 rounded-xl text-[13px] font-bold bg-white border border-black/10 text-black/70">다시 시도</button>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="shrink-0 bg-white border-b border-black/[0.07] px-5 pt-5 pb-4 pr-12">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                {st && <Pill tone={st.tone}>{st.label}</Pill>}
                                {d.stale && <Pill tone="alert">{d.stale === "waiting" ? "멈춘 대기방" : "멈춘 라운드"}</Pill>}
                                <span className="font-mono text-[11.5px] text-black/35">#{d.id.slice(0, 8)}</span>
                            </div>
                            <SheetTitle className="text-[18px] font-black text-[rgba(0,0,0,0.87)] truncate">{courseOf(d)}</SheetTitle>
                            <SheetDescription className="mt-0.5 text-[12.5px] text-black/50">
                                {[nines && `${nines} 코스`, modeOf(d)].filter(Boolean).join(" · ")}
                            </SheetDescription>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
                            {result && <VoidResultCard r={result} onOpenMember={onOpenMember} />}

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                <Stat label="방장"><MemberName id={d.host.id} name={d.host.name ?? "?"} onOpen={onOpenMember} className="block max-w-full" /></Stat>
                                <Stat label="인원">회원 {members}{guests ? ` · 게스트 ${guests}` : ""}</Stat>
                                <Stat label="적은 홀">{holesDone}/18{d.status === "playing" ? ` · 지금 ${d.currentHole}번` : ""}</Stat>
                                <Stat label="만든 때">{kstDateTime(d.createdAt)}</Stat>
                                <Stat label="시작">{d.startedAt ? kstDateTime(d.startedAt) : "-"}</Stat>
                                <Stat label={d.status === "finished" ? "끝남" : d.status === "abandoned" ? "접은 때" : "마지막 활동"}>
                                    {d.status === "finished" ? kstDateTime(d.finishedAt) : d.status === "abandoned" ? kstDateTime(d.updatedAt) : agoLabel(d.updatedAt)}
                                </Stat>
                            </div>

                            <Section title="점수판" right={d.parKnown.some((k) => !k) ? <span className="text-[11.5px] text-black/40">흐린 파 = 파 미확인(판정 안 함)</span> : undefined}>
                                <Panel className="divide-y divide-black/[0.05] overflow-hidden">
                                    <ul className="divide-y divide-black/[0.05]">
                                        {d.players.map((p) => (
                                            <li key={p.memberId} className="flex items-center gap-2 px-3 py-2.5 min-w-0">
                                                <span className="min-w-0 flex-1 flex items-center gap-1.5 text-[13.5px]">
                                                    {p.isMember ? <MemberName id={p.memberId} name={p.name} onOpen={onOpenMember} /> : <span className="font-bold truncate text-black/60">{p.name}</span>}
                                                    {p.isGuest && <Pill>게스트</Pill>}
                                                    {d.status === "finished" && p.isMember && (p.hasHistory ? <Pill tone="brand">기록됨</Pill> : p.complete ? <Pill tone="warn">기록 없음</Pill> : null)}
                                                </span>
                                                <span className="shrink-0 tabular-nums text-[12px] text-black/45 whitespace-nowrap">
                                                    <b className="text-[14px] font-black text-[rgba(0,0,0,0.87)]">{p.strokes || "-"}</b>
                                                    {p.holesPlayed > 0 && <span className="ml-1 text-black/55">{formatRelative(p.relative)}</span>}
                                                    <span className="ml-1.5">{p.holesPlayed}홀</span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="py-1"><NineTable d={d} from={0} onOpenMember={onOpenMember} /></div>
                                    <div className="py-1"><NineTable d={d} from={9} onOpenMember={onOpenMember} /></div>
                                </Panel>
                                {d.missingHistory && (
                                    <p className="mt-2 text-[12.5px] text-amber-800 leading-snug">18홀을 다 적은 회원이 있는데 이 라운드의 기록이 없습니다 — 무효화했거나 회원이 탈퇴한 경우입니다.</p>
                                )}
                            </Section>

                            <Section title="현장 인증" right={<span className="text-[11.5px] text-black/40">좌표는 저장하지 않습니다</span>}>
                                <Panel className="overflow-hidden">
                                    <div className="px-4 py-3 flex flex-wrap items-center gap-2">
                                        {d.status === "finished" && d.onSite.recorded
                                            ? <Pill tone={onSiteUi({ source: "history", verdict: d.onSite.recorded }).tone}>{onSiteUi({ source: "history", verdict: d.onSite.recorded }).label}</Pill>
                                            : <Pill tone={d.onSite.verdict.onSite ? "brand" : "neutral"}>{d.onSite.verdict.onSite ? "지금까지 인증" : "아직 인증 없음"}</Pill>}
                                        <span className="text-[12.5px] text-black/55">{VERDICT_UI[d.onSite.verdict.reason] ?? d.onSite.verdict.reason}</span>
                                    </div>
                                    {checkins.length > 0 ? (
                                        <ul className="border-t border-black/[0.05] divide-y divide-black/[0.04]">
                                            {checkins.map((c, i) => (
                                                <li key={`${c.at}-${i}`} className="flex items-center gap-2 px-4 py-2 text-[12.5px] tabular-nums">
                                                    <span className={`w-4 text-center font-black ${c.verified ? "text-brand" : "text-black/30"}`}>{c.verified ? "✓" : "✗"}</span>
                                                    <span className="min-w-0 flex-1 truncate">
                                                        <MemberName id={c.memberId} name={c.name ?? "?"} onOpen={onOpenMember} className="font-semibold" />
                                                        <span className="text-black/50"> · {BUCKET_UI[c.bucket] ?? c.bucket} · {SOURCE_UI[c.source] ?? c.source}</span>
                                                    </span>
                                                    <span className="shrink-0 text-black/40">{kstDateTime(c.at)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="border-t border-black/[0.05] px-4 py-2.5 text-[12.5px] text-black/45">위치 확인 기록이 없습니다.</p>
                                    )}
                                </Panel>
                            </Section>

                            <Section title="게임 결과 · 읽기 전용">
                                <Panel className="px-4 py-3 space-y-2">
                                    {d.gameMode !== "skins" ? (
                                        <p className="text-[13px] text-black/55">스트로크 경기 — 포인트 정산이 없습니다.</p>
                                    ) : (
                                        <>
                                            <p className="text-[12.5px] text-black/50 tabular-nums">
                                                스킨스 · 타당 {points(d.rules.stake)}
                                                {d.rules.useDouble ? ` · 배판 ${d.rules.doublingMode === "current" ? "그 홀" : "다음 홀"}` : ""}
                                                {d.rules.birdieAmount ? ` · 버디 ${points(d.rules.birdieAmount)}` : ""}
                                                {d.rules.eagleAmount ? ` · 이글 ${points(d.rules.eagleAmount)}` : ""}
                                            </p>
                                            {!d.settlement ? (
                                                <p className="text-[13px] text-black/55">끝날 때 정산이 계산됩니다.</p>
                                            ) : (
                                                <>
                                                    <ul className="space-y-1">
                                                        {d.settlement.totals.map((t) => (
                                                            <li key={t.memberId} className="flex items-center justify-between text-[13.5px] tabular-nums">
                                                                <span className="truncate">{t.name}</span>
                                                                <span className={`font-bold ${t.amount > 0 ? "text-brand" : t.amount < 0 ? "text-red-600" : "text-black/45"}`}>{points(t.amount, true)}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                    {d.settlement.transfers.length > 0 && (
                                                        <p className="text-[12.5px] text-black/55 tabular-nums">
                                                            {d.settlement.transfers.map((t) => `${t.from} → ${t.to} ${points(t.amount)}`).join(" · ")}
                                                        </p>
                                                    )}
                                                </>
                                            )}
                                        </>
                                    )}
                                </Panel>
                            </Section>

                            <Section title="기록(평균·도장)" right={<span className="text-[11.5px] text-black/40 tabular-nums">사진 {d.photos.total}장{d.photos.total ? ` · 공개 ${d.photos.public}${d.photos.hidden ? ` · 가림 ${d.photos.hidden}` : ""}` : ""}</span>}>
                                {history.length === 0 ? (
                                    <EmptyState>{d.status === "finished" ? "이 라운드의 골프 기록이 없습니다." : "끝나면 18홀을 다 적은 회원의 기록이 남습니다."}</EmptyState>
                                ) : (
                                    <Panel className="divide-y divide-black/[0.05] overflow-hidden">
                                        {history.map((h) => {
                                            const os = onSiteUi({ source: "history", verdict: h.onSite === true ? "onsite" : h.onSite === false ? "unverified" : "legacy" });
                                            return (
                                                <div key={h.id} className="flex items-center gap-2 px-4 py-2.5 text-[13.5px]">
                                                    <span className="min-w-0 flex-1 flex items-center gap-1.5">
                                                        <MemberName id={h.memberId} name={h.name ?? "?"} onOpen={onOpenMember} />
                                                        {h.isWinner && <Pill tone="info">승</Pill>}
                                                    </span>
                                                    <span className="shrink-0 font-black tabular-nums">{h.score}타</span>
                                                    <Pill tone={os.tone}>{os.label}</Pill>
                                                </div>
                                            );
                                        })}
                                    </Panel>
                                )}
                            </Section>
                        </div>

                        {hasActions && (
                            <div className="shrink-0 bg-white border-t border-black/[0.07] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] space-y-2">
                                {d.actions.finish && (
                                    <div className="flex items-center gap-3">
                                        <button disabled={busy} onClick={() => askFinish(d)}
                                            className="h-10 px-5 shrink-0 rounded-xl text-[13.5px] font-bold bg-brand text-white hover:bg-brand-strong transition-colors active:scale-[0.99] disabled:opacity-40">
                                            기록으로 끝내기
                                        </button>
                                        <span className="text-[12px] text-black/45 leading-snug">방장이 '끝내기'를 못 누르고 멈춘 라운드 — 18홀을 다 적은 회원만 기록됩니다.</span>
                                    </div>
                                )}
                                {d.actions.abandon && (
                                    <div className="flex items-center gap-3">
                                        <button disabled={busy} onClick={() => askAbandon(d)}
                                            className={`h-10 px-5 shrink-0 rounded-xl text-[13.5px] font-bold transition-colors active:scale-[0.99] disabled:opacity-40 ${DANGER_BTN}`}>
                                            접기
                                        </button>
                                        <span className="text-[12px] text-black/45 leading-snug">
                                            {d.status === "waiting" ? "핀이 닫히고 기록은 남지 않습니다." : "적힌 점수는 기록으로 남지 않습니다. 되돌릴 수 없습니다."}
                                        </span>
                                    </div>
                                )}
                                {d.actions.void && (
                                    <div className="flex items-center gap-3">
                                        <button disabled={busy} onClick={() => askVoid(d)}
                                            className={`h-10 px-5 shrink-0 rounded-xl text-[13.5px] font-bold transition-colors active:scale-[0.99] disabled:opacity-40 ${DANGER_BTN}`}>
                                            기록 무효화
                                        </button>
                                        <span className="text-[12px] text-black/45 leading-snug">
                                            모든 참가 회원의 평균·등급·랭킹·여권 도장에서 이 라운드를 뺍니다. 되돌릴 수 없습니다.
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}

function VoidResultCard({ r, onOpenMember }: { r: VoidResult; onOpenMember?: (id: string) => void }) {
    return (
        <div className="rounded-2xl bg-brand/[0.06] border border-brand/25 p-4">
            <p className="text-[13.5px] font-black text-[rgba(0,0,0,0.87)]">무효화 결과 — 기록 {r.deletedRows}건 지움</p>
            <ul className="mt-2 space-y-1.5">
                {r.members.map((m) => (
                    <li key={m.id} className="text-[13px] tabular-nums">
                        <div className="flex items-center gap-1.5">
                            <MemberName id={m.id} name={m.name || "?"} onOpen={onOpenMember} />
                            {m.reset && <Pill>기본값으로</Pill>}
                        </div>
                        <div className="text-black/60">
                            평균 {avgText(m.before)} → <b className="text-[rgba(0,0,0,0.87)]">{avgText(m.after)}</b>
                            <span className="text-black/45"> · 공식 라운드 {m.before?.rounds ?? 0} → {m.after?.rounds ?? 0}</span>
                            {m.before?.grade !== m.after?.grade && <span className="text-black/45"> · 등급 {m.before?.grade ?? "없음"} → {m.after?.grade ?? "없음"}</span>}
                        </div>
                        {m.error && <div className="text-red-600 text-[12px]">다시 세지 못함: {m.error}</div>}
                    </li>
                ))}
            </ul>
            {r.detachedPosts > 0 && (
                <p className="mt-2 text-[12px] text-black/55 leading-snug">
                    커뮤니티 자랑글 {r.detachedPosts}개가 이 기록을 카드로 붙이고 있었습니다. 연결만 끊었고 카드 내용은 글에 그대로 보입니다 — 필요하면 신고/제재에서 가리세요.
                </p>
            )}
        </div>
    );
}
