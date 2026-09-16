import { memo, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { CHAT_FRESH_MS, CHAT_LOG_LINES, CHAT_MAX_CHARS, CHAT_QUICK_CODES, chatLength, clampChatText } from "@shared/sim/chat";
import type { ChatLine } from "../matchApi";
import type { ChatSendResult } from "../simController";
import { EMOJI_GLYPH } from "./EmojiBar";

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
 * 고정 문구의 그림. 상단 띠의 여섯 개(EMOJI_GLYPH)에 채팅 전용 셋을 얹는다.
 * 기존 여섯과 헷갈리지 않게 골랐다 — 손 모양(👋)과 시계(⏰)는 이미 쓰이고 있다.
 */
const CHAT_GLYPH: Readonly<Record<string, string>> = {
    ...EMOJI_GLYPH,
    oops: "😖", wait: "⏸️", thanks: "🙌",
};

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
 * 입력 한 줄. 상대 차례에만 나타난다.
 *
 * 초안(draft)을 **밖에서** 들고 있는 이유: 상대가 연속 득점하면 재생·결과 배너 때문에 이 컴포넌트가 몇 번씩
 * 마운트를 오간다. 안에 두면 그때마다 쓰던 글이 날아간다.
 */
export function MatchChatBar({ draft, onDraft, onSend, onSendCode, quickOpen, onQuickOpen, disabled }: {
    draft: string;
    onDraft: (v: string) => void;
    onSend: (text: string) => Promise<ChatSendResult>;
    /** 1탭 고정 문구. 키보드를 아예 안 여는 길이라 이 기능의 절반이다. */
    onSendCode: (code: string) => Promise<ChatSendResult>;
    /** 문구판이 펼쳐졌나. **밖에서** 들고 있다 — 펼친 동안 상대 차례 카드를 감춰 자리를 내주기 때문. */
    quickOpen: boolean;
    onQuickOpen: (v: boolean) => void;
    /** 전송 중 */
    disabled?: boolean;
}) {
    const { t } = useT();
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    // 언마운트(= 내 차례가 됐다) 직전에 키보드를 내린다. 안 그러면 iOS 에서 키보드가 잠깐 남아
    // 40초가 도는 동안 조작 독을 덮는다.
    useEffect(() => () => { inputRef.current?.blur(); }, []);

    const send = useCallback(async () => {
        const text = draft.trim();
        if (!text || busy) return;
        setBusy(true);
        setNote(null);
        const r = await onSend(text);
        setBusy(false);
        if (r === "ok") { onDraft(""); return; }
        // 거부 종류에 따라 초안을 지킬지 정한다. 고쳐 쓸 수 있는 건 남기고, 더 못 보내는 것만 비운다.
        if (r === "limit") { onDraft(""); setNote(t("sim.emoji.limit")); return; }
        setNote(
            r === "too-fast" ? t("sim.emoji.tooFast")
                : r === "blocked" ? t("sim.chat.blocked")
                    : r === "your-turn" ? t("sim.chat.turnOnly")
                        : t("sim.chat.failed"),
        );
    }, [draft, busy, onSend, onDraft, t]);

    const sendCode = useCallback(async (code: string) => {
        if (busy) return;
        setBusy(true);
        setNote(null);
        const r = await onSendCode(code);
        setBusy(false);
        onQuickOpen(false);                  // 고르면 바로 접는다 — 칩 열이 테이블을 오래 덮지 않게
        if (r !== "ok") setNote(r === "too-fast" ? t("sim.emoji.tooFast") : r === "limit" ? t("sim.emoji.limit") : t("sim.chat.failed"));
    }, [busy, onSendCode, onQuickOpen, t]);

    return (
        <div className="pointer-events-auto w-full max-w-[320px] flex flex-col items-stretch gap-1">
            {note && <span className="self-center rk-chip bg-surface-1 border border-surface-line text-ink-2">{note}</span>}
            {/* 1탭 문구판. 펼친 동안만 자리를 쓰고, 하나 고르면 접힌다. 키보드가 필요 없는 길이다. */}
            {quickOpen && (
                <div className="flex flex-wrap justify-center gap-1">
                    {CHAT_QUICK_CODES.map((code) => (
                        <button
                            key={code} type="button" disabled={disabled || busy}
                            onClick={() => { void sendCode(code); }}
                            className={cn(
                                "h-8 px-2.5 rounded-pill inline-flex items-center gap-1",
                                "bg-surface-1 border border-surface-line text-[12px] font-semibold text-ink-1",
                                "active:bg-surface-3 disabled:opacity-40",
                            )}
                        >
                            <span className="text-[13px] leading-none">{CHAT_GLYPH[code]}</span>
                            {t(`sim.emoji.${code}`)}
                        </button>
                    ))}
                </div>
            )}
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => { onQuickOpen(!quickOpen); inputRef.current?.blur(); }}
                    aria-label={t("sim.chat.quick")}
                    aria-expanded={quickOpen}
                    className={cn(
                        "shrink-0 h-11 w-11 rounded-pill text-[17px] leading-none",
                        "border border-surface-line active:bg-surface-3",
                        quickOpen ? "bg-brand text-brand-fg" : "bg-surface-1 text-ink-2",
                    )}
                >
                    ☺
                </button>
                <input
                    ref={inputRef}
                    value={draft}
                    // 글자 수는 코드포인트로 센다. maxLength 속성은 UTF-16 이라 이모지에서 서버 판정과 어긋난다.
                    onChange={(e) => onDraft(clampChatText(e.target.value))}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void send(); } }}
                    placeholder={t("sim.chat.placeholder")}
                    aria-label={t("sim.chat.placeholder")}
                    enterKeyHint="send"
                    inputMode="text"
                    className={cn(
                        "flex-1 min-w-0 h-11 px-3.5 rounded-pill",
                        "bg-surface-1 border border-surface-line text-[14px] text-ink-1 placeholder:text-ink-4",
                        "outline-none focus:border-brand",
                    )}
                />
                <button
                    type="button"
                    onClick={() => { void send(); }}
                    disabled={disabled || busy || chatLength(draft.trim()) === 0}
                    aria-label={t("sim.chat.send")}
                    className={cn(
                        "shrink-0 h-11 px-4 rounded-pill text-[13px] font-bold",
                        "bg-brand text-brand-fg active:scale-[0.97] transition-transform disabled:opacity-40",
                    )}
                >
                    {t("sim.chat.send")}
                </button>
            </div>
        </div>
    );
}

export { CHAT_MAX_CHARS };
