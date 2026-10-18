/**
 * 산 고르기 두 가지(2026-10-13) — 공용 화면(채팅 방 · 투표 만들기 창)에 놓이는 등산의 조각. 산악회일 때만 불러 온다(lazy).
 *
 *  · MountainCardPicker — 산악회 방의 + → '산 보내기'. 아래에서 올라오는 창에서 산을 찾아 고르면 방에 산 카드가 올라간다.
 *    여기서는 산의 주소(slug)만 넘긴다 — 카드의 글(이름 · 높이 · 자리 · 코스)은 서버가 산 표에서 읽어 채운다(shared/hikingChat 머리말).
 *  · PollMountainFill — 투표 만들기 창의 '산으로 보기 채우기'. 산을 고르면 그 이름이 보기 칸에 들어간다(빈 칸부터, 상한까지).
 *    무엇을 어떻게 넣는지는 shared/hikingChat addPollMountain 이 정한다 — 창은 보기 글만 받는다.
 *
 * 둘은 같은 찾기(./mountainSearch — 조회 캐시를 거치지 않는다)와 같은 찾는 칸(MountainSearchBox)을 쓴다.
 * 같은 이름의 산은 시군을 붙여 가른다("백운산(포천)"). 이름 뒤에 시군을 이어 적으면 좁혀진다("백운산 포천").
 * 누른 것의 기록에는 구역 이름만 남긴다(data-track-as — 친 글 · 고른 산은 남기지 않는다).
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지. 글자 그림(이모지)을 쓰지 않는다.
 */
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { LucideX } from "@/lib/icons";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
    MOUNTAIN_PICKER_COPY as PICKER, MOUNTAIN_SEARCH_COPY as COPY, POLL_MOUNTAIN_COPY as POLL,
    addPollMountain, mountainHitLabels, mountainHitWhere, mountainSearchNote, pollMountainAddedNote, pollMountainFailNote, pollMountainFullNote, pollMountainRoom,
    type MountainHit, type PollMountainPick,
} from "@shared/hikingChat";
import { useMountainSearch } from "./mountainSearch";

/** 한 번에 보여 주는 산의 수 — 창은 넉넉히, 투표 창의 한 줄은 짧게 */
const SHEET_STEP = 20;
const POLL_STEP = 4;

const Badge = () => <span className="shrink-0 rounded-full border border-[#F6D9A866] px-2 py-0.5 text-[12px] leading-none text-[#F6D9A8]">{COPY.badge}</span>;

interface BoxProps {
    /** 산을 골랐다. ok 가 false 면 넣지 못한 것이라 친 글을 남긴다. note 는 그 일을 알리는 한 줄 */
    onChoose: (m: MountainHit) => { ok: boolean; note?: string } | void;
    /** 한 번에 보여 주는 산의 수('더 보기'로 이만큼씩 더) */
    step: number;
    /** 시험용 이름의 앞머리 */
    tid: string;
    /** 찾기 전의 한 줄 */
    idle: string;
    /** 자리를 가득 채우고 목록만 스크롤한다(아래에서 올라오는 창) */
    fill?: boolean;
}

