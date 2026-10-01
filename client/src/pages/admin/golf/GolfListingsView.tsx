/**
 * 골프 관리 — 조인·부킹(2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자").
 *
 * 그전엔 운영자가 조인·부킹 글을 볼 곳이 신고 큐뿐이었다 — 신고가 안 붙은 글은 아예 안 보였고, 누가 신청했는지·
 * 긴급 방송이 몇 명에게 나갔는지 알 길이 없었다.
 *  - 글: 기간(다가오는·최근 7일 등록·전체) · 종류(조인·부킹·매장·개인 양도) · 표시(긴급·가림·신고) + 골프장·글쓴이 검색.
 *    폰은 카드, 넓은 화면은 표. 누르면 옆 시트 — 글 자세히 · 신청자(이름을 누르면 회원 상세) · 가리기/보이기 · 지우기.
 *  - 긴급 알림 기록: 최근 7일 긴급 조인 전체 푸시를 글별로 — 받은 사람 수와 지금 글 상태.
 *  - 비공개(가명) 글은 실명을 함께 보여 준다(운영자만). 매니저 전화번호는 서버가 아예 주지 않는다.
 *  - 가리기는 신고 큐와 같은 칸·같은 처리 기록을 쓴다(서버 adminGolf/listings). 지우기는 되돌릴 수 없어 가리기를 먼저 권한다.
 *  - 이름·신청자 목록은 쿼리 캐시가 localStorage 로 영속화되므로 캐시 수명 0, 화면을 떠나면 지운다(신고 큐와 같은 이유).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import { LucideChevronRight, LucideRefreshCw, LucideZap } from "@/lib/icons";
import { JOIN_OPTIONS, JOIN_TYPE_LABEL, URGENT_MAX_FEE, URGENT_MIN_LEAD_MS, type JoinType } from "@shared/golfJoin";
import { SPECIAL_OPTIONS } from "@/golf/constants/booking";
import { EmptyState, FilterChips, KpiTile, Pill, SearchBox, agoLabel, kstDateTime } from "../adminUtils";

export const GOLF_LISTINGS_KEY = ["/api/hiq/admin/golf/listings"] as const;
const BASE = GOLF_LISTINGS_KEY[0];
const PAGE = 50;

// ── 서버 응답 모양(server/storage/adminGolfListings.ts) ───────────────────

type Seller = "STORE" | "PERSONAL";
interface ApplicantCounts { applied: number; accepted: number; rejected: number; cancelled: number; noshow: number; seats: number }
export interface GolfListingRow {
    id: string;
    listingType: "JOIN" | "BOOKING";
    joinType: string | null;
    sellerType: Seller | null;
    convertedFromBooking: boolean;
    courseName: string;
    isBlind: boolean;
    blindName: string | null;
    publicName: string;
    venueName: string | null;
    region: string;
    datetime: string;
    greenFee: number;
    costMode: string | null;
    isHotDeal: boolean;
    capacity: number;
    slots: { role: string; gender: string }[] | null;
    owner: { id: string; name: string | null } | null;
    applicants: ApplicantCounts;
    reports: { open: number; total: number };
    hidden: boolean;
    hiddenReason: string | null;
    urgent: boolean;
    createdAt: string;
}
interface GolfListingDetail extends GolfListingRow {
    comment: string | null;
    options: string[];
    joinCondition: string | null;
    policyType: string | null;
    policyCustomText: string | null;
    reportReasons: { reason: string; label: string; count: number; open: number }[];
    history: { action: string; label: string; at: string; note: string | null }[];
}
interface ListingPage {
    items: GolfListingRow[];
    total: number;
    hasMore: boolean;
    offset: number;
    limit: number;
    counts: { all: number; urgent: number; hidden: number; reported: number };
}
interface Applicant {
    memberId: string;
    name: string | null;
    status: "applied" | "accepted" | "rejected" | "cancelled" | "noshow" | string;
    headcount: number;
    appliedAt: string | null;
    changedAt: string | null;
    cancelCount: number;
    noShowCount: number;
}
interface UrgentRow {
    postId: string;
    sentAt: string;
    lastSentAt: string;
    recipients: number;
    sampleTitle: string | null;
    sampleBody: string | null;
    owner: { id: string; name: string | null } | null;
    status: "live" | "hidden" | "deleted";
    listing: GolfListingRow | null;
}

// ── 거르기 ─────────────────────────────────────────────────────────────

type When = "upcoming" | "recent7" | "all";
type Kind = "all" | "JOIN" | "BOOKING" | "STORE" | "PERSONAL";
type Flag = "all" | "urgent" | "hidden" | "reported";

const WHENS: { id: When; label: string }[] = [
    { id: "upcoming", label: "다가오는" },
    { id: "recent7", label: "최근 7일 등록" },
    { id: "all", label: "전체" },
];
const KINDS: { id: Kind; label: string }[] = [
    { id: "all", label: "모든 종류" },
    { id: "JOIN", label: "조인" },
    { id: "BOOKING", label: "부킹" },
    { id: "STORE", label: "매장 부킹" },
    { id: "PERSONAL", label: "개인 양도" },
];
/** 종류 칩 → 서버 질의(type·seller). 매장·개인은 부킹을 올린 쪽이다. */
const KIND_QUERY: Record<Kind, { type?: "JOIN" | "BOOKING"; seller?: Seller }> = {
    all: {},
    JOIN: { type: "JOIN" },
    BOOKING: { type: "BOOKING" },
    STORE: { type: "BOOKING", seller: "STORE" },
    PERSONAL: { type: "BOOKING", seller: "PERSONAL" },
};
const EMPTY_TEXT: Record<When, string> = {
    upcoming: "해당하는 다가오는 글이 없습니다. 지난 글은 '전체'에서 볼 수 있습니다.",
    recent7: "최근 7일 동안 올라온 글 중 해당하는 글이 없습니다.",
    all: "해당하는 글이 없습니다.",
};

