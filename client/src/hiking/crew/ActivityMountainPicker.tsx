/**
 * 산악회 일정 만들기의 '산 고르기'(2026-10-13 오너: "크루에 정모 및 장소 입력에 산 주소가 자동 입력되어도 좋을 듯").
 *
 * 공용 만들기 창(components/hiq/CreateActivityDialog)의 '모이는 곳' 바로 위에 놓이는 등산의 조각 — 산악회일 때만 불러 온다.
 * 산 이름을 적으면 전국의 산에서 찾아 보여 주고, 고르면 '모이는 곳'과 비어 있는 모임명을 채운다(무엇을 채울지는 shared/crewMountain).
 * 고른 산은 일정에 저장되지 않는다 — 칸을 채우는 일까지다(shared/crewMountain 머리말).
 *
 *  · 찾기는 공개 목록(GET /api/hiq/hiking/mountains?q=)에 묻는다. **조회 훅을 쓰지 않는다** — 앱의 조회 캐시는 기기에 일주일 남는데
 *    (lib/queryClient 의 저장), 한 글자 검색의 답은 산 천 곳이라 몇 번만 쳐도 기기 저장소가 찬다. 그때그때 받아 여섯 가지만 추려
 *    이 조각이 떠 있는 동안의 메모리에만 둔다(산 근처 맛집 MountainNearbyPlaces 와 같은 길).
 *  · 글자 칸은 만들기 창의 form 안에 있다 — Enter 가 일정을 올려 버리지 않게 막고, 단추는 전부 type="button" 이다.
 *  · 같은 이름의 산은 시군을 붙여 가른다("백운산(포천)"). 이름 뒤에 시군을 이어 적으면 좁혀진다("백운산 포천").
 *  · 누른 것의 기록에는 구역 이름만 남긴다(data-track-as — 친 글 · 고른 산은 남기지 않는다).
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지. 글자 그림(이모지)을 쓰지 않는다.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LucideX } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import {
    ACTIVITY_MOUNTAIN_COPY as COPY, MOUNTAIN_OPTIONS_STEP, MOUNTAIN_SEARCH_WAIT_MS, clearFromMountain, fillFromMountain, mountainFillNote, mountainFoundNote,
    mountainOptionLabels, mountainOptionWhere, pickMountainOptions, readMountainSearch, splitMountainQuery,
    type ActivityFields, type ActivityMountain, type PickedMountain,
} from "@shared/crewMountain";
import { mountainsKey } from "../lib/api";

interface Props {
    /** 고른 산(과, 그때 모임명도 우리가 채웠는지) — 없으면 찾는 칸을 보여 준다. 창이 들고 있다(창이 다시 열리면 비운다) */
    picked: PickedMountain | null;
    /** 지금 창의 두 칸(모임명 · 모이는 곳)에 적힌 글 */
    read: () => ActivityFields;
    /** 두 칸에 넣을 글과 새로 고른 산(지웠으면 null) — 창이 칸에 넣는다 */
    onFill: (fields: ActivityFields, picked: PickedMountain | null) => void;
}

type Answer = { list: ActivityMountain[]; capped: boolean };
type Found = Answer & { q: string; state: "loading" | "done" | "error" };
/** 받아 둔 답을 몇 가지 검색어까지 들고 있을까 — 지웠다 다시 칠 때 다시 묻지 않을 만큼 */
const HOLD_MAX = 12;

const Badge = () => <span className="shrink-0 rounded-full border border-[#F6D9A866] px-2 py-0.5 text-[12px] leading-none text-[#F6D9A8]">{COPY.badge}</span>;