/** 찾는 칸 · 찾은 산의 목록 · 지금의 한 줄 */
function MountainSearchBox({ onChoose, step, tid, idle, fill }: BoxProps) {
    const uid = useId();
    const listId = `${uid}-list`;
    const [text, setText] = useState("");
    const [said, setSaid] = useState<string | null>(null);
    const { q, options, state, capped } = useMountainSearch(text);
    const [shown, setShown] = useState(step);
    const [cursor, setCursor] = useState(-1);
    const visible = useMemo(() => options.slice(0, shown), [options, shown]);
    const labels = useMemo(() => mountainHitLabels(visible), [visible]);
    // 검색어가 바뀌면 처음 몇 곳으로 돌아간다(끝에 빈칸만 더한 것은 바뀐 것이 아니다)
    const typed = text.trim().replace(/\s+/g, " ");
    useEffect(() => { setShown(step); }, [typed, step]);
    // 목록이 바뀌면(새 답이 오면 순서가 달라진다) 자판으로 짚어 둔 줄을 푼다 — 같은 자리의 다른 산이 골라지면 안 된다
    useEffect(() => { setCursor(-1); }, [options]);
    useEffect(() => { if (cursor >= 0) document.getElementById(`${uid}-opt-${cursor}`)?.scrollIntoView({ block: "nearest" }); }, [cursor, uid]);

    const choose = (m: MountainHit) => {
        const r = onChoose(m);
        setSaid(r?.note ?? null);
        if (!r || r.ok) setText("");
    };
    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            // 이 칸이 form 안에 놓여도 Enter 가 그 창을 올려 버리지 않게
            e.preventDefault();
            // 한글을 치는 도중의 Enter 는 글자를 맺는 것이다
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            // 짚어 둔 줄을 고른다. 짚지 않았어도 찾은 산이 하나뿐이면 그 산이다(답을 기다리는 중의 옛 목록은 믿지 않는다)
            const m = visible[cursor] ?? (options.length === 1 && state === "done" ? options[0] : undefined);
            if (m) choose(m);
            return;
        }
        if (visible.length === 0) return;
        if (e.key === "ArrowDown") { e.preventDefault(); setCursor((i) => (i + 1) % visible.length); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((i) => (i <= 0 ? visible.length - 1 : i - 1)); }
    };
    const status = said ?? (state === "idle" ? idle : state === "error" ? COPY.error : state === "loading" ? COPY.loading : options.length > 0 ? mountainSearchNote(options.length, step, capped) : COPY.empty);

    return (
        <div className={fill ? "flex min-h-0 flex-1 flex-col" : ""} data-state={q ? state : "idle"}>
            <input
                type="text" inputMode="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={60}
                value={text} onChange={(e) => { setText(e.target.value); setSaid(null); }} onKeyDown={onKeyDown}
                placeholder={COPY.placeholder} aria-label={COPY.searchLabel} data-testid={`${tid}-search`}
                role="combobox" aria-autocomplete="list" aria-expanded={visible.length > 0} aria-controls={listId} aria-activedescendant={cursor >= 0 && visible[cursor] ? `${uid}-opt-${cursor}` : undefined}
                className="h-12 w-full shrink-0 rounded-xl border border-[#FFFFFF1F] bg-[#FFFFFF0A] px-4 text-[15px] text-[#F4EFE3] outline-none placeholder:text-[#F4EFE399] focus:border-[#F28C6A]"
            />
            <p className="mt-2 shrink-0 text-[12.5px] leading-snug text-[#F4EFE399] break-keep" role="status" aria-live="polite" data-testid={`${tid}-status`}>{status}</p>
            <div className={fill ? "mt-2 min-h-0 flex-1 overflow-y-auto" : visible.length > 0 ? "mt-2" : "hidden"}>
                <ul id={listId} role="listbox" aria-label={COPY.listLabel} className={visible.length > 0 ? "overflow-hidden rounded-xl bg-[#FFFFFF0A]" : "hidden"}>
                    {visible.map((m, i) => (
                        <li
                            key={m.slug} id={`${uid}-opt-${i}`} role="option" aria-selected={i === cursor} onClick={() => choose(m)} data-testid={`${tid}-option-${m.slug}`}
                            className={`flex min-h-[52px] cursor-pointer items-center gap-2 px-3.5 py-2 active:bg-[#FFFFFF14] ${i ? "border-t border-[#FFFFFF14]" : ""} ${i === cursor ? "bg-[#FFFFFF14]" : ""}`}
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px] font-medium leading-tight">{labels[i]}</span>
                                {mountainHitWhere(m) && <span className="mt-1 block truncate text-[12.5px] tabular-nums leading-tight text-[#F4EFE399]">{mountainHitWhere(m)}</span>}
                            </span>
                            {m.kfs100 && <Badge />}
                        </li>
                    ))}
                </ul>
                {options.length > shown && (
                    <button
                        type="button" onClick={() => setShown(shown + step)} data-testid={`${tid}-more`}
                        className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-[#FFFFFF14] text-[14px] font-medium tabular-nums text-[#F4EFE3] outline-none focus-visible:ring-2 focus-visible:ring-[#F28C6A] active:bg-[#FFFFFF24]"
                    >
                        {(options.length - shown).toLocaleString("en-US")}{COPY.more}
                    </button>
                )}
            </div>
        </div>
    );
}