// ── 표시 도우미 ────────────────────────────────────────────────────────

const WEEKDAY = "일월화수목금토";
const DAY_MS = 86_400_000;
const kstDayNumber = (ms: number) => Math.floor((ms + 9 * 3_600_000) / DAY_MS);

/** 티타임 "10/6(월) 09:00" — 한국 시각 */
function teeLabel(iso: string): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "-";
    const k = new Date(t + 9 * 3_600_000);
    return `${k.getUTCMonth() + 1}/${k.getUTCDate()}(${WEEKDAY[k.getUTCDay()]}) ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

/** 오늘·내일·D-n·지남(한국 날짜 기준) */
function teeWhen(iso: string): { text: string; tone: "brand" | "warn" | "neutral" } {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return { text: "-", tone: "neutral" };
    if (t <= Date.now()) return { text: "지남", tone: "neutral" };
    const d = kstDayNumber(t) - kstDayNumber(Date.now());
    if (d <= 0) return { text: "오늘", tone: "warn" };
    if (d === 1) return { text: "내일", tone: "brand" };
    return { text: `D-${d}`, tone: "neutral" };
}

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const feeLabel = (r: GolfListingRow) => (r.costMode === "SPLIT" ? "1/N" : won(r.greenFee));
/** 필드·부킹은 그린피, 스크린·파크는 그 자리 비용 */
const feeTitle = (r: GolfListingRow) => (r.listingType === "JOIN" && r.joinType && r.joinType !== "FIELD" ? "비용" : "그린피");
/** 장소 이름이 골프장 이름과 같으면(스크린·파크) 지역만 */
const placeLine = (r: GolfListingRow) => (r.venueName && r.venueName !== r.courseName ? `${r.venueName} · ${r.region}` : r.region);

function kindLabel(r: GolfListingRow): string {
    if (r.listingType === "JOIN") {
        const jt = r.joinType && r.joinType in JOIN_TYPE_LABEL ? JOIN_TYPE_LABEL[r.joinType as JoinType] : null;
        return jt ? `조인 · ${jt}` : "조인";
    }
    return r.sellerType === "PERSONAL" ? "부킹 · 개인 양도" : "부킹 · 매장";
}

/** 조인은 자리(사람), 부킹은 한 팀 — 서버 countJoinRequests 와 같은 구분 */
function seatText(r: GolfListingRow): string {
    if (r.listingType === "JOIN") return `확정 ${r.applicants.seats}/${r.capacity}`;
    return r.applicants.accepted > 0 ? `확정 ${r.applicants.seats}명` : "미확정";
}

const OPTION_LABEL: Record<string, string> = Object.fromEntries([
    ...SPECIAL_OPTIONS.map((o) => [o.id, o.label] as const),
    ...JOIN_OPTIONS.map((o) => [o.id, o.label] as const),
]);
const POLICY_LABEL: Record<string, string> = {
    POLICY_STANDARD: "표준 — 우천 시 현장 기준 환불 · 4일 전 취소 가능",
    POLICY_STRICT: "취소 불가 — 휴장 시에만 환불 · 양도만 가능",
};
const SLOT_ROLE: Record<string, string> = { HOST: "호스트", GUEST: "동반", OPEN: "모집" };
const SLOT_GENDER: Record<string, string> = { M: "남", F: "여", ANY: "무관" };

const APPLICANT_STATUS: Record<string, { label: string; tone: "brand" | "alert" | "warn" | "neutral" | "info" }> = {
    applied: { label: "대기", tone: "warn" },
    accepted: { label: "확정", tone: "brand" },
    rejected: { label: "거절", tone: "neutral" },
    cancelled: { label: "취소", tone: "neutral" },
    noshow: { label: "노쇼", tone: "alert" },
};

/** 종류 알약 — 조인(필드·스크린·파크)은 초록, 매장 부킹은 파랑, 개인 양도는 회색 */
function KindPill({ r }: { r: GolfListingRow }) {
    const tone = r.listingType === "JOIN" ? "brand" : r.sellerType === "PERSONAL" ? "neutral" : "info";
    return <Pill tone={tone}>{kindLabel(r)}</Pill>;
}

/** 손볼 일이 있는 표시 — 긴급·가림·안 닫힌 신고·핫딜 */
function StatusPills({ r }: { r: GolfListingRow }) {
    return (
        <>
            {r.urgent && <Pill tone="alert">긴급</Pill>}
            {r.hidden && <Pill tone="warn">가림</Pill>}
            {r.reports.open > 0 && <Pill tone="alert">신고 {r.reports.open}</Pill>}
            {r.isHotDeal && <Pill tone="info">핫딜</Pill>}
        </>
    );
}

/** 확정·대기 한 덩어리 — 대기는 할 일이라 진하게 */
function SeatSummary({ r }: { r: GolfListingRow }) {
    return (
        <>
            <span>{seatText(r)}</span>
            {r.applicants.applied > 0 && <span className="ml-1.5 font-bold text-amber-700">대기 {r.applicants.applied}</span>}
        </>
    );
}

/** 검색어는 멈춘 뒤 0.3초에 보낸다 — 한 글자마다 요청이 나가지 않게 */
function useDebounced<T>(value: T, ms = 300): T {
    const [v, setV] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setV(value), ms);
        return () => clearTimeout(id);
    }, [value, ms]);
    return v;
}

// ── 화면 ───────────────────────────────────────────────────────────────

export default function GolfListingsView({ onOpenMember }: { onOpenMember?: (id: string) => void }) {
    const queryClient = useQueryClient();
    const [section, setSection] = useState<"listings" | "urgent">("listings");
    const [openRow, setOpenRow] = useState<GolfListingRow | null>(null);

    // 화면을 떠나면 캐시에서 지운다 → 영속화된 localStorage 스냅샷에도 이름·신청자가 남지 않는다.
    useEffect(() => () => { queryClient.removeQueries({ queryKey: GOLF_LISTINGS_KEY }); }, [queryClient]);

    return (
        <div className="space-y-4 break-keep">
            <div className="inline-flex p-1 rounded-xl bg-black/[0.04]">
                {([["listings", "조인·부킹 글"], ["urgent", "긴급 알림 기록"]] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setSection(id)}
                        className={`h-9 px-4 rounded-lg text-[13px] font-semibold transition-colors ${section === id
                            ? "bg-white text-[rgba(0,0,0,0.87)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                            : "text-black/55 hover:text-black/75"}`}>
                        {label}
                    </button>
                ))}
            </div>

            {section === "listings"
                ? <ListingsSection onOpen={setOpenRow} onOpenMember={onOpenMember} />
                : <UrgentSection onOpen={setOpenRow} onOpenMember={onOpenMember} />}

            <ListingSheet row={openRow} onClose={() => setOpenRow(null)} onOpenMember={onOpenMember} />
        </div>
    );
}

