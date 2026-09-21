import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import {
    CHAT_FRESH_MS, CHAT_FROM_WATCHER, CHAT_LOG_LINES, CHAT_MAX_CHARS, CHAT_QUICK_CODES, CHAT_QUICK_FUN_CODES,
    chatLength, clampChatText,
} from "@shared/sim/chat";
import type { ChatLine } from "../matchApi";
import type { ChatSendResult } from "../simController";

/**
 * 대전 중 한마디(2026-09-16 오너: "멀티가 너무 정적이다 … 하단에 내가 글을 쓸 수 있고, 상대 턴일 때 상대 글을 볼 수 있게").
 *
 * 화면을 가리지 않는 것이 제1 요건이라, 읽기와 쓰기를 **다른 자리**에 둔다.
 *
 *  - 읽기(ChatLog)는 왼쪽 위 칩 열의 자식이다. 그 열은 이미 pointer-events-none 이라 조준 드래그를 훔치지 않고,
 *    세로로 자라도 테이블 위쪽 여백을 쓴다. 조준 중에도 보인다 — 상대 말이 안 보이면 대화가 아니라 편지가 된다.
 *  - 쓰기(ChatBar)는 화면 아래 한 줄이다. 내가 기다리는 동안에만 나타난다. 내 차례에 키보드가 올라오면
 *    두께 독·미세 방향조절·샷 버튼이 덮이는데 40초 시계는 계속 돌고 세 번이면 실격패다 — 그래서 아예 안 만든다.
 *    (서버도 같은 규칙을 들고 있다. 화면 배치만 믿으면 다음 사람이 UI 를 건드릴 때 그 보장이 조용히 사라진다.)
 *
 * 2026-09-15 사고의 규칙을 그대로 지킨다: 숨길 땐 `return null`(opacity-0 로 투명 버튼을 남기지 않는다),
 * 컨테이너는 pointer-events-none 이고 **누를 것만** auto 로 옵트인한다.
 */

/** 이 시간이 지난 말은 칩 열에서 사라진다 — 낡은 한마디가 테이블 위에 영영 남지 않게. */
export { CHAT_FRESH_MS };

function isFresh(line: ChatLine, now: number): boolean {
    const at = Date.parse(line.at);
    return !Number.isFinite(at) || now - at < CHAT_FRESH_MS;
}

/**
 * 고정 문구의 그림. 코드 하나에 그림 하나 — 서버·DB 는 코드만 알고 그림은 여기서만 고른다
 * (5개 언어라 문장을 저장하면 상대 화면에 남의 언어가 뜬다).
 * 2026-09-17 헤더 재설계로 상단 띠의 이모지 인사를 없애면서, 그때 쓰던 여섯 개의 그림도 이리로 왔다.
 */
export const CHAT_GLYPH: Readonly<Record<string, string>> = {
    hi: "👋", nice: "👍", wow: "😮", hurry: "⏰", sorry: "🙏", fight: "🔥",
    oops: "😖", wait: "⏸️", thanks: "🙌",
    // 가볍게 약 올리는 말·관전 응원(2026-09-21). clap 은 문구 자체에 👏 가 있어 비워 둔다.
    luck: "🍀", tense: "😅", showoff: "😎", comeback: "💪", watching: "👀", gg: "🤝", goodgame: "🏆", again: "🔁",
};

/**
 * 관전자 색 — **보라 하나**로 통일한다(2026-09-21 오너: "관전자 인원과 관전자가 보내는 멘트는 색을 다르게, 선수인지 관전자인지
 * 판단이 안 된다"). 선수 말풍선은 brand(나)·회색(상대)이라 세 번째 색이 필요하고, 두 종목 어디에도 안 쓰는 보라를 골랐다.
 * 말풍선·"관전" 꼬리표·👀 인원이 전부 같은 보라라 "보라 = 관전"이 한 번에 읽힌다. 선수 화면·관전 화면이 같은 값을 쓴다.
 */
export const WATCHER_BUBBLE = "bg-[#6E5BC8]/30 text-[#DCD3FF] border border-[#8C7AD1]/40";
export const WATCHER_TAG = "text-[11px] font-bold text-[#B8A7FF] mr-1";
export const WATCHER_CHIP = "rounded-pill bg-[#6E5BC8]/30 text-[#DCD3FF] text-[11px] font-bold rk-num px-2 py-0.5";

