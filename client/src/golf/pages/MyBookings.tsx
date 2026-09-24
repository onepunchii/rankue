/**
 * 내 예약 — 부킹 | 조인 | 관심(2026-09-24 둘째 판).
 *
 * 첫 판(9/23)은 "내가 올린 글 | 내가 신청한 글 | 관심 골프장" — **내 역할**로 갈랐다.
 * 오너(9/24): "내가 올린 글? 내가 신청한 글? 이름이 이상하고 정리가 안 된 느낌 … 부킹 조인 관심 이렇게 가야 되나? 내가 등록한 거랑 구별도 해야 되고".
 * 이 화면에 온 사람이 찾는 건 "내 다음 라운드"이고, 먼저 떠올리는 갈래는 역할이 아니라 **종류**(부킹·조인)다. 그래서
 *  - 맨 위 **다음 라운드** 카드 — 가장 가까운, 내가 실제로 치러 가는 티타임 하나(길찾기·채팅방).
 *  - 탭은 **종류**: 부킹 · 조인 · 관심. 하단 내비·목록 화면과 같은 말.
 *  - 역할은 카드마다 **꼬리표**: [내 모집](채운 칩) · [신청](테두리 칩) + 상태 칩. 필요할 때만 '내가 올린·내가 신청한' 칩으로 좁힌다.
 *  - 순서: **할 일**(내 글에 승인 기다리는 신청) → 다가오는 → 지난(접힘).
 *  - 부킹에서 조인으로 바꾼 글은 조인 탭에 '부킹에서 전환' 표시로.
 *
 * 페이지인 이유(시트였던 것): 주소가 생겨 푸시가 여기를 가리킬 수 있고, 뒤로가기가 자연스럽고, 높이 제한이 없다.
 * 옛 주소 ?tab=mine|applied 는 역할 칩으로 받아 준다(나가 있는 알림들이 그 주소를 들고 있다).
 *
 * ⚠️ `bg-white`·`text-black/*` 를 쓰면 안 된다 — 골프 테마가 `.bg-white` 만 어두운 면으로 되받고
 *   `.text-black` 은 그대로 둬서 검은 글씨가 어두운 바탕에 얹힌다(index.css). 리터럴 hex·white/알파만 쓴다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LucideChevronDown, LucideLoader2 } from "lucide-react";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { kstDateKey, kstDateLabel, kstTime } from "@/lib/kst";
import { JoinApplicants } from "../components/booking/JoinApplicants";
import { ToJoinSheet } from "../components/booking/ToJoinSheet";
import {
    JoinTypeBadge, SlotDots, costText, hostSeatLabel, isConvertedJoin, joinTypeOf,
    kakaoMapUrl, kakaoRouteUrl, slotLegend, slotsOf,
} from "../components/join/joinUi";
import { MAX_SLOTS } from "@shared/golfJoin";
import {
    MY_LISTINGS_QUERY_KEY, MY_REQUESTS_QUERY_KEY,
    hasUnseenRequestChange, markRequestsSeen, readRequestsSeen,
} from "../lib/myListings";
import { useMyWatches } from "../lib/courseApi";
import { WatchedCourses } from "../components/course/list/WatchedCourses";
import { GolfBackButton } from "../components/common/GolfBackButton";

/** 카드의 역할 — 내가 올린 글이냐, 남의 글에 신청했느냐. */
type Role = "mine" | "applied";
type Kind = "booking" | "join";
type PageTab = Kind | "watch";
type RoleFilter = "all" | Role;
type Item = any & { role: Role };

const kindOf = (it: { listingType?: string }): Kind => (it.listingType === "JOIN" ? "join" : "booking");

const STATUS: Record<string, { label: string; cls: string }> = {
    applied: { label: "대기 중", cls: "bg-[#FF6B00]/15 text-[#FF8A33]" },
    accepted: { label: "확정", cls: "bg-[#64DD17]/15 text-[#8BE84A]" },
    rejected: { label: "거절", cls: "bg-white/[0.06] text-white/45" },
    noshow: { label: "안 옴", cls: "bg-red-500/15 text-red-400" },
};

/**
 * 내 신청이 지금 어디쯤인지 **한 줄**로.
 * ⚠️ 한 줄을 넘기지 말 것(2026-09-23 오너: "의미없는 내용들이 너무 많아 … 다 빼줘"). 정보가 아니면 적지 않는다.
 */
