import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    LucideX, LucideBell, LucideTrash2, LucideCheck, LucideMoreVertical,
    LucideMessageCircle, LucideUsers, LucideTarget, LucideMegaphone,
} from "@/lib/icons";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useT, type Locale } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useSport } from "@/contexts/SportContext";
import { INTL_TAG } from "@/components/hiq/chat/ChatRoom";
import { NOTIF_GROUPS, notifGroup, type NotifGroup } from "@shared/notificationGroup";

/* ────────────────────────────────────────────────────────────────────────────
 * 알림함(2026-09-23 재작성). 왜 이 모양인가:
 *  - 옛 화면은 목록 전량을 받아 한 번에 그렸다. 오너 계정은 893행 330KB → 여는 데 57ms.
 *    이제 **서버가 묶음으로 걸러 30건씩** 준다(커서 페이징, 맨 아래 "더 보기").
 *  - 옛 행은 framer-motion `layout` 을 달고 있었다. 재렌더 비용의 절반이 그거였다 →
 *    **행에서 motion 을 완전히 뺐다**. 패널 자체의 슬라이드만 남긴다.
 *  - 읽음·삭제가 `invalidateQueries(["/api/hiq/notifications"])` 로 캐시 키 3개를
 *    앞자리 매칭으로 한꺼번에 날려 목록을 세 번 다시 받았다("누를 때가 열 때보다 느린" 이유).
 *    이제 **setQueryData 로 화면에서 먼저** 바꾸고, 실패하면 되돌린다.
 * ──────────────────────────────────────────────────────────────────────────── */

const LIMIT = 30;
const LIST_KEY_ROOT = "/api/hiq/notifications";
/** 목록과 **다른 앞자리**여야 한다 — 같으면 목록 무효화에 배지까지 딸려간다. */
export const UNREAD_COUNT_KEY = "/api/hiq/notifications/unread-count";

interface NotifItem {
    id: string;
    type: string | null;
    title: string;
    body: string;
    params: unknown;
    isRead: boolean;
    createdAt: string;
}
interface ListPage { items: NotifItem[]; nextBefore: string | null }
interface UnreadCount { unread: number; byGroup: Record<NotifGroup, number> }

type ChipKey = "all" | NotifGroup;
const CHIPS: readonly ChipKey[] = ["all", ...NOTIF_GROUPS];

const GROUP_ICON: Record<NotifGroup, typeof LucideBell> = {
    turn: LucideTarget,
    chat: LucideMessageCircle,
    crew: LucideUsers,
    notice: LucideMegaphone,
};

/* ── 시각 표기 ───────────────────────────────────────────────────────────────
 * 예전엔 date-fns 의 `locale: ko` 가 하드코딩돼 있어 스페인·터키·베트남 사용자에게
 * 한국어가 그대로 보였다. Intl 에 앱 언어를 넘긴다. 표시 시간대는 앱 관례대로 KST 고정.
 */
const KST = "Asia/Seoul";
/** KST 기준 '며칠째'인가 — 어제/오늘을 가르는 데만 쓴다. */
const kstDay = (ms: number) => Math.floor((ms + 9 * 3_600_000) / 86_400_000);

function timeLabel(iso: string, locale: Locale, yesterdayWord: string): string {
    const then = new Date(iso);
    const ms = then.getTime();
    if (!Number.isFinite(ms)) return "";
    const tag = INTL_TAG[locale];
    const now = Date.now();
    const diff = now - ms;

    // 24시간 안 → 상대시간. 시계가 앞선 행(음수)도 "방금"으로 본다.
    if (diff < 86_400_000) {
        const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
        const d = Math.max(diff, 0);
        if (d < 60_000) return rtf.format(-Math.max(Math.floor(d / 1000), 1), "second");
        if (d < 3_600_000) return rtf.format(-Math.floor(d / 60_000), "minute");
        return rtf.format(-Math.floor(d / 3_600_000), "hour");
    }
    // 어제 → "어제 오후 3:12"
    if (kstDay(now) - kstDay(ms) === 1) {
        const hm = new Intl.DateTimeFormat(tag, { hour: "numeric", minute: "2-digit", timeZone: KST }).format(then);
        return `${yesterdayWord} ${hm}`;
    }
    // 그 전 → "9월 20일"
    return new Intl.DateTimeFormat(tag, { month: "long", day: "numeric", timeZone: KST }).format(then);
}