/** 코드 줄은 **보는 사람의 언어로** 그린다 — 저장된 건 코드뿐이라 상대 화면엔 상대 언어로 뜬다. */
function lineText(line: ChatLine, t: (k: string) => string): string {
    if (line.kind !== "code") return line.text;
    const glyph = CHAT_GLYPH[line.text];
    const label = t(`sim.emoji.${line.text}`);
    return glyph ? `${glyph} ${label}` : label;
}

/**
 * 최근 몇 줄. 왼쪽 위 칩 열 **안에** 넣는다(형제로 두면 새 레이어가 하나 더 생긴다).
 * pointer-events 를 손대지 않는다 — 부모의 none 을 그대로 상속해야 글자 위 터치도 조준으로 지나간다.
 */
export const MatchChatLog = memo(function MatchChatLog({ lines, myIndex, now }: {
    lines: readonly ChatLine[];
    myIndex: number;
    /** 신선도 판정용 현재 시각(화면이 1초 안쪽으로 갱신해 준다) */
    now: number;
}) {
    const { t } = useT();
    const shown = lines.filter((l) => isFresh(l, now)).slice(-CHAT_LOG_LINES);
    if (shown.length === 0) return null;
    return (
        <>
            {shown.map((l) => (
                <span
                    key={l.id}
                    className={cn(
                        "rk-chip max-w-full truncate",
                        l.from === myIndex
                            ? "bg-brand text-brand-fg"
                            : "bg-surface-1 border border-surface-line text-ink-1",
                    )}
                >
                    {lineText(l, t)}
                </span>
            ))}
        </>
    );
});

/**
 * 대화 내역은 전부 들고 스크롤한다(2026-09-18 오너: "채팅 내역이 너무 짧게 보인다, 스크롤되게").
 * 몇 줄이 보일지는 상자 높이가 정한다 — 접힘은 바닥 근처, 펼침은 화면 중간까지.
 */

/**
 * 1탭 문구 칩 — **한 줄 가로 스크롤**(2026-09-18). 대화 줄 자리에 바꿔 끼우므로, 줄을 두 줄로 접으면 문구판을
 * 열 때마다 대화창이 커져 당구 천을 덮는다. 한 줄이면 높이가 그대로다. 누를 것이라 pointer-events-auto 를 스스로 켠다.
 */
export function QuickChips({ onPick, disabled, codes = [...CHAT_QUICK_CODES, ...CHAT_QUICK_FUN_CODES] }: {
    onPick: (code: string) => void;
    disabled?: boolean;
    /** 그릴 문구(기본: 기본 여섯 + 가볍게 약 올리는 다섯). 관전 화면은 응원 목록만 준다. */
    codes?: readonly string[];
}) {
    const { t } = useT();
    return (
        <div className="pointer-events-auto shrink-0 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-0.5 px-0.5 py-0.5">
            {codes.map((code) => (
                <button
                    key={code} type="button" disabled={disabled}
                    onClick={() => onPick(code)}
                    className={cn(
                        "shrink-0 h-8 px-2.5 rounded-pill inline-flex items-center gap-1",
                        "bg-surface-3 text-[12px] font-semibold text-ink-1",
                        "active:bg-surface-line disabled:opacity-40",
                    )}
                >
                    {CHAT_GLYPH[code] && <span className="text-[13px] leading-none">{CHAT_GLYPH[code]}</span>}
                    {t(`sim.emoji.${code}`)}
                </button>
            ))}
        </div>
    );
}

/** ☺ 토글. 열고 닫는 일만 한다. */
export function QuickToggle({ open, onToggle, className }: { open: boolean; onToggle: () => void; className?: string }) {
    const { t } = useT();
    return (
        <button
            type="button" onClick={onToggle}
            aria-label={t("sim.chat.quick")} aria-expanded={open}
            className={cn(
                "pointer-events-auto shrink-0 h-10 w-10 rounded-pill text-[16px] leading-none active:bg-surface-3",
                open ? "bg-brand text-brand-fg" : "bg-surface-3 text-ink-2",
                className,
            )}
        >
            ☺
        </button>
    );
}