function nextStepText(status: string | undefined, past: boolean, isJoin: boolean): string {
    if (past) {
        if (status === "noshow") return "올린 분이 '안 옴'으로 표시했어요.";
        return "지난 티타임이에요.";
    }
    switch (status) {
        case "applied":
            return "올린 분의 승인을 기다리는 중이에요.";
        case "accepted":
            return isJoin
                ? "확정됐어요. 채팅방에서 약속을 정하세요."
                : "확정됐어요. 채팅방에 연락처가 열렸어요.";
        case "rejected":
            return "거절돼서 이 글에는 다시 신청할 수 없어요.";
        case "noshow":
            return "안 옴으로 표시된 신청이에요.";
        default:
            return "";
    }
}

/** 내 역할 꼬리표 — 내 모집은 채운 칩, 신청은 테두리 칩(2026-09-24 오너 확정). */
function RoleTag({ role }: { role: Role }) {
    return role === "mine" ? (
        <span className="shrink-0 whitespace-nowrap h-5 px-1.5 rounded-md text-[11px] font-semibold leading-5 bg-[#ffffff] text-[#0a0a0a]">내 모집</span>
    ) : (
        <span className="shrink-0 whitespace-nowrap h-5 px-1.5 rounded-md text-[11px] font-semibold leading-5 ring-1 ring-inset ring-white/25 text-white/75">신청</span>
    );
}

function KindBadge({ item }: { item: Item }) {
    if (item.listingType === "JOIN") return <JoinTypeBadge type={joinTypeOf(item)} />;
    if (item.sellerType !== "PERSONAL") return null;
    return (
        <span className="shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#4DA3FF]/15 text-[#7CBBFF]">
            개인 양도
        </span>
    );
}

/** 한국 날짜로 며칠 남았나 — "오늘"·"내일"·"D-4". 시각이 아니라 날짜 차이다(밤 11시에 보는 내일 새벽 티타임은 '내일'). */
function ddayText(iso: string, now: number): string {
    const [a, b] = [kstDateKey(now), kstDateKey(iso)].map((k) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); });
    const n = Math.round((b - a) / 86_400_000);
    return n <= 0 ? "오늘" : n === 1 ? "내일" : `D-${n}`;
}

/** 내가 실제로 치러 가는 티타임인가 — 다음 라운드 카드의 후보. 내가 올린 **부킹**은 파는 것이라 내 라운드가 아니다. */
function isMyRound(it: Item): boolean {
    if (it.role === "applied") return it.myJoinStatus === "accepted";
    return it.listingType === "JOIN";
}

/** 채팅방은 확정된 사람과 올린 사람만 들어간다(서버가 명단으로 막는다) — 못 들어갈 사람에게 단추를 보여 주지 않는다. */
function canChatOf(it: Item): boolean {
    return it.role === "mine" ? Number(it.joinApplied ?? 0) > 0 : it.myJoinStatus === "accepted";
}

const PILL = "h-9 px-3.5 rounded-full bg-white/[0.06] text-[12.5px] font-medium text-white/80 inline-flex items-center shrink-0";
const PILL_OUTLINE = "h-9 px-3.5 rounded-full border border-white/10 text-[12.5px] font-medium text-white/55 inline-flex items-center shrink-0 active:text-red-400";