export function ActivityMountainPicker({ picked, read, onFill }: Props) {
    const chosen = picked?.mountain ?? null;
    const uid = useId();
    const listId = `${uid}-list`;
    const [text, setText] = useState("");
    const { q, rest } = useMemo(() => splitMountainQuery(text), [text]);
    const [found, setFound] = useState<Found | null>(null);
    const [shown, setShown] = useState(MOUNTAIN_OPTIONS_STEP);
    const [active, setActive] = useState(-1);
    const held = useRef(new Map<string, Answer>());

    // 글자를 멈추면 찾는다. 기다리는 동안에는 앞서 받은 답을 지금의 글로 걸러 보여 준다(목록이 깜박이지 않게)
    useEffect(() => {
        if (chosen || !q) return;
        const hit = held.current.get(q);
        if (hit) { setFound({ q, state: "done", ...hit }); return; }
        const ctl = new AbortController();
        const timer = setTimeout(() => {
            setFound((f) => ({ q, state: "loading", list: f?.list ?? [], capped: false }));
            apiRequest(mountainsKey({ q })[0], { signal: ctl.signal })
                .then((res) => {
                    if (ctl.signal.aborted) return;
                    const answer = readMountainSearch(res);
                    if (held.current.size >= HOLD_MAX) { const oldest = held.current.keys().next().value; if (oldest !== undefined) held.current.delete(oldest); }
                    held.current.set(q, answer);
                    setFound({ q, state: "done", ...answer });
                })
                .catch(() => { if (!ctl.signal.aborted) setFound({ q, state: "error", list: [], capped: false }); });
        }, MOUNTAIN_SEARCH_WAIT_MS);
        return () => { clearTimeout(timer); ctl.abort(); };
    }, [q, chosen]);

    // rest 는 친 글이 바뀔 때만 새로 만들어진다(위의 useMemo) — 그대로 의존값으로 쓴다
    const options = useMemo(() => (q && found ? pickMountainOptions(found.list, q, rest) : []), [found, q, rest]);
    const visible = useMemo(() => options.slice(0, shown), [options, shown]);
    const labels = useMemo(() => mountainOptionLabels(visible), [visible]);
    const waiting = !!q && (!found || found.q !== q || found.state === "loading");
    const failed = !!q && !waiting && found?.state === "error";
    // 검색어가 바뀌면 처음 여덟 곳으로 돌아간다(끝에 빈칸만 더한 것은 바뀐 것이 아니다)
    const restKey = rest.join(" ");
    useEffect(() => { setShown(MOUNTAIN_OPTIONS_STEP); }, [q, restKey]);
    // 목록이 바뀌면(새 답이 오면 순서가 달라진다) 자판으로 짚어 둔 줄을 푼다 — 같은 자리의 다른 산이 골라지면 안 된다
    useEffect(() => { setActive(-1); }, [options]);
    useEffect(() => { if (active >= 0) document.getElementById(`${uid}-opt-${active}`)?.scrollIntoView({ block: "nearest" }); }, [active, uid]);

    // 고르거나 지운 뒤 — 사라진 칸에 있던 초점을 다음에 쓸 자리로 옮긴다(자판으로 쓰는 사람이 길을 잃지 않게). 처음 뜰 때는 옮기지 않는다
    const input = useRef<HTMLInputElement>(null);
    const clearBtn = useRef<HTMLButtonElement>(null);
    const moved = useRef(false);
    useEffect(() => {
        if (!moved.current) return;
        moved.current = false;
        (chosen ? clearBtn.current : input.current)?.focus();
    }, [chosen]);

    // 무엇을 채우고 무엇을 남길지는 shared/crewMountain 이 정한다 — 모이는 곳은 늘, 모임명은 비어 있을 때만. 지울 때는 우리가 채운 글만
    const choose = (m: ActivityMountain) => {
        moved.current = true;
        setText("");
        setFound(null);
        const next = fillFromMountain(read(), m);
        onFill(next.fields, next.picked);
    };
    const clear = () => {
        if (!picked) return;
        moved.current = true;
        onFill(clearFromMountain(read(), picked), null);
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            // 이 칸은 만들기 창의 form 안에 있다 — 그대로 두면 Enter 가 일정을 올린다
            e.preventDefault();
            // 한글을 치는 도중의 Enter 는 글자를 맺는 것이다
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            // 짚어 둔 줄을 고른다. 짚지 않았어도 찾은 산이 하나뿐이면 그 산이다(답을 기다리는 중의 옛 목록은 믿지 않는다)
            const m = visible[active] ?? (options.length === 1 && !waiting ? options[0] : undefined);
            if (m) choose(m);
            return;
        }
        if (visible.length === 0) return;
        if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % visible.length); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i <= 0 ? visible.length - 1 : i - 1)); }
    };

    return (
        <div
            role="group" aria-labelledby={`${uid}-head`}
            className="rounded-2xl bg-[#0E2A33] px-3.5 py-3.5 text-[#F4EFE3]" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF14" }}
            data-track-as="hiking-activity-mountain" data-testid="activity-mountain-picker" data-state={chosen ? "chosen" : "search"}
        >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p id={`${uid}-head`} className="text-[14px] font-semibold tracking-tight">{chosen ? COPY.chosen : COPY.title}</p>
                {!chosen && <span className="text-[12.5px] text-[#F6D9A8] break-keep">{COPY.aside}</span>}
            </div>

            {chosen ? (
                <>
                    <div className="mt-2.5 flex items-center gap-1 rounded-xl bg-[#FFFFFF0F] pl-3.5 pr-0.5" data-testid="activity-mountain-chosen" data-slug={chosen.slug}>
                        <div className="min-w-0 flex-1 py-2.5">
                            <p className="flex items-center gap-2">
                                <span className="min-w-0 truncate text-[15px] font-semibold leading-tight">{chosen.name}</span>
                                {chosen.kfs100 && <Badge />}
                            </p>
                            {mountainOptionWhere(chosen) && <p className="mt-1 truncate text-[12.5px] tabular-nums leading-tight text-[#F4EFE399]">{mountainOptionWhere(chosen)}</p>}
                        </div>
                        <button
                            ref={clearBtn} type="button" onClick={clear} aria-label={COPY.clear} title={COPY.clear} data-testid="activity-mountain-clear"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#F4EFE3B3] outline-none focus-visible:ring-2 focus-visible:ring-[#F28C6A] active:bg-[#FFFFFF14]"
                        >
                            <LucideX className="h-4 w-4" />
                        </button>
                    </div>
                    <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE3B3] break-keep" role="status" data-testid="activity-mountain-note">{mountainFillNote(!!picked?.titleOurs)}</p>
                </>
            ) : (
                <>
                    <input
                        ref={input} type="text" inputMode="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={60}
                        value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
                        placeholder={COPY.placeholder} aria-label={COPY.searchLabel} data-testid="activity-mountain-search"
                        role="combobox" aria-autocomplete="list" aria-expanded={visible.length > 0} aria-controls={listId} aria-activedescendant={active >= 0 && visible[active] ? `${uid}-opt-${active}` : undefined}
                        className="mt-2.5 h-12 w-full rounded-xl border border-[#FFFFFF1F] bg-[#FFFFFF0A] px-4 text-[15px] text-[#F4EFE3] outline-none placeholder:text-[#F4EFE366] focus:border-[#F28C6A]"
                    />
                    <ul id={listId} role="listbox" aria-label={COPY.listLabel} className={visible.length > 0 ? "mt-2 overflow-hidden rounded-xl bg-[#FFFFFF0A]" : "hidden"}>
                        {visible.map((m, i) => (
                            <li
                                key={m.slug} id={`${uid}-opt-${i}`} role="option" aria-selected={i === active} onClick={() => choose(m)} data-testid={`activity-mountain-option-${m.slug}`}
                                className={`flex min-h-[52px] cursor-pointer items-center gap-2 px-3.5 py-2 active:bg-[#FFFFFF14] ${i ? "border-t border-[#FFFFFF14]" : ""} ${i === active ? "bg-[#FFFFFF14]" : ""}`}
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[15px] font-medium leading-tight">{labels[i]}</span>
                                    {mountainOptionWhere(m) && <span className="mt-1 block truncate text-[12.5px] tabular-nums leading-tight text-[#F4EFE399]">{mountainOptionWhere(m)}</span>}
                                </span>
                                {m.kfs100 && <Badge />}
                            </li>
                        ))}
                    </ul>
                    {options.length > shown && (
                        <button
                            type="button" onClick={() => setShown(shown + MOUNTAIN_OPTIONS_STEP)} data-testid="activity-mountain-more"
                            className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-[#FFFFFF14] text-[14px] font-medium tabular-nums text-[#F4EFE3] outline-none focus-visible:ring-2 focus-visible:ring-[#F28C6A] active:bg-[#FFFFFF24]"
                        >
                            {(options.length - shown).toLocaleString("en-US")}{COPY.more}
                        </button>
                    )}
                    <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE399] break-keep" role="status" aria-live="polite" data-testid="activity-mountain-status">
                        {!q ? COPY.idle : failed ? COPY.error : waiting ? COPY.loading : options.length > 0 ? mountainFoundNote(options.length, !!found?.capped) : COPY.empty}
                    </p>
                </>
            )}
        </div>
    );
}
