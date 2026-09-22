/**
 * 대화방 화면(2026-09-21 채팅). 크루 방·조인·부킹 방이 같은 그림을 쓴다 — 메시지 목록 + 입력줄.
 *
 * 빠르게 느껴지는 규칙 셋:
 *  1) 보내면 **즉시** 내 말풍선이 뜬다(낙관적 추가). 서버 응답이 오면 그 행으로 바꿔 끼우고, 실패하면 빨갛게 표시하고 다시 보내기.
 *  2) 폴링은 부르는 쪽이 `after`(마지막 메시지 시각)로 새 것만 받는다 — 여기서는 받은 목록을 그리기만 한다.
 *  3) 새 메시지가 오면 **아래를 보고 있을 때만** 내려간다. 위로 올려 옛 대화를 읽는 중에 끌어내리지 않는다.
 * 날짜가 바뀌면 사이에 날짜 줄, 같은 사람이 1분 안에 이어 보내면 이름·아바타를 생략한다. 시스템 메시지는 가운데 작은 글.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { LucideSend, LucideLoader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT, type Locale } from "@/lib/i18n";

/** 앱 언어 → Intl 태그. 시각·날짜는 사전 키 대신 Intl 로 그 언어답게 그린다(표시 시간대는 KST 고정 — 서버·방 정보와 같은 기준). */
export const INTL_TAG: Record<Locale, string> = { ko: "ko-KR", en: "en-US", es: "es-419", tr: "tr-TR", vi: "vi-VN" };

export interface ChatMsg {
    id: string;
    senderId: string | null;
    message: string;
    type: "text" | "system" | "photo" | "settlement" | string;
    createdAt: string;
    sender?: { name: string; profileImageUrl?: string | null } | null;
    /** 낙관적 추가 상태 */
    pending?: boolean;
    failed?: boolean;
}

interface Props {
    messages: readonly ChatMsg[];
    meId: string | undefined;
    onSend: (text: string) => Promise<void>;
    /** 실패한 메시지 다시 보내기 */
    onRetry?: (msg: ChatMsg) => void;
    /** 길게 눌러 삭제(내 메시지·운영진). canDelete 가 true 인 메시지만 */
    onDelete?: (msg: ChatMsg) => void;
    canDelete?: (msg: ChatMsg) => boolean;
    /** 카드형 메시지(정산·부킹 공유)를 눌렀을 때 */
    onOpenCard?: (msg: ChatMsg) => void;
    /** 맨 위에 고정되는 카드(글 정보·지도) */
    pinned?: ReactNode;
    loading?: boolean;
    disabled?: boolean;
    emptyText?: string;
    /** 새 메시지를 봤다고 알린다(아래를 보고 있을 때) */
    onSeen?: () => void;
    /** 위로 더 읽기(2026-09-22) — 방은 최근 60건으로 열리고, 맨 위에 닿으면 앞 쪽을 더 받는다 */
    hasOlder?: boolean;
    loadingOlder?: boolean;
    onLoadOlder?: () => void;
    /** 방이 바뀌면 다시 맨 아래에서 시작한다 */
    roomKey?: string;
}

/** 카드형: 정산 요청, 골프 부킹 공유(옛 크루 채팅은 type text + metadata.type 으로 구분했다). */
const isCard = (m: ChatMsg) => m.type === "settlement" || (m as any).metadata?.type === "GOLF_BOOKING";