/** 다음 라운드 — 이 화면에 온 사람이 가장 먼저 보러 온 것. */
function NextRound({ item, now, onDetail, onChat }: { item: Item; now: number; onDetail: () => void; onChat: () => void }) {
    const name: string = item.isBlind ? item.blindName : item.courseName;
    const isJoin = item.listingType === "JOIN";
    const dday = ddayText(item.datetime, now);
    const who = item.role === "mine"
        ? `내 모집 · 확정 ${item.joinApplied ?? 0}/${item.joinCapacity ?? "?"}`
        : isJoin ? `신청 확정 · ${item.joinApplied ?? 0}/${item.joinCapacity ?? "?"}명` : `예약 확정${Number(item.myHeadcount) > 1 ? ` · ${item.myHeadcount}명` : ""}`;
    return (
        <section aria-label="다음 라운드" className="rounded-2xl bg-[#64DD17]/[0.07] ring-1 ring-inset ring-[#64DD17]/25 p-4">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-[#8BE84A]">다음 라운드</span>
                <span className={cn(
                    "h-6 px-2 rounded-full text-[12px] font-semibold leading-6 tabular-nums",
                    dday === "오늘" ? "bg-[#64DD17] text-[#051907]" : "bg-white/[0.08] text-white/85",
                )}>{dday}</span>
            </div>
            <p className="mt-2 text-[15px] font-semibold text-white tabular-nums">{kstDateLabel(item.datetime)} {kstTime(item.datetime)}</p>
            <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
                <KindBadge item={item} />
                <span className="text-[17px] font-semibold text-white truncate">{name}</span>
            </div>
            <p className="mt-1 text-[12.5px] text-white/60 tabular-nums">{who}</p>
            <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                {!item.isBlind && <a href={kakaoRouteUrl(name, item.lat, item.lng)} target="_blank" rel="noreferrer" className={PILL}>길찾기</a>}
                {canChatOf(item) && <button type="button" onClick={onChat} className={PILL}>채팅방</button>}
                <button type="button" onClick={onDetail} className={PILL}>자세히</button>
            </div>
        </section>
    );
}

interface RowProps {
    item: Item;
    past: boolean;
    open: boolean;
    fresh: boolean;
    onToggle: () => void;
    onGo: () => void;
    onDelete: () => void;
    onToJoin: () => void;
    onCancel: () => void;
    onChat: () => void;
}

function Row({ item, past, open, fresh, onToggle, onGo, onDelete, onToJoin, onCancel, onChat }: RowProps) {
    const kind = item.role as Role;
    const isJoin = item.listingType === "JOIN";
    const name: string = item.isBlind ? item.blindName : item.courseName;
    const st = kind === "applied" ? STATUS[item.myJoinStatus] : null;
    const accepted = item.myJoinStatus === "accepted";
    const pending = kind === "mine" ? Number(item.joinPending ?? 0) : 0;
    /**
     * '조인으로 전환' 이 붙는 자리. 내가 올린 **부킹**이고, 아직 안 지난 티타임이고, **자리가 남았을 때**.
     * 2026-09-24 오너("국수맘이 2명 신청했는데 왜 조인으로 전환 버튼이 사라졌지?"): joinApplied 는 **사람 수**이고,
     * 네 자리가 다 찼을 때만 버튼이 사라진다(서버도 같은 기준).
     */
    const canToJoin = kind === "mine" && !isJoin && !past && Number(item.joinApplied ?? 0) < MAX_SLOTS;
    const canChat = canChatOf(item);
    const slots = isJoin ? slotsOf(item) : null;

    return (
        <li id={`row-${item.id}`} className={cn(
            "rounded-2xl border bg-white/[0.03] overflow-hidden scroll-mt-40",
            accepted && !past ? "border-[#64DD17]/30" : pending > 0 && !past ? "border-[#FF6B00]/30" : "border-white/[0.08]",
            (past || item.myJoinStatus === "rejected") && "opacity-50",
        )}>
            {/* 머리줄 전체가 펼치기 단추다 — 375px 에서 화살표만 노리게 하면 아무도 못 편다. */}
            <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left px-3.5 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <RoleTag role={kind} />
                        <KindBadge item={item} />
                        <span className="text-[14px] font-medium text-white truncate">{name}</span>
                        {fresh && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-red-500" aria-label="새 소식" />}
                        {st && <span className={cn("shrink-0 ml-auto px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold", st.cls)}>{st.label}</span>}
                        {pending > 0 && !past && (
                            <span className="shrink-0 ml-auto px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#FF6B00]/15 text-[#FF8A33] tabular-nums">승인 대기 {pending}</span>
                        )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[12px] text-white/50 min-w-0">
                        <span className="shrink-0 tabular-nums">{kstDateLabel(item.datetime)} {kstTime(item.datetime)}</span>
                        <span className="w-0.5 h-2 bg-white/10 rounded-full shrink-0" />
                        {isJoin
                            ? (
                                <span className="inline-flex items-center gap-1.5 truncate">
                                    <SlotDots slots={slotsOf(item)} filled={Number(item.joinApplied ?? 0)} size={14} hostLabel={hostSeatLabel(item)} />
                                    확정 {item.joinApplied ?? 0}/{item.joinCapacity ?? "?"}
                                    {isConvertedJoin(item) && <span className="text-white/35"> · 부킹에서 전환</span>}
                                </span>
                            )
                            : (
                                <span className="truncate">
                                    {item.greenFee ? `${Number(item.greenFee).toLocaleString()}원` : costText(item)}
                                    {kind === "applied" && item.myHeadcount > 1 ? ` · ${item.myHeadcount}명` : ""}
                                </span>
                            )}
                    </div>
                </div>
                <LucideChevronDown className={cn("w-5 h-5 text-white/30 shrink-0 transition-transform", open && "rotate-180")} />
            </button>

            {open && (
                <div className="px-3.5 pb-3.5 space-y-3 border-t border-white/[0.06] pt-3">
                    {/* 내 신청: 지금 어디쯤인지 */}
                    {kind === "applied" && (
                        <p className="text-[12.5px] leading-relaxed text-white/60">
                            {nextStepText(item.myJoinStatus, past, isJoin)}
                        </p>
                    )}

                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
                        <dt className="text-white/35">비용</dt>
                        <dd className="text-white/75">{item.greenFee ? `${Number(item.greenFee).toLocaleString()}원` : costText(item)}</dd>
                        {(item.region || item.venueName) && (
                            <>
                                <dt className="text-white/35">장소</dt>
                                <dd className="text-white/75 truncate">{[item.region, item.venueName].filter(Boolean).join(" · ")}</dd>
                            </>
                        )}
                        {slots && (
                            <>
                                <dt className="text-white/35">자리</dt>
                                <dd className="text-white/75">{slotLegend(slots, hostSeatLabel(item), Number(item.joinApplied ?? 0)).join(" · ")}</dd>
                            </>
                        )}
                        {kind === "applied" && Number(item.myHeadcount) > 1 && (
                            <>
                                <dt className="text-white/35">신청 인원</dt>
                                <dd className="text-white/75">{item.myHeadcount}명</dd>
                            </>
                        )}
                    </dl>

                    {/* 확정된 글: 가는 길과 연락처.
                        티타임이 지나도 6시간은 남긴다 — 늦어서 연락해야 하는 바로 그때 '지난 글'로 내려가며 번호·길찾기가 사라지면 안 된다. */}
                    {kind === "applied" && accepted && Date.now() < new Date(item.datetime).getTime() + 6 * 3_600_000 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {!item.isBlind && <a href={kakaoMapUrl(name, item.lat, item.lng)} target="_blank" rel="noreferrer" className={PILL}>지도</a>}
                            {!item.isBlind && <a href={kakaoRouteUrl(name, item.lat, item.lng)} target="_blank" rel="noreferrer" className={PILL}>길찾기</a>}
                            {!isJoin && item.managerPhone && <a href={`sms:${item.managerPhone}`} className="h-9 px-3.5 rounded-full bg-[#64DD17]/15 text-[12.5px] font-medium text-[#8BE84A] inline-flex items-center shrink-0">문자 {item.managerPhone}</a>}
                        </div>
                    )}

                    {/* 내가 올린 글: 누가 신청했는지 · 승인/거절 · (티타임 뒤) 노쇼 표시. */}
                    {kind === "mine" && <JoinApplicants bookingId={item.id} enabled />}

                    <div className="flex items-center gap-1.5 flex-wrap">
                        <button type="button" onClick={onGo} className={PILL}>글 보기</button>
                        {canChat && <button type="button" onClick={onChat} className={PILL}>채팅방</button>}
                        {canToJoin && (
                            <button
                                type="button" onClick={onToJoin}
                                className="h-9 px-3.5 rounded-full border border-[#FF6B00]/35 bg-[#FF6B00]/10 text-[12.5px] font-medium text-[#FF8A33] inline-flex items-center shrink-0 active:bg-[#FF6B00]/20"
                            >조인으로 전환</button>
                        )}
                        {kind === "mine" && <button type="button" onClick={onDelete} className={PILL_OUTLINE}>내리기</button>}
                        {kind === "applied" && !past && (item.myJoinStatus === "applied" || item.myJoinStatus === "accepted") && (
                            <button type="button" onClick={onCancel} className={PILL_OUTLINE}>신청 취소</button>
                        )}
                    </div>
                </div>
            )}
        </li>
    );
}

const KIND_LABEL: Record<Kind, string> = { booking: "부킹", join: "조인" };

export default function GolfMyBookings() {
    const [, setLocation] = useLocation();
    const search = useSearch();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { member } = useAuth();

    // ── 주소: ?tab=booking|join|watch & role=mine|applied ─────────────────
    // 옛 주소 ?tab=mine|applied(나가 있는 알림·하단 내비의 빨간 점)는 역할 칩으로 받는다 — 종류는 아래에서 고른다.
    const params = new URLSearchParams(search);
    const tabParam = params.get("tab");
    const roleParam = params.get("role");
    const explicitTab: PageTab | null = tabParam === "booking" || tabParam === "join" || tabParam === "watch" ? tabParam : null;
    const role: RoleFilter = roleParam === "mine" || roleParam === "applied" ? roleParam
        : tabParam === "mine" || tabParam === "applied" ? tabParam : "all";

    const mine = useQuery<any[]>({
        queryKey: MY_LISTINGS_QUERY_KEY,
        queryFn: () => apiRequest("/api/hiq/golf/bookings?mine=1"),
        enabled: !!member,
        staleTime: 10_000,
        refetchInterval: explicitTab !== "watch" ? 15_000 : false,
    });
    const applied = useQuery<any[]>({
        queryKey: MY_REQUESTS_QUERY_KEY,
        queryFn: () => apiRequest("/api/hiq/golf/bookings?applied=1"),
        enabled: !!member,
        staleTime: 10_000,
        refetchInterval: explicitTab !== "watch" ? 15_000 : false,
    });
    const watches = useMyWatches(!!member);
    const loaded = mine.isSuccess && applied.isSuccess;

    // 30초마다 시각을 새로 잡는다 — 응답이 같으면(구조 공유) data 참조가 그대로라 분류가 처음 계산한 시각에 얼어붙는다.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(id);
    }, []);

    /** 두 목록을 한 줄로 — 역할은 카드의 꼬리표가 된다. 내 글에 내가 신청할 수는 없어 겹치지 않는다. */
    const items: Item[] = useMemo(() => [
        ...(mine.data ?? []).map((r) => ({ ...r, role: "mine" as const })),
        ...(applied.data ?? []).map((r) => ({ ...r, role: "applied" as const })),
    ].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()), [mine.data, applied.data]);

    // **시각** 기준 — 날짜로만 가르면 오늘 이미 지난 티타임이 '다가오는'에 남아 취소 단추가 뜨는데, 서버는 시각으로 막는다(400).
    const isUpcoming = useCallback((it: Item) => new Date(it.datetime).getTime() > now, [now]);
    /**
     * 끝난 것 — 티타임이 지났거나, **거절된 신청**(재신청이 막힌 최종 상태라 할 일이 없다 — 다가오는 칸 위를 차지하면 안 된다).
     * '안 옴'은 티타임 뒤에만 찍히므로 시각으로 이미 걸러진다.
     */
    const isEnded = useCallback((it: Item) => !isUpcoming(it) || (it.role === "applied" && it.myJoinStatus === "rejected"), [isUpcoming]);
    /** 할 일 — 내 글에 승인을 기다리는 신청. 이 화면에서 **내가 움직여야** 끝나는 것. */
    const isTodo = useCallback((it: Item) => it.role === "mine" && isUpcoming(it) && Number(it.joinPending ?? 0) > 0, [isUpcoming]);

    // ── 안 본 소식(내 신청이 확정·거절됨) ─────────────────────────────────
    // 저장소의 '봤다' 시각은 하단 내비 '내 예약' 빨간 점과 같은 것을 쓴다(lib/myListings).
    // 이번 방문에서 그을 '새 소식' 점은 **들어올 때의 시각**으로 고정한다 — 보자마자 봤다고 적어도 점은 이번 방문 동안 남는다.
    const [seenAt, setSeenAt] = useState(readRequestsSeen);
    const visitSeenAt = useRef(seenAt).current;
    const isFresh = useCallback((it: Item) => it.role === "applied"
        && (it.myJoinStatus === "accepted" || it.myJoinStatus === "rejected")
        && new Date(it.changedAt ?? 0).getTime() > visitSeenAt, [visitSeenAt]);
    const unseenKinds = useMemo(() => {
        const s = new Set<Kind>();
        for (const it of items) if (it.role === "applied" && hasUnseenRequestChange([it], seenAt)) s.add(kindOf(it));
        return s;
    }, [items, seenAt]);

    // ── 어느 탭을 여나 ────────────────────────────────────────────────
    // 주소에 종류가 없으면(하단 내비·옛 알림) 한 번만 고르고 **고정**한다 — 15초 폴링마다 탭이 저절로 넘어가면 안 된다.
    // 순서: 안 본 소식이 있는 종류 → 할 일이 있는 종류 → 다음 라운드의 종류 → 글이 있는 종류 → 부킹.
    const [autoTab, setAutoTab] = useState<Kind | null>(null);
    useEffect(() => {
        if (explicitTab || autoTab || !loaded) return;
        const pool = items.filter((it) => role === "all" || it.role === role);
        const pick = (pred: (it: Item) => boolean) => pool.find(pred);
        const hit = (role !== "mine" && [...unseenKinds][0])
            || (pick(isTodo) && kindOf(pick(isTodo)!))
            || (pick((it) => isUpcoming(it) && isMyRound(it)) && kindOf(pick((it) => isUpcoming(it) && isMyRound(it))!))
            || (pick(isUpcoming) && kindOf(pick(isUpcoming)!))
            || (pool[0] && kindOf(pool[0]))
            || "booking";
        setAutoTab(hit as Kind);
    }, [explicitTab, autoTab, loaded, items, role, unseenKinds, isTodo, isUpcoming]);
    const pageTab: PageTab = explicitTab ?? autoTab ?? "booking";
    const kind: Kind | null = pageTab === "watch" ? null : pageTab;

    const go = useCallback((next: { tab?: PageTab; role?: RoleFilter }) => {
        const t = next.tab ?? pageTab, r = next.role ?? role;
        setLocation(`/golf/my-bookings?tab=${t}${t !== "watch" && r !== "all" ? `&role=${r}` : ""}`, { replace: true });
    }, [pageTab, role, setLocation]);

    // 보고 있는 종류가 안 본 소식을 **전부** 담고 있을 때만 '봤다'로 적는다 — 조인 탭을 봤다고 부킹 탭의 새 소식 점까지 지우면 안 된다.
    useEffect(() => {
        if (!kind || role === "mine" || !loaded || unseenKinds.size === 0) return;
        if ([...unseenKinds].every((k) => k === kind)) { markRequestsSeen(); setSeenAt(readRequestsSeen()); }
    }, [kind, role, loaded, unseenKinds]);

    // ── 지금 탭의 목록 ────────────────────────────────────────────────
    const inKind = useMemo(() => (kind ? items.filter((it) => kindOf(it) === kind) : []), [items, kind]);
    const roleCount = useMemo(() => ({
        all: inKind.length,
        mine: inKind.filter((it) => it.role === "mine").length,
        applied: inKind.filter((it) => it.role === "applied").length,
    }), [inKind]);
    const { todo, upcoming, past } = useMemo(() => {
        const rows = inKind.filter((it) => role === "all" || it.role === role);
        return {
            todo: rows.filter(isTodo),
            upcoming: rows.filter((it) => !isEnded(it) && !isTodo(it)),
            past: rows.filter(isEnded).reverse(),
        };
    }, [inKind, role, isTodo, isEnded]);

    /** 다음 라운드 — 종류·역할 칩과 상관없이 전체에서 하나. */
    const nextRound = useMemo(() => items.find((it) => isUpcoming(it) && isMyRound(it)) ?? null, [items, isUpcoming]);

    /** 탭 옆 숫자·점 — 다가오는 것만 센다(지난 글까지 세면 숫자가 계속 불어난다). */
    const tabInfo = useMemo(() => {
        const info: Record<Kind, { n: number; dot: boolean }> = { booking: { n: 0, dot: false }, join: { n: 0, dot: false } };
        for (const it of items) {
            const k = kindOf(it);
            if (!isEnded(it)) info[k].n += 1;
            if (isTodo(it)) info[k].dot = true;
        }
        for (const k of unseenKinds) info[k].dot = true;
        return info;
    }, [items, isEnded, isTodo, unseenKinds]);

    /**
     * 펼친 줄 하나. 한 번에 하나만 여는 이유는 신청자 명단(JoinApplicants)이 8초마다 폴링하기 때문이다 —
     * 전부 펼쳐 두면 글 수만큼 요청이 나간다. 기본값은 **할 일 첫 줄, 없으면 다가오는 첫 줄**.
     */
    const [openId, setOpenId] = useState<string | null>(null);
    const [autoOpened, setAutoOpened] = useState<string | null>(null);
    const viewKey = `${pageTab}:${role}`;
    const [showPast, setShowPast] = useState(false);
    useEffect(() => { setShowPast(false); }, [viewKey]);
    useEffect(() => {
        if (autoOpened === viewKey || !loaded) return;
        const first = todo[0] ?? upcoming[0];
        if (!first) return;
        setAutoOpened(viewKey);
        setOpenId(first.id);
    }, [viewKey, autoOpened, loaded, todo, upcoming]);

    const deleteMutation = useMutation({
        mutationFn: (id: string) => apiRequest(`/api/hiq/golf/bookings/${id}`, { method: "DELETE" }),
        onSuccess: () => {
            toast({ title: "내렸어요" });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings"] }); // mine·applied·신청자 명단을 접두로 함께
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/joins"] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings/counts"] });
        },
        onError: (e: any) => toast({ title: e?.message || "내리지 못했어요", variant: "destructive" }),
    });
    const cancelMutation = useMutation({
        mutationFn: (id: string) => apiRequest(`/api/hiq/golf/bookings/${id}/apply`, { method: "DELETE" }),
        onSuccess: () => {
            toast({ title: "신청을 취소했어요" });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings"] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/joins"] });
        },
        onError: (e: any) => toast({ title: e?.message || "취소하지 못했어요", variant: "destructive" }),
    });

    /** 부킹 → 조인 전환. 페이지 위의 시트 하나(시트 안 시트였던 포커스 덫이 없다). */
    const [toJoinItem, setToJoinItem] = useState<any | null>(null);

    /** '글 보기' — 딥링크 주소로 보낸다. 목록이 id 로 날짜를 되짚어 그 카드를 펼친다(BookingList useDeepLink). */
    const goToListing = useCallback((item: any) => {
        setLocation(`/golf/booking-list/${item.id}?view=${item.listingType === "JOIN" ? "JOIN" : "BOOKING"}`);
    }, [setLocation]);

    /** 다음 라운드의 '자세히' — 그 종류 탭(역할 칩은 전체)으로 옮겨 그 줄을 펼치고 보이게 한다. */
    const [scrollTo, setScrollTo] = useState<string | null>(null);
    const showRow = useCallback((it: Item) => {
        go({ tab: kindOf(it), role: "all" });
        setAutoOpened(`${kindOf(it)}:all`);
        setOpenId(it.id);
        setScrollTo(it.id);
    }, [go]);
    useEffect(() => {
        if (!scrollTo) return;
        const el = document.getElementById(`row-${scrollTo}`);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setScrollTo(null);
    });

    // past 는 **시각**으로만 — 거절된 신청은 '끝난' 칸에 있어도 티타임이 아직이면 "지난 티타임이에요"라고 적으면 안 된다.
    const render = (rows: Item[]) => rows.map((it) => (
        <Row
            key={it.id} item={it} past={!isUpcoming(it)}
            open={openId === it.id}
            fresh={isFresh(it)}
            onToggle={() => setOpenId((prev) => (prev === it.id ? null : it.id))}
            onGo={() => goToListing(it)}
            onChat={() => setLocation(`/chat/listing/${it.id}`)}
            onToJoin={() => setToJoinItem(it)}
            onDelete={() => { if (window.confirm("이 글을 내릴까요? 되돌릴 수 없어요.")) deleteMutation.mutate(it.id); }}
            onCancel={() => { if (window.confirm("신청을 취소할까요?")) cancelMutation.mutate(it.id); }}
        />
    ));

    const q = mine.isError || applied.isError ? "error" : !loaded ? "loading" : "ok";
    const watchN = watches.data?.length ?? 0;

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white pb-nav font-sans selection:bg-[#64DD17]/30">
            <div className="sticky top-0 z-40 bg-[#0A0A0A]/90 backdrop-blur-2xl border-b border-white/5">
                <div className="px-5 h-16 flex items-center gap-2.5">
                    {/* 알림을 눌러 앱이 **막 켜진** 경우엔 돌아갈 데가 없다 — 그냥 back() 하면 앱 밖으로 나간다. */}
                    <GolfBackButton onClick={() => (window.history.length > 1 ? window.history.back() : setLocation("/golf/booking-list"))} />
                    <h1 className="text-[17px] font-semibold text-white leading-tight">내 예약</h1>
                </div>
                <div className="px-5 pb-3">
                    <div className="flex rounded-full bg-white/[0.05] border border-white/[0.08] p-0.5" role="tablist">
                        {(["booking", "join", "watch"] as const).map((k) => {
                            const n = k === "watch" ? watchN : tabInfo[k].n;
                            const dot = k !== "watch" && tabInfo[k].dot;
                            return (
                                <button
                                    key={k} type="button" role="tab" aria-selected={pageTab === k} onClick={() => go({ tab: k })}
                                    className={cn(
                                        "relative flex-1 h-9 rounded-full text-[13px] font-medium transition-colors tabular-nums",
                                        // ⚠️ 고른 탭에 `bg-white text-black` 을 쓰면 안 된다 — 골프 테마가 .bg-white 만 어두운 면으로 되받는다.
                                        // 조인 탭은 고르면 주황 바탕(2026-09-24 오너: "배경색을 조인에 주황 칼라로") — 조인 배지·대기 칩과 같은 #FF6B00.
                                        pageTab === k
                                            ? k === "join" ? "bg-[#FF6B00] text-[#0a0a0a] font-semibold" : "bg-[#ffffff] text-[#0a0a0a] font-semibold"
                                            : "text-white/70 active:text-white",
                                    )}
                                >
                                    {k === "watch" ? "관심" : KIND_LABEL[k]}
                                    {n > 0 && <span className={cn("ml-1", pageTab === k ? "text-[#0a0a0a]/50" : "text-white/40")}>{n}</span>}
                                    {dot && <span className="absolute top-1.5 right-3 w-1.5 h-1.5 rounded-full bg-red-500" aria-label="확인할 것 있음" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="px-5 pt-4 pb-8 space-y-5">
                {/* 다음 라운드 — 탭과 상관없이 맨 위. 관심 탭에서는 뺀다(골프장 목록이 주인공). */}
                {member && pageTab !== "watch" && nextRound && (
                    <NextRound item={nextRound} now={now} onDetail={() => showRow(nextRound)} onChat={() => setLocation(`/chat/listing/${nextRound.id}`)} />
                )}

                {pageTab === "watch" ? (
                    <WatchedCourses enabled={!!member} />
                ) : !member ? (
                    <p className="py-6 text-[13px] text-white/40">로그인하면 내가 올린 부킹·조인과 신청한 내역을 볼 수 있어요.</p>
                ) : q === "loading" ? (
                    <div className="flex items-center gap-2 py-6 text-white/40"><LucideLoader2 className="w-4 h-4 animate-spin" /><span className="text-[13px]">불러오는 중…</span></div>
                ) : q === "error" ? (
                    <p className="py-6 text-[13px] text-white/40">불러오지 못했어요.</p>
                ) : (
                    <>
                        {/* 역할 칩 — 필요할 때만 좁힌다. 기본은 전체(꼬리표로 이미 구별된다).
                            한쪽 역할만 있으면 좁힐 게 없다 — '내가 신청한 0' 칩은 누를 이유가 없는 단추다. 주소로 좁혀 들어온 경우엔 돌아갈 길로 남긴다. */}
                        {((roleCount.mine > 0 && roleCount.applied > 0) || role !== "all") && (
                            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-5 px-5">
                                {([["all", "전체"], ["mine", "내가 올린"], ["applied", "내가 신청한"]] as const).map(([r, label]) => (
                                    <button
                                        key={r} type="button" onClick={() => go({ role: r })} aria-pressed={role === r}
                                        className={cn(
                                            "h-8 px-3 rounded-full text-[13px] whitespace-nowrap shrink-0 transition-colors tabular-nums",
                                            role === r ? "bg-[#ffffff] text-[#0a0a0a] font-semibold" : "bg-white/[0.06] text-white/70 font-medium active:bg-white/10",
                                        )}
                                    >
                                        {label} <span className={role === r ? "text-[#0a0a0a]/50" : "text-white/40"}>{roleCount[r]}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {todo.length + upcoming.length + past.length === 0 ? (
                            <div className="py-8 space-y-4">
                                <p className="text-[13px] text-white/40 leading-relaxed">
                                    {role === "mine" ? `아직 올린 ${KIND_LABEL[kind!]}이 없어요.`
                                        : role === "applied" ? `아직 신청한 ${KIND_LABEL[kind!]}이 없어요.`
                                        : `아직 ${KIND_LABEL[kind!]} 내역이 없어요.`}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setLocation(`/golf/booking-list?view=${kind === "join" ? "JOIN" : "BOOKING"}`)}
                                    className="h-11 px-5 rounded-full bg-[#64DD17] text-[#051907] text-[13.5px] font-semibold"
                                >{kind === "join" ? "조인 찾아보기" : "부킹 찾아보기"}</button>
                            </div>
                        ) : (
                            <>
                                {todo.length > 0 && (
                                    <section className="space-y-2">
                                        <h2 className="text-[12px] font-medium text-[#FF8A33]">할 일 {todo.length}</h2>
                                        <ul className="space-y-2">{render(todo)}</ul>
                                    </section>
                                )}
                                {upcoming.length > 0 && (
                                    <section className="space-y-2">
                                        <h2 className="text-[12px] font-medium text-white/50">다가오는 {upcoming.length}</h2>
                                        <ul className="space-y-2">{render(upcoming)}</ul>
                                    </section>
                                )}
                                {past.length > 0 && (
                                    <section className="space-y-2">
                                        {/* 지난 것은 접어 둔다 — 여기 온 사람이 보러 온 건 다음 라운드다. 다가오는 게 없으면 펼쳐서 보여 준다. */}
                                        {showPast || todo.length + upcoming.length === 0 ? (
                                            <>
                                                <h2 className="text-[12px] font-medium text-white/50">지난·끝난 {past.length}</h2>
                                                <ul className="space-y-2">{render(past)}</ul>
                                            </>
                                        ) : (
                                            <button type="button" onClick={() => setShowPast(true)} className="w-full h-11 rounded-2xl border border-white/[0.08] text-[13px] text-white/55 inline-flex items-center justify-center gap-1 active:bg-white/[0.04]">
                                                지난·끝난 {past.length}개 보기<LucideChevronDown className="w-4 h-4" />
                                            </button>
                                        )}
                                    </section>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>

            {/* 부킹 → 조인 전환. 끝나면 그 글로 옮겨 간다 — 방금 바꾼 글이 어떻게 보이는지가 다음에 궁금한 것이다. */}
            <ToJoinSheet
                item={toJoinItem}
                onClose={() => setToJoinItem(null)}
                onConverted={(converted) => goToListing(converted ?? { ...toJoinItem, listingType: "JOIN" })}
            />

            <HiqNavigation />
        </div>
    );
}