/** 서버가 아직 옛 모양(배열)을 줄 수도 있다 — 배포가 화면·서버 따로 나간다. */
function asPage(res: unknown): ListPage {
    if (Array.isArray(res)) return { items: res as NotifItem[], nextBefore: null };
    const p = res as Partial<ListPage> | null;
    return { items: Array.isArray(p?.items) ? p!.items! : [], nextBefore: p?.nextBefore ?? null };
}

const ZERO_BY_GROUP: Record<NotifGroup, number> = { turn: 0, chat: 0, crew: 0, notice: 0 };

interface NotificationInboxProps {
    open: boolean;
    onClose: () => void;
}

export function NotificationInbox({ open, onClose }: NotificationInboxProps) {
    const { t, locale } = useT();
    const [, setLocation] = useLocation();
    const queryClient = useQueryClient();
    const { currentSport } = useSport();
    const { toast } = useToast();

    const [chip, setChip] = useState<ChipKey>("all");
    const [menuId, setMenuId] = useState<string | null>(null);

    // 패널을 닫으면 칩·열린 메뉴를 처음으로 — 다음에 열 때 지난 선택이 남아 있으면 "알림이 없다"로 보인다.
    useEffect(() => { if (!open) { setChip("all"); setMenuId(null); } }, [open]);

    const listKey = useMemo(
        () => [LIST_KEY_ROOT, { sport: currentSport, group: chip }] as const,
        [currentSport, chip],
    );

    const list = useInfiniteQuery<ListPage>({
        queryKey: listKey,
        enabled: open,
        // 푸시를 받고 바로 열어도 그 알림이 있어야 한다 — 전역 5분 캐시를 그대로 쓰면 없다.
        staleTime: 0,
        refetchOnMount: "always",
        initialPageParam: null as string | null,
        getNextPageParam: (last) => last.nextBefore ?? undefined,
        queryFn: async ({ pageParam, signal }) => {
            const qs = new URLSearchParams({ sport: currentSport, limit: String(LIMIT) });
            if (chip !== "all") qs.set("group", chip);
            if (pageParam) qs.set("before", String(pageParam));
            return asPage(await apiRequest(`${LIST_KEY_ROOT}?${qs.toString()}`, { signal }));
        },
    });

    // 배지 숫자는 목록에서 세지 않는다 — 목록은 30건뿐이고, 칩마다 다시 받는다.
    const { data: counts } = useQuery<UnreadCount>({
        queryKey: [UNREAD_COUNT_KEY, { sport: currentSport }],
        enabled: open,
        staleTime: 0,
        refetchOnMount: "always",
    });
    const unreadTotal = counts?.unread ?? 0;
    const byGroup = counts?.byGroup ?? ZERO_BY_GROUP;

    const items = useMemo(
        () => (list.data?.pages ?? []).flatMap((p) => p.items),
        [list.data],
    );

    /* ── 낙관적 갱신 ────────────────────────────────────────────────────────
     * 목록 재조회를 하지 않는다. 지금 화면(그리고 다른 칩의 캐시)을 바로 고치고,
     * 실패하면 찍어둔 스냅샷으로 통째로 되돌린다.
     */
    const snapshot = useCallback(() => {
        const lists = queryClient.getQueriesData({ queryKey: [LIST_KEY_ROOT] });
        const count = queryClient.getQueriesData({ queryKey: [UNREAD_COUNT_KEY] });
        return () => {
            for (const [k, v] of [...lists, ...count]) queryClient.setQueryData(k, v);
        };
    }, [queryClient]);

    /**
     * **지금 종목만** 고른다. 종목을 안 가리면 당구에서 하나 읽었을 때 골프 배지까지 내려간다 —
     * 옛 read-all 이 종목을 무시해 생긴 버그와 같은 종류다.
     */
    const ofThisSport = useCallback(
        (root: string) => (q: { queryKey: readonly unknown[] }) =>
            q.queryKey[0] === root && (q.queryKey[1] as { sport?: string } | undefined)?.sport === currentSport,
        [currentSport],
    );

    /** 열려 있는 모든 칩의 목록 캐시에 같은 변형을 먹인다(칩을 바꿔도 어긋나지 않게). */
    const patchLists = useCallback((fn: (items: NotifItem[]) => NotifItem[]) => {
        queryClient.setQueriesData<{ pages: ListPage[]; pageParams: unknown[] }>(
            { predicate: ofThisSport(LIST_KEY_ROOT) },
            (old) => old ? { ...old, pages: old.pages.map((p) => ({ ...p, items: fn(p.items) })) } : old,
        );
    }, [queryClient, ofThisSport]);

    const bumpCount = useCallback((group: NotifGroup | "*", delta: number) => {
        queryClient.setQueriesData<UnreadCount>({ predicate: ofThisSport(UNREAD_COUNT_KEY) }, (old) => {
            if (!old) return old;
            if (group === "*") return { unread: 0, byGroup: { ...ZERO_BY_GROUP } };
            const at = Math.max((old.byGroup?.[group] ?? 0) + delta, 0);
            return {
                unread: Math.max(old.unread + delta, 0),
                byGroup: { ...ZERO_BY_GROUP, ...old.byGroup, [group]: at },
            };
        });
    }, [queryClient, ofThisSport]);

    const failed = useCallback((rollback: () => void) => {
        rollback();
        // 기존 공용 문구를 빌려 쓴다("오류가 발생했습니다.", 5개 언어 모두 있음) —
        // 이번 작업에서 i18n 파일은 다른 에이전트 몫이라 새 키를 넣지 않는다.
        toast({ title: t("notificationInbox.actionFailed"), variant: "destructive" });
    }, [toast, t]);

    const markRead = useCallback((n: NotifItem) => {
        if (n.isRead) return;
        const rollback = snapshot();
        patchLists((rows) => rows.map((r) => (r.id === n.id ? { ...r, isRead: true } : r)));
        bumpCount(notifGroup(n.type, n.params), -1);
        apiRequest(`${LIST_KEY_ROOT}/${n.id}/read`, { method: "PATCH" }).catch(() => failed(rollback));
    }, [snapshot, patchLists, bumpCount, failed]);

    const removeOne = useCallback((n: NotifItem) => {
        const rollback = snapshot();
        patchLists((rows) => rows.filter((r) => r.id !== n.id));
        if (!n.isRead) bumpCount(notifGroup(n.type, n.params), -1);
        apiRequest(`${LIST_KEY_ROOT}/${n.id}`, { method: "DELETE" }).catch(() => failed(rollback));
    }, [snapshot, patchLists, bumpCount, failed]);

    const readAll = useCallback(() => {
        const rollback = snapshot();
        patchLists((rows) => rows.map((r) => (r.isRead ? r : { ...r, isRead: true })));
        bumpCount("*", 0);
        // 종목을 붙인다 — 예전엔 서버가 종목을 무시해 당구에서 눌러도 골프까지 읽혔다.
        apiRequest(`${LIST_KEY_ROOT}/read-all?sport=${currentSport}`, { method: "PATCH" })
            .catch(() => failed(rollback));
    }, [snapshot, patchLists, bumpCount, failed, currentSport]);

    const handleItemClick = (notif: NotifItem) => {
        setMenuId(null);
        markRead(notif);

        // Deep linking — 알림 params 는 {url} 과 {crewId, tab} 두 형태가 섞여 있다.
        const p = notif.params as Record<string, any> | null;
        const url = typeof p?.url === "string" ? p.url : "";
        // 앱 내부 경로만 허용 — '//host' 는 외부로 튕겨나간다.
        if (url.startsWith("/") && !url.startsWith("//")) {
            setLocation(url);
            onClose();
            return;
        }
        if (p?.crewId) {
            const tab = typeof p.tab === "string" ? p.tab.toLowerCase() : "";
            setLocation(`/club/${p.crewId}${tab ? `?tab=${tab}` : ""}`);
            onClose();
            return;
        }
        // 목적지 페이지가 없는 알림(공지 등)은 읽음 처리만 하고 이동하지 않는다.
    };

    // body 로 포털 — 헤더(relative z-10)의 층 안에서 그리면 z-[101] 이 그 층 안에서만 유효해
    // 홈의 카드(transform 층)가 알림함 위로 비쳐 "투명"해 보였다(2026-09-21 골프 헤더).
    return createPortal(
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 z-[100]"
                    />
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        // 바탕은 surface-0(종목별 불투명 면). 카드가 surface-1 이라 두 면이 갈린다 —
                        // 예전처럼 바탕과 카드가 둘 다 흰색이면 카드 테두리가 사라진다.
                        className="fixed top-0 right-0 bottom-0 w-full max-w-[400px] bg-surface-0 border-l border-surface-line z-[101] shadow-[0_0_40px_rgba(0,0,0,0.18)] flex flex-col text-ink-1"
                    >
                        {/* Header */}
                        <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                                <h2 className="text-[17px] font-bold text-ink-1 leading-tight">{t("notificationInbox.title")}</h2>
                                <p className="text-[11.5px] text-ink-3 mt-0.5 truncate">{t("notificationInbox.subtitle")}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                {/* 안 읽은 게 있을 때만 — 없으면 눌러도 아무 일이 없어 버튼이 거짓말이 된다 */}
                                {unreadTotal > 0 && (
                                    <button
                                        onClick={readAll}
                                        className="h-8 px-2.5 rounded-pill text-[12px] font-semibold text-brand hover:bg-brand/[0.08] transition-colors"
                                    >
                                        {t("notificationInbox.readAll")}
                                    </button>
                                )}
                                <button
                                    onClick={onClose}
                                    title={t("notificationInbox.close")}
                                    className="w-9 h-9 rounded-full hover:bg-surface-3 flex items-center justify-center transition-colors"
                                >
                                    <LucideX className="w-[18px] h-[18px] text-ink-3" weight="regular" />
                                </button>
                            </div>
                        </div>

                        {/* 묶음 칩 — 누르면 서버에 group 을 넘겨 다시 받는다(받아놓고 화면에서 거르지 않는다) */}
                        <div className="px-4 pb-2.5 flex gap-1.5 overflow-x-auto scrollbar-hide shrink-0">
                            {CHIPS.map((key) => {
                                const active = chip === key;
                                const n = key === "all" ? unreadTotal : (byGroup[key] ?? 0);
                                return (
                                    <button
                                        key={key}
                                        onClick={() => { setChip(key); setMenuId(null); }}
                                        className={cn(
                                            "shrink-0 h-8 px-3 rounded-pill text-[12.5px] font-semibold transition-colors whitespace-nowrap",
                                            active ? "bg-brand text-brand-fg" : "bg-surface-2 text-ink-2 border border-surface-line",
                                        )}
                                    >
                                        {t(`notificationInbox.group.${key}`)}
                                        {n > 0 && (
                                            <span className={cn("ml-1 tabular-nums", active ? "text-brand-fg/80" : "text-brand")}>
                                                {n > 99 ? "99+" : n}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto px-4 pb-8 pt-1 space-y-2 custom-scrollbar">
                            {list.isLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 text-ink-4">
                                    <div className="w-8 h-8 rounded-full border-2 border-surface-line border-t-brand animate-spin mb-4" />
                                    <p className="text-sm">{t("notificationInbox.loading")}</p>
                                </div>
                            ) : items.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-ink-4">
                                    <LucideBell className="w-12 h-12 mb-4" weight="light" />
                                    <p className="text-sm">{t("notificationInbox.empty")}</p>
                                </div>
                            ) : (
                                items.map((notif) => {
                                    const g = notifGroup(notif.type, notif.params);
                                    const Icon = GROUP_ICON[g];
                                    const openMenu = menuId === notif.id;
                                    return (
                                        <div key={notif.id} className="relative rounded-2xl bg-surface-1 border border-surface-line">
                                            <button
                                                type="button"
                                                onClick={() => handleItemClick(notif)}
                                                className="w-full text-left flex items-start gap-2.5 px-3.5 py-3 active:opacity-70 transition-opacity"
                                            >
                                                <span className="relative shrink-0 w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center mt-[1px]">
                                                    <Icon className="w-[15px] h-[15px] text-ink-2" weight="light" />
                                                    {/* 안 읽음은 이 점 하나로. 배경색을 바꾸면 골프 어두운 테마에서 안 보인다. */}
                                                    {!notif.isRead && (
                                                        <span className="absolute -top-px -right-px w-2 h-2 rounded-full bg-brand ring-2 ring-surface-1" />
                                                    )}
                                                </span>
                                                <span className="min-w-0 flex-1 pr-6">
                                                    <span className="block text-[12px] text-ink-3 truncate">
                                                        {t(`notificationInbox.group.${g}`)} · {timeLabel(notif.createdAt, locale, t("notificationInbox.yesterday"))}
                                                    </span>
                                                    <span className="block text-[14px] font-semibold text-ink-1 leading-snug mt-0.5 truncate">
                                                        {notif.title}
                                                    </span>
                                                    {notif.body && (
                                                        <span className="block text-[12.5px] text-ink-3 leading-snug mt-0.5 line-clamp-2">
                                                            {notif.body}
                                                        </span>
                                                    )}
                                                </span>
                                            </button>

                                            <button
                                                type="button"
                                                aria-label={t("notificationInbox.menu")}
                                                onClick={(e) => { e.stopPropagation(); setMenuId(openMenu ? null : notif.id); }}
                                                className="absolute top-2 right-1.5 w-7 h-7 rounded-full flex items-center justify-center hover:bg-surface-3 transition-colors"
                                            >
                                                <LucideMoreVertical className="w-4 h-4 text-ink-3" weight="bold" />
                                            </button>

                                            {openMenu && (
                                                <>
                                                    {/* 바깥을 누르면 닫힌다. 한 번에 한 카드만 열린다(menuId 하나). */}
                                                    <div className="fixed inset-0 z-[102]" onClick={() => setMenuId(null)} />
                                                    <div className="absolute top-9 right-2 z-[103] min-w-[148px] rounded-xl bg-surface-2 border border-surface-line shadow-[0_10px_28px_rgba(0,0,0,0.22)] py-1 overflow-hidden">
                                                        {!notif.isRead && (
                                                            <button
                                                                type="button"
                                                                onClick={() => { setMenuId(null); markRead(notif); }}
                                                                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-ink-1 hover:bg-surface-3 transition-colors"
                                                            >
                                                                <LucideCheck className="w-4 h-4 text-ink-3" weight="regular" />
                                                                {t("notificationInbox.markRead")}
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => { setMenuId(null); removeOne(notif); }}
                                                            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-500 hover:bg-red-500/10 transition-colors"
                                                        >
                                                            <LucideTrash2 className="w-4 h-4" weight="regular" />
                                                            {t("notificationInbox.delete")}
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })
                            )}

                            {/* 커서 페이징 — 자동 무한스크롤이 아니라 버튼이다(오너 결정) */}
                            {list.hasNextPage && (
                                <button
                                    type="button"
                                    onClick={() => list.fetchNextPage()}
                                    disabled={list.isFetchingNextPage}
                                    className="w-full h-10 mt-1 rounded-2xl bg-surface-2 border border-surface-line text-[13px] font-semibold text-ink-2 hover:bg-surface-3 transition-colors disabled:opacity-50"
                                >
                                    {list.isFetchingNextPage ? t("notificationInbox.loading") : t("notificationInbox.more")}
                                </button>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body,
    );
}