/**
 * 내 차례(조준 중)에 대화창을 여는 말풍선(2026-09-18 오너: "칠 때도 쓰게 해 달라").
 *
 * 왼쪽 위 칩 열에 둔다 — **샷 버튼 옆에 두지 않는 이유**: 대화하려다 샷 버튼을 잘못 누르면 샷이 나가고 되돌릴 수 없다.
 * 반대 방향 오터치(샷 하려다 이걸 누름)는 대화창이 열릴 뿐이다. 그리고 여기는 상대 한마디가 뜨는 바로 그 자리라
 * 읽은 곳에서 답하게 된다. 안 읽은 상대 말이 있으면 빨간 점을 단다.
 */
export function MatchChatToggle({ open, unread, onToggle }: { open: boolean; unread: boolean; onToggle: () => void }) {
    const { t } = useT();
    return (
        <button
            type="button" onClick={onToggle}
            aria-label={t("sim.chat.open")} aria-expanded={open}
            className={cn(
                "pointer-events-auto relative h-9 w-9 rounded-pill flex items-center justify-center border border-surface-line active:bg-surface-3",
                open ? "bg-brand text-brand-fg" : "bg-surface-1 text-ink-2",
            )}
        >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.3A8 8 0 1 1 21 12z" />
            </svg>
            {unread && !open && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-pill bg-ball-red border-2 border-surface-1" />}
        </button>
    );
}

/**
 * 미니 대화창 — 대화 줄과 입력줄을 **한 상자**에(2026-09-18 오너: "분리될 필요가 없네, 미니 채팅 모양이면 되네").
 *
 * 예전엔 대화 카드와 입력줄이 따로 떠서 사이 간격과 카드 여백이 두 번 들어갔다. 한 상자로 합치면 그만큼 줄고,
 * ☺ 문구판도 대화 줄 **자리에 바꿔 끼워** 열어도 높이가 안 는다.
 *
 * 높이 상한(maxHeight)은 부르는 쪽이 chatMaxHeight 로 준다 — 이 상자 윗변이 당구 천 아래끝보다 아래에 오게 해서
 * **공을 가릴 수 없게** 한다(오너: "뒤에 공이 있으면 안 보이잖아"). 줄이 넘치면 오래된 줄이 위로 잘린다.
 *
 * 쓰이는 자리 둘:
 *   · 상대 차례 — 늘 떠 있다. 아직 말이 없으면 누구 차례인지 담은 안내 한 줄.
 *   · 내 차례 — 말풍선을 눌렀을 때만. 맨 위에 "내 차례 · 남은 초"와 닫기(40초는 계속 가고 세 번 넘기면 실격패라,
 *     쓰는 동안에도 시간이 보여야 한다).
 *
 * 초안(draft)은 밖에서 든다 — 상대가 연속 득점하면 재생·배너 때문에 줄 영역이 여러 번 접혔다 펴져도 쓰던 글이 남게.
 * 키보드가 뜨면 마지막 두 줄만 남기고(hide-on-keyboard) 나머지는 당구대에 자리를 내준다.
 */
export function MatchMiniChat(p: {
    lines: readonly ChatLine[];
    myIndex: number;
    opponentName: string;
    draft: string;
    onDraft: (v: string) => void;
    onSend: (text: string) => Promise<ChatSendResult>;
    onSendCode: (code: string) => Promise<ChatSendResult>;
    quickOpen: boolean;
    onQuickOpen: (v: boolean) => void;
    /** 대화 줄을 보일지(결과 배너가 뜨는 2.4초 동안엔 접는다 — 배너와 겹치지 않게). 입력줄은 늘 남는다. */
    showLines: boolean;
    /** 이 상자의 최대 높이 — 접힘/펼침에 따라 부르는 쪽이 준다(px 숫자 또는 CSS 식). */
    maxHeight: number | string;
    /** 위로 펼쳤나(화면 중간까지). 밖에서 든다 — 펼친 동안 오른쪽 점수판을 감추기 때문. */
    expanded: boolean;
    onExpanded: (v: boolean) => void;
    /** 내 차례에 연 경우: 남은 초와 닫기 */
    myTurn?: { readonly seconds: number | null; readonly onClose: () => void } | null;
    /** 상대가 자리를 비워 시계가 아직 안 돈다(상대 차례) */
    away?: boolean;
    /** 48시간 무응답 승리 주장(가능할 때만) */
    onClaim?: (() => void) | null;
    /** 지금 보고 있는 관전자 수(2026-09-21 오너: "채팅 바에 관전하는 사람 표시가 필요해"). 0 이면 안 그린다. */
    watchers?: number;
    disabled?: boolean;
}) {
    const { t } = useT();
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const shown = p.lines;
    /*
     * 스크롤: 새 말이 오면 맨 아래로 — 단, **이미 아래를 보고 있을 때만**. 위로 올려 옛 대화를 읽는 중에 새 말이 왔다고
     * 끌어내리면 읽던 자리를 잃는다. 펼치거나 접을 때는 늘 맨 아래로(방금 오간 말이 보여야 한다).
     */
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const atBottomRef = useRef(true);
    const toBottom = () => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; };
    useLayoutEffect(() => { if (atBottomRef.current) toBottom(); }, [shown.length, p.showLines]);
    useLayoutEffect(() => { atBottomRef.current = true; toBottom(); }, [p.expanded]);

    // 사라질 때(= 차례가 바뀌거나 닫힘) 키보드를 먼저 내린다. 안 그러면 iOS 에서 키보드가 잠깐 남아 조작 독을 덮는다.
    useEffect(() => () => { inputRef.current?.blur(); }, []);

    const send = useCallback(async () => {
        const text = p.draft.trim();
        if (!text || busy) return;
        setBusy(true);
        setNote(null);
        const r = await p.onSend(text);
        setBusy(false);
        if (r === "ok") { p.onDraft(""); return; }
        // 고쳐 쓸 수 있는 거부는 초안을 남기고, 더 못 보내는 것만 비운다.
        if (r === "limit") { p.onDraft(""); setNote(t("sim.emoji.limit")); return; }
        setNote(r === "too-fast" ? t("sim.emoji.tooFast") : r === "blocked" ? t("sim.chat.blocked") : t("sim.chat.failed"));
    }, [p, busy, t]);

    const sendCode = useCallback(async (code: string) => {
        if (busy) return;
        setBusy(true);
        setNote(null);
        const r = await p.onSendCode(code);
        setBusy(false);
        p.onQuickOpen(false);                 // 고르면 바로 접는다
        if (r !== "ok") setNote(r === "too-fast" ? t("sim.emoji.tooFast") : r === "limit" ? t("sim.emoji.limit") : t("sim.chat.failed"));
    }, [p, busy, t]);

    return (
        <div
            data-sim-chat=""
            className="pointer-events-auto w-full max-w-[340px] rounded-card bg-surface-1 border border-surface-line p-2 flex flex-col gap-1.5 overflow-hidden"
            style={{ maxHeight: p.maxHeight }}
        >
            {/* 위로 펼치기 손잡이 — 누르면 화면 중간까지 올라오고, 다시 누르면 접힌다. */}
            <button
                type="button" onClick={() => p.onExpanded(!p.expanded)}
                aria-label={t(p.expanded ? "sim.chat.collapse" : "sim.chat.expand")} aria-expanded={p.expanded}
                className="relative shrink-0 -mt-1 -mb-0.5 h-5 w-full flex items-center justify-center text-ink-3 active:text-ink-1"
            >
                <svg viewBox="0 0 24 12" width="22" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={p.expanded ? "M5 3l7 6 7-6" : "M5 9l7-6 7 6"} />
                </svg>
                {/* 보는 사람 — 손잡이 오른쪽 끝에. 0 명이면 자리도 차지하지 않는다. */}
                {(p.watchers ?? 0) > 0 && (
                    <span className={cn("absolute right-0", WATCHER_CHIP)}>
                        👀 {p.watchers}
                    </span>
                )}
            </button>
            {p.myTurn && (
                <div className="shrink-0 flex items-center gap-2 px-1">
                    <span className="flex-1 min-w-0 text-[12px] font-semibold text-ink-2 truncate">
                        {p.myTurn.seconds !== null
                            ? t("sim.chat.myTurnClock").replace("{n}", String(p.myTurn.seconds))
                            : t("sim.chat.myTurn")}
                    </span>
                    <button
                        type="button" onClick={p.myTurn.onClose} aria-label={t("sim.common.close")}
                        className="shrink-0 h-7 px-2.5 rounded-pill bg-surface-3 text-[12px] font-semibold text-ink-2 active:bg-surface-line"
                    >
                        {t("sim.common.close")}
                    </button>
                </div>
            )}
            {p.away && <p className="hide-on-keyboard shrink-0 text-center text-[12px] font-medium text-ink-3">{t("sim.match.opponentAway")}</p>}
            {p.onClaim && (
                <button type="button" onClick={p.onClaim} className="hide-on-keyboard shrink-0 h-10 w-full rounded-xl bg-brand text-brand-fg text-[13px] font-semibold">
                    {t("sim.match.claim")}
                </button>
            )}
            {note && <span className="shrink-0 self-center rk-chip bg-surface-3 text-ink-2">{note}</span>}
            {/* 줄 영역: 문구판이 열리면 그 자리를 문구판이 쓴다(높이 그대로). 넘치면 오래된 줄이 위로 잘린다. */}
            {p.quickOpen ? (
                <QuickChips onPick={(code) => { void sendCode(code); }} disabled={p.disabled || busy} />
            ) : p.showLines && (
                shown.length === 0 ? (
                    !p.myTurn && (
                        <p className="shrink-0 py-0.5 text-center text-[12.5px] font-medium text-ink-3">
                            {t("sim.chat.emptyWaiting").replace("{name}", p.opponentName)}
                        </p>
                    )
                ) : (
                    /*
                     * 스크롤 상자 + 안쪽 min-h-full·justify-end. 바깥에 justify-end 를 주면 넘친 윗부분이 스크롤로 닿지 않는다
                     * (flex-end 오버플로 함정) — 안쪽이 상자보다 작을 땐 아래로 붙고, 넘치면 바깥이 평범하게 스크롤된다.
                     */
                    <div
                        ref={scrollRef}
                        onScroll={(e) => { const el = e.currentTarget; atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
                        className={cn(
                            "flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                            // 접힘은 딱 두 줄(2026-09-18 오너: "다이가 가려지지 않게, 어차피 위로 늘리면 다 보인다").
                            // 한 줄 = 12.5px × 1.375 + 위아래 2px ≈ 21px, 두 줄 + 간격 4px ≈ 47px. 더 지난 말은 스크롤·펼치기로.
                            !p.expanded && "max-h-[47px]",
                        )}
                    >
                        <ul className="min-h-full flex flex-col justify-end gap-1" aria-live="polite">
                            {shown.map((l) => {
                                const mine = l.from === p.myIndex;
                                return (
                                    <li key={l.id} className={cn("shrink-0 flex", mine ? "justify-end" : "justify-start")}>
                                        <span
                                            className={cn(
                                                // 펼치면 긴 말도 다 보이게 줄바꿈, 접힘에선 한 줄로
                                                "max-w-[85%] px-2.5 py-0.5 rounded-2xl text-[12.5px] leading-snug",
                                                p.expanded ? "break-words" : "truncate",
                                                // 관전자 응원은 선수 말과 다른 색이다 — 누가 한 말인지가 먼저 읽혀야 한다.
                                                l.from === CHAT_FROM_WATCHER ? WATCHER_BUBBLE
                                                    : mine ? "bg-brand text-brand-fg" : "bg-surface-3 text-ink-1",
                                            )}
                                        >
                                            {l.from === CHAT_FROM_WATCHER && <span className={WATCHER_TAG}>{t("sim.chat.watcherTag")}</span>}
                                            {lineText(l, t)}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )
            )}
            <div className="shrink-0 flex items-center gap-1.5">
                <QuickToggle open={p.quickOpen} onToggle={() => { p.onQuickOpen(!p.quickOpen); inputRef.current?.blur(); }} />
                <input
                    ref={inputRef}
                    value={p.draft}
                    // 글자 수는 코드포인트로 센다. maxLength 속성은 UTF-16 이라 이모지에서 서버 판정과 어긋난다.
                    onChange={(e) => p.onDraft(clampChatText(e.target.value))}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void send(); } }}
                    placeholder={t("sim.chat.placeholder")}
                    aria-label={t("sim.chat.placeholder")}
                    enterKeyHint="send"
                    inputMode="text"
                    className="flex-1 min-w-0 h-10 px-3 rounded-pill bg-surface-3 text-[14px] text-ink-1 placeholder:text-ink-4 outline-none focus:ring-1 focus:ring-brand"
                />
                <button
                    type="button"
                    onClick={() => { void send(); }}
                    disabled={p.disabled || busy || chatLength(p.draft.trim()) === 0}
                    aria-label={t("sim.chat.send")}
                    className="shrink-0 h-10 px-3.5 rounded-pill bg-brand text-brand-fg text-[13px] font-bold active:scale-[0.97] transition-transform disabled:opacity-40"
                >
                    {t("sim.chat.send")}
                </button>
            </div>
        </div>
    );
}

export { CHAT_MAX_CHARS };