function ListingsSection({ onOpen, onOpenMember }: { onOpen: (r: GolfListingRow) => void; onOpenMember?: (id: string) => void }) {
    const [when, setWhen] = useState<When>("upcoming");
    const [kind, setKind] = useState<Kind>("all");
    const [flag, setFlag] = useState<Flag>("all");
    const [qInput, setQInput] = useState("");
    const q = useDebounced(qInput.trim());
    const [offset, setOffset] = useState(0);
    // 거르기가 바뀌면 첫 쪽부터
    useEffect(() => { setOffset(0); }, [when, kind, flag, q]);

    const params = { when, ...KIND_QUERY[kind], flag: flag === "all" ? undefined : flag, q: q || undefined, offset, limit: PAGE };
    const { data, isLoading, isError, error, refetch, isFetching } = useQuery<ListingPage>({
        queryKey: [BASE, params],
        gcTime: 0,
        staleTime: 0,
        refetchInterval: 60_000,
    });
    // 옛 캐시·세션 만료 응답이 와도 깨지지 않게 모양을 확인한다.
    const page = data && !Array.isArray(data) && Array.isArray((data as ListingPage).items) ? data : undefined;
    const items = page?.items ?? [];
    const counts = page?.counts;

    return (
        <div className="space-y-3">
            {/* 거르기 — 줄이 넷이라 폰에서 붙여 두면 화면 절반을 덮는다. 넓은 화면에서만 위에 붙는다 */}
            <div className="md:sticky md:top-0 z-10 py-1 md:py-2 md:bg-surface-0/95 md:backdrop-blur space-y-2">
                <div className="flex gap-2">
                    <SearchBox value={qInput} onChange={setQInput} placeholder="골프장·가명·글쓴이 이름" className="flex-1" />
                    <button onClick={() => refetch()} aria-label="새로고침" title="새로고침"
                        className="h-10 w-10 shrink-0 rounded-xl bg-white border border-black/10 flex items-center justify-center text-black/55 hover:text-brand">
                        <LucideRefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                    </button>
                </div>
                <FilterChips value={when} onChange={setWhen} options={WHENS} />
                <FilterChips value={kind} onChange={setKind} options={KINDS} />
                <FilterChips value={flag} onChange={setFlag} options={[
                    { id: "all", label: "전체", count: counts?.all },
                    { id: "urgent", label: "긴급", count: counts?.urgent },
                    { id: "hidden", label: "가림", count: counts?.hidden },
                    { id: "reported", label: "신고 대기", count: counts?.reported, alert: true },
                ]} />
            </div>

            {page && (
                <p className="text-[13px] font-bold text-black/50">
                    조건에 맞는 글 <span className="text-brand tabular-nums">{page.total.toLocaleString()}</span>건
                    {page.total > 0 && <span className="ml-1.5 font-semibold text-black/40 tabular-nums">· {offset + 1}–{offset + items.length}</span>}
                </p>
            )}

            {isLoading ? (
                <EmptyState>불러오는 중…</EmptyState>
            ) : isError ? (
                <EmptyState>
                    <span className="block text-red-600 mb-3">{(error as Error)?.message || "글 목록을 불러오지 못했습니다"}</span>
                    <button onClick={() => refetch()} className="h-9 px-4 rounded-xl text-[13px] font-semibold bg-white border border-black/10 text-black/70 hover:bg-black/[0.04]">다시 시도</button>
                </EmptyState>
            ) : items.length === 0 ? (
                <EmptyState>{EMPTY_TEXT[when]}</EmptyState>
            ) : (
                <>
                    {/* 폰: 카드 */}
                    <ul className="md:hidden rounded-2xl bg-white border border-black/[0.08] divide-y divide-black/[0.05] overflow-hidden">
                        {items.map((r) => {
                            const w = teeWhen(r.datetime);
                            return (
                                <li key={r.id}>
                                    <button onClick={() => onOpen(r)} className={`w-full px-4 py-3 text-left active:bg-black/[0.04] ${r.hidden ? "bg-amber-500/[0.04]" : ""}`}>
                                        <span className="flex items-center gap-1.5 flex-wrap">
                                            <KindPill r={r} />
                                            <StatusPills r={r} />
                                            <span className="ml-auto shrink-0 text-[13px] font-bold tabular-nums text-[rgba(0,0,0,0.87)]">
                                                {teeLabel(r.datetime)} <span className={w.tone === "warn" ? "text-amber-700" : w.tone === "brand" ? "text-brand" : "text-black/40"}>{w.text}</span>
                                            </span>
                                        </span>
                                        <span className="mt-1.5 flex items-baseline gap-1.5 min-w-0">
                                            <span className="font-bold text-[15px] text-[rgba(0,0,0,0.87)] truncate">{r.courseName}</span>
                                            {r.isBlind && <span className="shrink-0 text-[12px] font-semibold text-amber-800">가명 {r.blindName || "비공개 골프장"}</span>}
                                            <span className="ml-auto shrink-0 text-[12px] text-black/40 tabular-nums">{agoLabel(r.createdAt)}</span>
                                        </span>
                                        <span className="mt-0.5 flex items-center gap-2 text-[12.5px] text-black/55 tabular-nums">
                                            <span className="min-w-0 truncate">{r.owner?.name ?? "글쓴이 기록 없음"} · {feeLabel(r)}</span>
                                            <span className="ml-auto shrink-0"><SeatSummary r={r} /></span>
                                            <LucideChevronRight className="w-4 h-4 shrink-0 text-black/25" />
                                        </span>
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
                                    <th className="px-4 py-3 font-bold text-black/55">티타임</th>
                                    <th className="px-3 py-3 font-bold text-black/55">골프장</th>
                                    <th className="px-3 py-3 font-bold text-black/55">종류</th>
                                    <th className="px-3 py-3 font-bold text-black/55">글쓴이</th>
                                    <th className="px-3 py-3 font-bold text-black/55 text-right">그린피</th>
                                    <th className="px-3 py-3 font-bold text-black/55" title="조인은 확정 인원/정원, 부킹은 확정된 팀의 인원">신청</th>
                                    <th className="px-3 py-3 font-bold text-black/55">표시</th>
                                    <th className="px-3 py-3 font-bold text-black/55">등록</th>
                                    <th className="px-2 py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((r) => {
                                    const w = teeWhen(r.datetime);
                                    return (
                                        <tr key={r.id} onClick={() => onOpen(r)} className={`border-b border-black/[0.05] hover:bg-brand/[0.03] cursor-pointer ${r.hidden ? "bg-amber-500/[0.04]" : ""}`}>
                                            <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                                                <span className="font-bold text-[rgba(0,0,0,0.87)]">{teeLabel(r.datetime)}</span>
                                                <span className={`ml-1.5 text-[12px] font-semibold ${w.tone === "warn" ? "text-amber-700" : w.tone === "brand" ? "text-brand" : "text-black/40"}`}>{w.text}</span>
                                            </td>
                                            <td className="px-3 py-3 max-w-[240px]">
                                                <div className="font-bold text-[rgba(0,0,0,0.87)] truncate">{r.courseName}</div>
                                                <div className="text-[12px] text-black/45 truncate">
                                                    {r.isBlind ? <span className="font-semibold text-amber-800">가명 {r.blindName || "비공개 골프장"}</span> : placeLine(r)}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 whitespace-nowrap"><KindPill r={r} /></td>
                                            <td className="px-3 py-3 whitespace-nowrap">
                                                {r.owner ? (
                                                    <button onClick={(e) => { e.stopPropagation(); onOpenMember?.(r.owner!.id); }}
                                                        className="font-semibold text-[rgba(0,0,0,0.87)] hover:text-brand hover:underline">
                                                        {r.owner.name ?? "이름 없음"}
                                                    </button>
                                                ) : <span className="text-black/35">기록 없음</span>}
                                            </td>
                                            <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums text-black/70">{feeLabel(r)}</td>
                                            <td className="px-3 py-3 whitespace-nowrap tabular-nums text-[13px] text-black/70"><SeatSummary r={r} /></td>
                                            <td className="px-3 py-3"><div className="flex flex-wrap gap-1"><StatusPills r={r} /></div></td>
                                            <td className="px-3 py-3 whitespace-nowrap text-[12.5px] text-black/45 tabular-nums" title={kstDateTime(r.createdAt)}>{agoLabel(r.createdAt)}</td>
                                            <td className="px-2 py-3 text-right"><LucideChevronRight className="w-4 h-4 text-black/25 inline" /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {page && (offset > 0 || page.hasMore) && (
                        <div className="flex items-center justify-center gap-2 pt-1">
                            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}
                                className="h-9 px-4 rounded-xl text-[13px] font-semibold bg-white border border-black/10 text-black/70 hover:bg-black/[0.04] disabled:opacity-40">이전</button>
                            <span className="text-[13px] text-black/55 tabular-nums">{offset + 1}–{offset + items.length} / {page.total.toLocaleString()}</span>
                            <button disabled={!page.hasMore} onClick={() => setOffset(offset + PAGE)}
                                className="h-9 px-4 rounded-xl text-[13px] font-semibold bg-white border border-black/10 text-black/70 hover:bg-black/[0.04] disabled:opacity-40">다음</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ── 긴급 알림 기록 ──────────────────────────────────────────────────────

const URGENT_STATUS: Record<UrgentRow["status"], { label: string; tone: "brand" | "warn" | "neutral" }> = {
    live: { label: "게시 중", tone: "brand" },
    hidden: { label: "가림", tone: "warn" },
    deleted: { label: "지워짐", tone: "neutral" },
};

function UrgentSection({ onOpen, onOpenMember }: { onOpen: (r: GolfListingRow) => void; onOpenMember?: (id: string) => void }) {
    const { toast } = useToast();
    const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{ days: number; items: UrgentRow[] }>({
        queryKey: [BASE, "urgent"],
        gcTime: 0,
        staleTime: 0,
    });
    const items = Array.isArray(data?.items) ? data!.items : [];
    const totals = useMemo(() => ({
        recipients: items.reduce((s, r) => s + (r.recipients || 0), 0),
        gone: items.filter((r) => r.status !== "live").length,
    }), [items]);
    const open = (r: UrgentRow) => {
        if (r.listing) onOpen(r.listing);
        else toast({ title: "이미 지워진 글입니다", description: "보낸 내용만 기록에 남아 있습니다." });
    };

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
                <KpiTile label={`${data?.days ?? 7}일 긴급 방송`} value={items.length} unit="건" />
                <KpiTile label="받은 사람(합계)" value={totals.recipients.toLocaleString()} unit="명" tone="brand" />
                <KpiTile label="가림·지워짐" value={totals.gone} unit="건" tone={totals.gone > 0 ? "alert" : "default"} />
            </div>
            <div className="flex items-start gap-2">
                <p className="flex-1 text-[12.5px] text-black/50 leading-relaxed">
                    <LucideZap className="inline w-3.5 h-3.5 mr-0.5 text-red-500 align-[-2px]" />
                    긴급 조인 = 오늘 티 · 필드 · 고정 그린피 {Math.round(URGENT_MAX_FEE / 10_000)}만원 이하 · {Math.round(URGENT_MIN_LEAD_MS / 3_600_000)}시간 이상 남은 조인.
                    올라오면 골프 회원 전체에게 푸시가 나갑니다. 받은 사람 = 알림함에 남은 수(푸시를 꺼 둔 사람 포함).
                </p>
                <button onClick={() => refetch()} aria-label="새로고침" title="새로고침"
                    className="h-9 w-9 shrink-0 rounded-xl bg-white border border-black/10 flex items-center justify-center text-black/55 hover:text-brand">
                    <LucideRefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                </button>
            </div>

            {isLoading ? (
                <EmptyState>불러오는 중…</EmptyState>
            ) : isError ? (
                <EmptyState><span className="text-red-600">{(error as Error)?.message || "긴급 알림 기록을 불러오지 못했습니다"}</span></EmptyState>
            ) : items.length === 0 ? (
                <EmptyState>최근 {data?.days ?? 7}일 동안 나간 긴급 조인 알림이 없습니다.</EmptyState>
            ) : (
                <>
                    <ul className="md:hidden space-y-2">
                        {items.map((r) => {
                            const st = URGENT_STATUS[r.status];
                            const l = r.listing;
                            return (
                                <li key={r.postId}>
                                    <button onClick={() => open(r)} className="w-full text-left rounded-2xl bg-white border border-black/[0.08] px-4 py-3 active:bg-black/[0.03]">
                                        <span className="flex items-center gap-1.5">
                                            <Pill tone={st.tone}>{st.label}</Pill>
                                            <span className="text-[12.5px] text-black/50 tabular-nums">{kstDateTime(r.sentAt)} 보냄 · {agoLabel(r.sentAt)}</span>
                                            <span className="ml-auto text-[13px] font-bold tabular-nums text-brand">{r.recipients.toLocaleString()}명</span>
                                        </span>
                                        <span className="mt-1.5 block font-bold text-[15px] text-[rgba(0,0,0,0.87)] truncate">
                                            {l ? l.courseName : <span className="text-black/45">지워진 글</span>}
                                            {l && <span className="ml-1.5 text-[13px] font-semibold text-black/55 tabular-nums">{teeLabel(l.datetime)}</span>}
                                        </span>
                                        <span className="mt-0.5 flex items-center gap-2 text-[12.5px] text-black/55 tabular-nums">
                                            <span className="min-w-0 truncate">{r.owner?.name ?? "글쓴이 기록 없음"}{l && ` · ${feeLabel(l)}`}</span>
                                            {l && <span className="ml-auto shrink-0"><SeatSummary r={l} /></span>}
                                        </span>
                                        {r.sampleTitle && <span className="mt-1.5 block rounded-lg bg-black/[0.03] px-2.5 py-1.5 text-[12px] text-black/55 line-clamp-2">{r.sampleTitle} — {r.sampleBody}</span>}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    <div className="hidden md:block rounded-2xl overflow-hidden border border-black/10">
                        <table className="w-full text-left bg-white text-sm">
                            <thead>
                                <tr className="border-b border-black/10 bg-black/[0.02] text-[12px]">
                                    <th className="px-4 py-3 font-bold text-black/55">보낸 시각</th>
                                    <th className="px-3 py-3 font-bold text-black/55">골프장 · 티타임</th>
                                    <th className="px-3 py-3 font-bold text-black/55">올린 사람</th>
                                    <th className="px-3 py-3 font-bold text-black/55 text-right">받은 사람</th>
                                    <th className="px-3 py-3 font-bold text-black/55">신청</th>
                                    <th className="px-3 py-3 font-bold text-black/55">지금</th>
                                    <th className="px-3 py-3 font-bold text-black/55">보낸 내용</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((r) => {
                                    const st = URGENT_STATUS[r.status];
                                    const l = r.listing;
                                    return (
                                        <tr key={r.postId} onClick={() => open(r)} className="border-b border-black/[0.05] hover:bg-brand/[0.03] cursor-pointer align-top">
                                            <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                                                <div className="font-semibold text-[rgba(0,0,0,0.87)]">{kstDateTime(r.sentAt)}</div>
                                                <div className="text-[12px] text-black/40">{agoLabel(r.sentAt)}</div>
                                            </td>
                                            <td className="px-3 py-3 max-w-[220px]">
                                                <div className="font-bold text-[rgba(0,0,0,0.87)] truncate">{l ? l.courseName : "지워진 글"}</div>
                                                {l && <div className="text-[12px] text-black/45 tabular-nums">{teeLabel(l.datetime)} · {feeLabel(l)}</div>}
                                            </td>
                                            <td className="px-3 py-3 whitespace-nowrap">
                                                {r.owner ? (
                                                    <button onClick={(e) => { e.stopPropagation(); onOpenMember?.(r.owner!.id); }} className="font-semibold text-[rgba(0,0,0,0.87)] hover:text-brand hover:underline">
                                                        {r.owner.name ?? "이름 없음"}
                                                    </button>
                                                ) : <span className="text-black/35">기록 없음</span>}
                                            </td>
                                            <td className="px-3 py-3 text-right whitespace-nowrap font-bold tabular-nums text-brand">{r.recipients.toLocaleString()}명</td>
                                            <td className="px-3 py-3 whitespace-nowrap tabular-nums text-[13px] text-black/65">
                                                {l ? <SeatSummary r={l} /> : <span className="text-black/30">-</span>}
                                            </td>
                                            <td className="px-3 py-3"><Pill tone={st.tone}>{st.label}</Pill></td>
                                            <td className="px-3 py-3 max-w-[300px] text-[12.5px] text-black/55">
                                                <div className="line-clamp-2">{r.sampleTitle}{r.sampleBody ? ` — ${r.sampleBody}` : ""}</div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

// ── 옆 시트: 글 자세히 · 신청자 · 조치 ─────────────────────────────────

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl bg-white border border-black/[0.06] px-3 py-2.5 min-w-0">
            <p className="text-[11.5px] font-bold text-black/45">{label}</p>
            <div className="mt-0.5 text-[14px] font-bold text-[rgba(0,0,0,0.87)] tabular-nums truncate">{children}</div>
        </div>
    );
}

function ListingSheet({ row, onClose, onOpenMember }: { row: GolfListingRow | null; onClose: () => void; onOpenMember?: (id: string) => void }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [reason, setReason] = useState("");
    useEffect(() => { setReason(""); }, [row?.id]);
    const contentRef = useRef<HTMLDivElement>(null);

    const detailQ = useQuery<{ listing: GolfListingDetail; applicants: Applicant[] }>({
        queryKey: [BASE, row?.id ?? "-", "applicants"],
        enabled: !!row,
        gcTime: 0,
        staleTime: 0,
        retry: false,
    });
    const detail = detailQ.data && !Array.isArray(detailQ.data) ? detailQ.data : undefined;
    const r: GolfListingRow | GolfListingDetail | null = detail?.listing ?? row;
    const d = detail?.listing;
    const applicants = Array.isArray(detail?.applicants) ? detail!.applicants : [];
    const gone = (detailQ.error as { status?: number } | null)?.status === 404;

    const refresh = () => queryClient.invalidateQueries({ queryKey: GOLF_LISTINGS_KEY });

    const hide = useMutation({
        mutationFn: async (v: { id: string; hidden: boolean; reason?: string }) =>
            apiRequest(`${BASE}/${v.id}/hide`, { method: "POST", body: { hidden: v.hidden, reason: v.reason } }) as Promise<{ closedReports?: number; notified?: boolean }>,
        onSuccess: (res, v) => {
            // 서버가 실제로 한 일만 적는다 — 글쓴이 기록이 없는 옛 글은 알림이 안 나간다.
            const parts = [
                res?.notified ? "글쓴이에게 안내 알림을 보냈습니다." : "글쓴이 기록이 없어 알림은 보내지 않았습니다.",
                res?.closedReports ? `대기 중이던 신고 ${res.closedReports}건을 ${v.hidden ? "조치" : "기각"}로 닫았습니다.` : "",
            ];
            toast({ title: v.hidden ? "가렸습니다" : "다시 보이게 했습니다", description: parts.filter(Boolean).join(" ") });
            setReason("");
            refresh();
        },
        onError: (e: Error, v) => {
            toast({ title: v.hidden ? "가리기 실패" : "보이기 실패", description: e?.message ?? "", variant: "destructive" });
            refresh();
        },
    });
    const remove = useMutation({
        mutationFn: async (id: string) => apiRequest(`${BASE}/${id}`, { method: "DELETE" }) as Promise<{ notified?: number }>,
        onSuccess: (res) => {
            toast({ title: "지웠습니다", description: res?.notified ? `알림 ${res.notified}건을 보냈습니다(글쓴이·신청자).` : "알릴 사람이 없었습니다." });
            onClose();
            refresh();
        },
        onError: (e: Error) => {
            toast({ title: "지우기 실패", description: e?.message ?? "", variant: "destructive" });
            refresh();
        },
    });
    const busy = hide.isPending || remove.isPending;

    const doHide = async () => {
        if (!r) return;
        const open = r.reports.open;
        const ok = await appConfirm({
            message: `이 글을 가릴까요?\n목록과 글 화면에서 빠지고 새 신청을 받지 않습니다. 신청·채팅방은 그대로 남고, 글쓴이에게 안내 알림이 갑니다.${open > 0 ? `\n대기 중인 신고 ${open}건은 '조치'로 닫힙니다.` : ""}`,
            confirmText: "가리기",
        });
        if (ok) hide.mutate({ id: r.id, hidden: true, reason: reason.trim() || undefined });
    };
    const doShow = async () => {
        if (!r) return;
        const open = r.reports.open;
        const ok = await appConfirm({
            message: `이 글을 다시 보이게 할까요?\n목록에 다시 뜨고 신청을 받습니다. 글쓴이에게 안내 알림이 갑니다.${open > 0 ? `\n대기 중인 신고 ${open}건은 '기각'으로 닫힙니다.` : ""}`,
            confirmText: "보이기",
        });
        if (ok) hide.mutate({ id: r.id, hidden: false });
    };
    const doDelete = async () => {
        if (!r) return;
        const people = r.applicants.applied + r.applicants.accepted;
        const ok = await appConfirm({
            message: `이 글을 지울까요? 되돌릴 수 없습니다.\n신청 기록${people > 0 ? `(대기·확정 ${people}건)` : ""}과 채팅방 메시지가 함께 지워지고, 글쓴이${people > 0 ? "와 신청자" : ""}에게 알림이 갑니다.\n먼저 '가리기'를 권합니다 — 가리면 기록이 남고 언제든 다시 보이게 할 수 있습니다.`,
            tone: "danger",
            confirmText: "지우기",
        });
        if (ok) remove.mutate(r.id);
    };

    const w = r ? teeWhen(r.datetime) : null;

    return (
        <Sheet open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
            <SheetContent side="right" ref={contentRef} className="w-full sm:max-w-md p-0 flex flex-col bg-surface-0 break-keep outline-none"
                // 열릴 때 첫 단추(글쓴이 이름)에 초점 테두리가 생기지 않게 시트 자체에 초점을 둔다 — 키보드는 Tab 으로 그대로 들어간다
                onOpenAutoFocus={(e) => { e.preventDefault(); contentRef.current?.focus({ preventScroll: true }); }}>
                {r && (
                    <>
                        <div className="shrink-0 bg-white border-b border-black/[0.07] px-5 pt-6 pb-4">
                            <div className="flex flex-wrap items-center gap-1.5 pr-8">
                                <KindPill r={r} />
                                <StatusPills r={r} />
                                {r.convertedFromBooking && <Pill tone="neutral">부킹에서 전환</Pill>}
                            </div>
                            <SheetTitle className="mt-2 text-[19px] font-bold text-[rgba(0,0,0,0.87)] leading-snug break-words">{r.courseName}</SheetTitle>
                            <SheetDescription className="mt-0.5 text-[13.5px] text-black/55 tabular-nums">
                                {teeLabel(r.datetime)}
                                {w && <span className={`ml-1.5 font-semibold ${w.tone === "warn" ? "text-amber-700" : w.tone === "brand" ? "text-brand" : "text-black/40"}`}>{w.text}</span>}
                                <span className="text-black/40"> · {placeLine(r)}</span>
                            </SheetDescription>
                            {r.isBlind && (
                                <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-900 leading-relaxed">
                                    비공개 글 — 회원에게는 <b>{r.blindName || "비공개 골프장"}</b>(가명)으로 보입니다. 실명은 운영자에게만 보입니다.
                                </p>
                            )}
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
                            {gone && <EmptyState>이 글은 이미 지워졌습니다.</EmptyState>}

                            {r.hidden && (
                                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[13px] text-amber-900">
                                    <b>가려진 글</b> — 목록·글 화면에 안 보이고 새 신청을 받지 않습니다.
                                    {r.hiddenReason && <span className="block mt-0.5 text-amber-900/80">이유: {r.hiddenReason}</span>}
                                </div>
                            )}

                            <section>
                                <h3 className="text-[12px] font-bold text-black/45 mb-2">요약</h3>
                                <div className="grid grid-cols-3 gap-2">
                                    <Fact label={feeTitle(r)}>{feeLabel(r)}</Fact>
                                    <Fact label={r.listingType === "JOIN" ? "확정 / 정원" : "확정(한 팀)"}>
                                        {r.listingType === "JOIN" ? `${r.applicants.seats} / ${r.capacity}` : r.applicants.accepted > 0 ? `${r.applicants.seats}명` : "미확정"}
                                    </Fact>
                                    <Fact label="대기"><span className={r.applicants.applied > 0 ? "text-amber-700" : ""}>{r.applicants.applied}</span></Fact>
                                </div>
                                <p className="mt-1.5 text-[12.5px] text-black/50 tabular-nums">
                                    거절 {r.applicants.rejected} · 취소 {r.applicants.cancelled} · <span className={r.applicants.noshow > 0 ? "font-bold text-red-600" : ""}>노쇼 {r.applicants.noshow}</span>
                                </p>
                            </section>

                            <section>
                                <h3 className="text-[12px] font-bold text-black/45 mb-2">글</h3>
                                <div className="rounded-2xl bg-white border border-black/[0.07] divide-y divide-black/[0.05] text-[13.5px]">
                                    <Line label="글쓴이">
                                        {r.owner ? (
                                            <button onClick={() => onOpenMember?.(r.owner!.id)} className="font-bold text-brand hover:underline">{r.owner.name ?? "이름 없음"}</button>
                                        ) : <span className="text-black/40">기록 없음(9/9 이전 옛 글)</span>}
                                    </Line>
                                    <Line label="종류">{kindLabel(r)}</Line>
                                    <Line label="등록"><span className="tabular-nums">{kstDateTime(r.createdAt)} · {agoLabel(r.createdAt)}</span></Line>
                                    {r.slots && r.slots.length > 0 && (
                                        <Line label="자리">
                                            <span className="flex flex-wrap gap-1">
                                                {r.slots.map((s, i) => (
                                                    <span key={i} className={`rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${s.role === "OPEN" ? "bg-brand/10 text-brand" : "bg-black/[0.05] text-black/60"}`}>
                                                        {SLOT_ROLE[s.role] ?? s.role}·{SLOT_GENDER[s.gender] ?? s.gender}
                                                    </span>
                                                ))}
                                            </span>
                                        </Line>
                                    )}
                                    {d?.joinCondition && r.listingType === "JOIN" && <Line label="모집 조건">{d.joinCondition}</Line>}
                                    {d && d.options.length > 0 && (
                                        <Line label="옵션">
                                            <span className="flex flex-wrap gap-1">{d.options.map((o) => <Pill key={o} tone="neutral">{OPTION_LABEL[o] ?? o}</Pill>)}</span>
                                        </Line>
                                    )}
                                    {d?.policyType && r.listingType === "BOOKING" && (
                                        <Line label="취소 규정">{d.policyType === "POLICY_CUSTOM" ? (d.policyCustomText || "직접 입력(비어 있음)") : (POLICY_LABEL[d.policyType] ?? d.policyType)}</Line>
                                    )}
                                    {d?.comment && <Line label="메모"><span className="whitespace-pre-line break-words font-normal text-black/75">{d.comment}</span></Line>}
                                </div>
                            </section>

                            {(r.reports.total > 0 || (d?.reportReasons.length ?? 0) > 0) && (
                                <section>
                                    <h3 className="text-[12px] font-bold text-black/45 mb-2">신고</h3>
                                    <div className="rounded-2xl bg-white border border-black/[0.07] px-4 py-3 space-y-2">
                                        <p className="text-[13px] text-black/65">
                                            대기 <b className={r.reports.open > 0 ? "text-red-600" : ""}>{r.reports.open}</b>건 · 전체 <b>{r.reports.total}</b>건
                                            <span className="text-black/40"> — 신고 내용은 '신고/제재'에서도 볼 수 있습니다.</span>
                                        </p>
                                        {d && d.reportReasons.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {d.reportReasons.map((x) => <Pill key={x.reason} tone={x.open > 0 ? "alert" : "neutral"}>{x.label} {x.count}</Pill>)}
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}

                            <section>
                                <h3 className="text-[12px] font-bold text-black/45 mb-2">신청자 {applicants.length > 0 && <span className="tabular-nums">{applicants.length}</span>}</h3>
                                {detailQ.isLoading ? (
                                    <div className="rounded-2xl bg-white border border-black/[0.07] p-5 text-center text-[13px] text-black/45">불러오는 중…</div>
                                ) : applicants.length === 0 ? (
                                    <div className="rounded-2xl bg-white border border-black/[0.07] p-5 text-center text-[13px] text-black/45">신청한 사람이 없습니다.</div>
                                ) : (
                                    <ul className="rounded-2xl bg-white border border-black/[0.07] divide-y divide-black/[0.05]">
                                        {applicants.map((a) => {
                                            const st = APPLICANT_STATUS[a.status] ?? { label: a.status, tone: "neutral" as const };
                                            return (
                                                <li key={a.memberId} className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => onOpenMember?.(a.memberId)} className="min-w-0 truncate font-bold text-[14px] text-[rgba(0,0,0,0.87)] hover:text-brand hover:underline">
                                                            {a.name ?? "이름 없음"}
                                                        </button>
                                                        <Pill tone={st.tone}>{st.label}</Pill>
                                                        {r.listingType === "BOOKING" && <span className="text-[12px] text-black/50 tabular-nums">{a.headcount}명</span>}
                                                        <span className={`ml-auto shrink-0 text-[12px] tabular-nums ${a.noShowCount > 0 ? "font-bold text-red-600" : a.cancelCount >= 2 ? "font-bold text-amber-700" : "text-black/40"}`}
                                                            title="이 회원이 지금까지 모든 글에서 취소한·안 나타난 횟수">
                                                            취소 {a.cancelCount} · 노쇼 {a.noShowCount}
                                                        </span>
                                                    </div>
                                                    <p className="mt-0.5 text-[12px] text-black/45 tabular-nums">
                                                        신청 {kstDateTime(a.appliedAt)}
                                                        {a.status !== "applied" && a.changedAt && <> · {st.label} {kstDateTime(a.changedAt)}</>}
                                                    </p>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                                {applicants.length > 0 && <p className="mt-1.5 text-[12px] text-black/40">오른쪽 숫자는 그 회원의 평생 취소·노쇼 횟수입니다(이 글만이 아니라 전체).</p>}
                            </section>

                            {d && d.history.length > 0 && (
                                <section>
                                    <h3 className="text-[12px] font-bold text-black/45 mb-2">처리 기록</h3>
                                    <ul className="space-y-1">
                                        {d.history.map((h, i) => (
                                            <li key={`${h.at}-${i}`} className="text-[12.5px] text-black/60 tabular-nums">
                                                {kstDateTime(h.at)} · <b className="font-semibold text-black/75">{h.label}</b>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}
                        </div>

                        {!gone && (
                            <div className="shrink-0 bg-white border-t border-black/[0.07] px-5 py-3 space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                                {!r.hidden && (
                                    <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200}
                                        placeholder="가리는 이유(선택 · 기록에만 남음)"
                                        title="기록(가린 이유)에만 남고 글쓴이 알림에는 실리지 않습니다"
                                        className="w-full h-10 px-3 rounded-xl bg-white border border-black/10 text-[13.5px] outline-none focus:border-brand/40" />
                                )}
                                <div className="flex gap-2">
                                    {r.hidden ? (
                                        <button disabled={busy} onClick={doShow}
                                            className="flex-1 h-10 rounded-xl bg-brand text-white text-[14px] font-bold disabled:opacity-50">
                                            {hide.isPending ? "처리 중…" : "다시 보이기"}
                                        </button>
                                    ) : (
                                        <button disabled={busy} onClick={doHide}
                                            className="flex-1 h-10 rounded-xl bg-[rgba(0,0,0,0.87)] text-white text-[14px] font-bold disabled:opacity-50">
                                            {hide.isPending ? "처리 중…" : "가리기"}
                                        </button>
                                    )}
                                    <button disabled={busy} onClick={doDelete}
                                        className="h-10 px-5 rounded-xl bg-white border border-red-500/30 text-red-600 text-[14px] font-bold hover:bg-red-500/[0.06] disabled:opacity-50">
                                        {remove.isPending ? "지우는 중…" : "지우기"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex gap-3 px-4 py-2.5">
            <span className="w-16 shrink-0 text-[12.5px] font-bold text-black/45 pt-px">{label}</span>
            <div className="min-w-0 flex-1 font-semibold text-[rgba(0,0,0,0.8)]">{children}</div>
        </div>
    );
}