const dayKey = (iso: string) => {
    const d = new Date(new Date(iso).getTime() + 9 * 3_600_000);
    return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
};
// 한국어는 예전 표기 그대로("9월 25일 목요일" · "오전 9:05"), 다른 언어는 Intl 이 그 언어 관례로("Thu, Sep 25" · "9:05 AM").
const dayLabel = (iso: string, locale: Locale) => {
    const d = new Date(new Date(iso).getTime() + 9 * 3_600_000);
    if (locale === "ko") {
        const names = ["일", "월", "화", "수", "목", "금", "토"];
        return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${names[d.getUTCDay()]}요일`;
    }
    return new Intl.DateTimeFormat(INTL_TAG[locale], { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(iso));
};
const timeLabel = (iso: string, locale: Locale) => {
    const d = new Date(new Date(iso).getTime() + 9 * 3_600_000);
    if (locale === "ko") {
        const h = d.getUTCHours(), m = String(d.getUTCMinutes()).padStart(2, "0");
        return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${m}`;
    }
    return new Intl.DateTimeFormat(INTL_TAG[locale], { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(iso));
};

export function ChatRoom({ messages, meId, onSend, onRetry, onDelete, canDelete, onOpenCard, pinned, loading, disabled, emptyText, onSeen, hasOlder, loadingOlder, onLoadOlder, roomKey }: Props) {
    const { t, locale } = useT();
    // 길게 누르기(600ms) → 삭제. 마우스에서는 우클릭도 같다.
    const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const holdStart = (m: ChatMsg) => { if (!onDelete || !canDelete?.(m)) return; holdRef.current = setTimeout(() => { holdRef.current = null; onDelete(m); }, 600); };
    const holdEnd = () => { if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null; } };
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const atBottomRef = useRef(true);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const toBottom = () => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; };
    // 앞에 옛 메시지가 붙으면(위로 더 읽기) 보던 자리를 지킨다: 늘어난 높이만큼 스크롤을 내린다.
    const firstIdRef = useRef<string | undefined>(undefined);
    const prevHeightRef = useRef(0);
    useLayoutEffect(() => {
        const el = listRef.current;
        const firstId = messages[0]?.id;
        const prepended = !!el && !!firstIdRef.current && firstId !== firstIdRef.current && messages.some((m) => m.id === firstIdRef.current);
        if (el && prepended) el.scrollTop += el.scrollHeight - prevHeightRef.current;
        else if (atBottomRef.current) { toBottom(); if (messages.length > 0) onSeen?.(); }
        firstIdRef.current = firstId;
        prevHeightRef.current = el?.scrollHeight ?? 0;
    }, [messages]);
    useEffect(() => { toBottom(); }, [loading]);
    useEffect(() => { atBottomRef.current = true; firstIdRef.current = undefined; }, [roomKey]);

    const send = async () => {
        const v = text.trim();
        if (!v || sending || disabled) return;
        setText("");
        setSending(true);
        atBottomRef.current = true;
        try { await onSend(v); } finally { setSending(false); inputRef.current?.focus(); }
    };

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {pinned && <div className="shrink-0">{pinned}</div>}
            <div
                ref={listRef}
                onScroll={(e) => {
                    const el = e.currentTarget;
                    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                    if (atBottomRef.current) onSeen?.();
                    if (el.scrollTop < 120 && hasOlder && !loadingOlder) onLoadOlder?.();
                }}
                className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-1.5"
            >
                {hasOlder && messages.length > 0 && (
                    <div className="flex justify-center py-2 text-ink-4">{loadingOlder ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : <button type="button" onClick={() => onLoadOlder?.()} className="text-[12px] font-medium text-ink-3 px-3 py-1 rounded-full bg-surface-2">{t("chat.loadOlder")}</button>}</div>
                )}
                {loading && messages.length === 0 && (
                    <div className="flex items-center justify-center py-10 text-ink-3"><LucideLoader2 className="w-5 h-5 animate-spin" /></div>
                )}
                {!loading && messages.length === 0 && (
                    <p className="py-12 text-center text-[13px] font-medium text-ink-3">{emptyText ?? t("chat.empty")}</p>
                )}
                {messages.map((m, i) => {
                    const prev = messages[i - 1];
                    const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
                    const mine = !!meId && m.senderId === meId;
                    const system = m.type === "system" || m.senderId === null;
                    const grouped = !newDay && prev && !system && prev.type !== "system" && prev.senderId === m.senderId
                        && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 60_000;
                    return (
                        <div key={m.id}>
                            {newDay && (
                                <div className="flex items-center gap-3 my-3">
                                    <span className="flex-1 h-px bg-surface-line" />
                                    <span className="text-[11px] font-medium text-ink-4">{dayLabel(m.createdAt, locale)}</span>
                                    <span className="flex-1 h-px bg-surface-line" />
                                </div>
                            )}
                            {system ? (
                                <p className="my-2 text-center text-[12px] font-medium text-ink-3"><span className="px-2.5 py-1 rounded-full bg-surface-2">{m.message}</span></p>
                            ) : (
                                <div className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start", grouped ? "mt-0.5" : "mt-2")}>
                                    {!mine && (
                                        <span className={cn("w-8 h-8 rounded-full bg-surface-3 overflow-hidden shrink-0 flex items-center justify-center text-[12px] font-semibold text-ink-2", grouped && "invisible")}>
                                            {m.sender?.profileImageUrl ? <img src={m.sender.profileImageUrl} alt="" className="w-full h-full object-cover" /> : (m.sender?.name?.charAt(0) ?? "?")}
                                        </span>
                                    )}
                                    <div className={cn("max-w-[78%] flex flex-col", mine ? "items-end" : "items-start")}>
                                        {!mine && !grouped && <span className="mb-0.5 ml-1 text-[11.5px] font-medium text-ink-3">{m.sender?.name}</span>}
                                        <div className={cn("flex items-end gap-1.5", mine ? "flex-row-reverse" : "flex-row")}>
                                            {isCard(m) ? (
                                                <button
                                                    type="button" onClick={() => onOpenCard?.(m)}
                                                    onPointerDown={() => holdStart(m)} onPointerUp={holdEnd} onPointerLeave={holdEnd} onContextMenu={(e) => { e.preventDefault(); if (canDelete?.(m)) onDelete?.(m); }}
                                                    className="max-w-full text-left rounded-2xl border border-surface-line bg-surface-1 px-3.5 py-3 active:bg-surface-2"
                                                >
                                                    <span className="block text-[11px] font-semibold text-brand mb-0.5">{m.type === "settlement" ? t("chat.cardSettlement") : t("chat.cardBooking")}</span>
                                                    <span className="block text-[14px] font-medium text-ink-1 whitespace-pre-wrap break-words">{m.message}</span>
                                                    {m.type === "settlement" && (m as any).metadata?.totalAmount > 0 && <span className="block rk-num text-[13px] text-ink-2 mt-0.5">{t("chat.amountWon").replace("{n}", Number((m as any).metadata.totalAmount).toLocaleString())}</span>}
                                                    <span className="block text-[12px] font-medium text-brand mt-1.5">{t("chat.cardOpen")} ›</span>
                                                </button>
                                            ) : (
                                                <span
                                                    onClick={() => { if (m.failed && onRetry) onRetry(m); }}
                                                    onPointerDown={() => holdStart(m)} onPointerUp={holdEnd} onPointerLeave={holdEnd} onContextMenu={(e) => { e.preventDefault(); if (canDelete?.(m)) onDelete?.(m); }}
                                                    className={cn(
                                                        "px-3 py-2 rounded-2xl text-[14px] leading-snug whitespace-pre-wrap break-words select-none",
                                                        mine ? "bg-brand text-brand-fg rounded-br-md" : "bg-surface-2 text-ink-1 rounded-bl-md",
                                                        m.pending && "opacity-60",
                                                        m.failed && "bg-red-500/15 text-red-500 border border-red-500/30 cursor-pointer",
                                                    )}
                                                >
                                                    {m.type === "photo" && (m as any).metadata?.photoUrl ? <img src={(m as any).metadata.photoUrl} alt="" className="max-w-[220px] rounded-lg" /> : m.message}
                                                    {m.failed && <span className="block text-[11px] mt-0.5">{t("chat.failedTap")}</span>}
                                                </span>
                                            )}
                                            <span className="text-[10.5px] text-ink-4 shrink-0 mb-0.5">{m.pending ? "…" : timeLabel(m.createdAt, locale)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="shrink-0 border-t border-surface-line bg-surface-1 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
                <div className="flex items-end gap-2">
                    <textarea
                        ref={inputRef}
                        value={text}
                        onChange={(e) => setText(e.target.value.slice(0, 1000))}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
                        rows={1}
                        disabled={disabled}
                        onFocus={() => { atBottomRef.current = true; setTimeout(toBottom, 60); setTimeout(toBottom, 320); }}
                        placeholder={disabled ? t("chat.readOnly") : t("chat.placeholder")}
                        className="flex-1 min-h-[42px] max-h-[120px] px-3.5 py-2.5 rounded-2xl bg-surface-2 text-[14px] text-ink-1 placeholder:text-ink-4 outline-none resize-none focus:ring-1 focus:ring-brand disabled:opacity-50"
                        style={{ height: "auto" }}
                        onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${Math.min(120, el.scrollHeight)}px`; }}
                    />
                    <button
                        type="button" onClick={() => { void send(); }} disabled={disabled || sending || !text.trim()}
                        aria-label={t("chat.send")}
                        className="w-[42px] h-[42px] rounded-full bg-brand text-brand-fg flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
                    >
                        {sending ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : <LucideSend className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