/** 산악회 방의 '산 보내기' — 고른 산의 주소만 넘긴다(창은 부르는 쪽이 닫는다) */
export function MountainCardPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; onPick: (slug: string) => void }) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            {/* 찾는 칸에 자판이 떠도 창이 밀리지 않게 높이를 고정하고 목록만 스크롤한다(매장 고르기 StorePicker 와 같은 틀) */}
            <SheetContent
                side="bottom" hideClose data-track-as="hiking-chat-mountain-picker" data-testid="chat-mountain-picker"
                className="flex h-[82dvh] flex-col gap-0 rounded-t-2xl border-[#FFFFFF14] bg-[#0B1F26] p-0 text-[#F4EFE3] focus:outline-none"
            >
                <SheetHeader className="shrink-0 space-y-0 pl-5 pr-2 pt-3 text-left">
                    <div className="flex items-center justify-between gap-3">
                        <SheetTitle className="text-[17px] font-semibold text-[#F4EFE3]">{PICKER.title}</SheetTitle>
                        <button
                            type="button" onClick={() => onOpenChange(false)} aria-label={PICKER.close} title={PICKER.close} data-testid="chat-mountain-close"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#F4EFE3B3] outline-none focus-visible:ring-2 focus-visible:ring-[#F28C6A] active:bg-[#FFFFFF14]"
                        >
                            <LucideX className="h-4 w-4" />
                        </button>
                    </div>
                    <SheetDescription className="pr-3 text-[13px] leading-snug text-[#F4EFE399] break-keep">{PICKER.desc}</SheetDescription>
                </SheetHeader>
                <div className="flex min-h-0 flex-1 flex-col px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
                    <MountainSearchBox fill step={SHEET_STEP} tid="chat-mountain" idle={COPY.idle} onChoose={(m) => { onPick(m.slug); }} />
                </div>
            </SheetContent>
        </Sheet>
    );
}

/**
 * 투표 만들기 창의 '산으로 보기 채우기' — options 는 창의 보기 칸(빈 칸 포함), onFill 은 새 보기 칸.
 * 보기가 가득 차면 찾는 칸을 접고 그 까닭만 적는다.
 */
export function PollMountainFill({ options, maxOptions, optionMax, onFill }: { options: string[]; maxOptions: number; optionMax: number; onFill: (next: string[]) => void }) {
    const uid = useId();
    // 우리가 넣은 산 — 같은 이름의 산이 또 들어올 때 앞의 보기에도 시군을 붙이려고 기억한다(창이 닫히면 잊는다)
    const [picked, setPicked] = useState<PollMountainPick[]>([]);
    const room = pollMountainRoom(options, maxOptions);
    const choose = (m: MountainHit) => {
        const r = addPollMountain(options, picked, m, { maxOptions, optionMax });
        if (!r.ok) return { ok: false, note: pollMountainFailNote(r.reason, maxOptions) };
        setPicked(r.picked);
        onFill(r.options);
        return { ok: true, note: pollMountainAddedNote(r.label, pollMountainRoom(r.options, maxOptions)) };
    };
    return (
        <div
            role="group" aria-labelledby={`${uid}-head`}
            className="rounded-2xl bg-[#0E2A33] px-3.5 py-3.5 text-[#F4EFE3]" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF14" }}
            data-track-as="hiking-poll-mountain" data-testid="poll-mountain-fill" data-room={room}
        >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p id={`${uid}-head`} className="text-[14px] font-semibold tracking-tight">{POLL.title}</p>
                <span className="text-[12.5px] text-[#F6D9A8] break-keep">{POLL.aside}</span>
            </div>
            {room > 0 ? (
                <div className="mt-2.5"><MountainSearchBox step={POLL_STEP} tid="poll-mountain" idle={POLL.idle} onChoose={choose} /></div>
            ) : (
                <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE3B3] break-keep" role="status" data-testid="poll-mountain-full">{pollMountainFullNote(maxOptions)}</p>
            )}
        </div>
    );
}
