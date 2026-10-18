/**
 * 산악회 일정 만들기의 '산 고르기'(2026-10-13 오너: "크루에 정모 및 장소 입력에 산 주소가 자동 입력되어도 좋을 듯").
 *
 * 공용 만들기 창(components/hiq/CreateActivityDialog)의 '모이는 곳' 바로 위에 놓이는 등산의 조각 — 산악회일 때만 불러 온다.
 * 산 이름을 적으면 전국의 산에서 찾아 보여 주고, 고르면 '모이는 곳'과 비어 있는 모임명을 채운다(무엇을 채울지는 shared/crewMountain).
 * 고른 산의 주소는 일정에 남는다(창이 mountainSlug 로 보낸다 — shared/crewMountain 머리말). 고치기 창에서는 저장해 둔 주소로 '고른 산'을 되살린다.
 * 산을 고르면 그 산의 코스가 칩으로 뜬다 — 고르면 상세 내용에 한 줄을 적는다(비어 있거나 우리가 적은 글 그대로일 때만). 고른 코스는 남기지 않는다.
 * 같은 파일의 ActivityMountainMarks 는 일정 카드(components/hiq/view/ClubActivityList)에 놓이는 줄이다 — '산 정보 보기'와 '함께 정상 인증 N명'.
 *
 *  · 찾기는 공개 목록(GET /api/hiq/hiking/mountains?q=)에, 코스 · 되살리기는 산 한 곳(GET /api/hiq/hiking/mountains/:slug)에 묻는다.
 *    **조회 훅을 쓰지 않는다** — 앱의 조회 캐시는 기기에 일주일 남는데(lib/queryClient 의 저장), 한 글자 검색의 답은 산 천 곳이고
 *    산 한 곳의 답에는 코스의 선이 통째로 들어 있어 몇 번만 쳐도 기기 저장소가 찬다. 그때그때 받아 필요한 것만 추려
 *    이 조각이 떠 있는 동안의 메모리에만 둔다(산 근처 맛집 MountainNearbyPlaces 와 같은 길).
 *  · 글자 칸은 만들기 창의 form 안에 있다 — Enter 가 일정을 올려 버리지 않게 막고, 단추는 전부 type="button" 이다.
 *  · 같은 이름의 산은 시군을 붙여 가른다("백운산(포천)"). 이름 뒤에 시군을 이어 적으면 좁혀진다("백운산 포천").
 *  · 누른 것의 기록에는 구역 이름만 남긴다(data-track-as — 친 글 · 고른 산은 남기지 않는다).
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지. 글자 그림(이모지)을 쓰지 않는다.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "wouter";
import { LucideX } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import {
    ACTIVITY_COURSES_STEP, ACTIVITY_MOUNTAIN_COPY as COPY, MOUNTAIN_OPTIONS_STEP, MOUNTAIN_SEARCH_WAIT_MS, activityCourseChip, activityCourseLine, activityMountainSlug,
    clearCourseLine, clearFromMountain, fillCourseLine, fillFromMountain, mountainFillNote, mountainFoundNote, mountainOptionLabels, mountainOptionWhere,
    pickMountainOptions, readMountainDetail, readMountainSearch, splitMountainQuery, summitTogetherText,
    type ActivityCourse, type ActivityFields, type ActivityMountain, type PickedMountain,
} from "@shared/crewMountain";
import { hikingMountainPath } from "@shared/hikingMountains";
import { mountainKey, mountainsKey } from "../lib/api";

interface Props {
    /** 고른 산(과, 그때 모임명도 우리가 채웠는지) — 없으면 찾는 칸을 보여 준다. 창이 들고 있다(창이 다시 열리면 비운다) */
    picked: PickedMountain | null;
    /** 고치기 창이 열릴 때 일정에 저장돼 있던 산의 주소 — 이 주소로 '고른 산'을 되살린다. 산을 고르거나 지우면 창이 비운다 */
    storedSlug?: string | null;
    /** 지금 창의 두 칸(모임명 · 모이는 곳)에 적힌 글 */
    read: () => ActivityFields;
    /** 두 칸에 넣을 글과 새로 고른 산(지웠으면 null) — 창이 칸에 넣는다 */
    onFill: (fields: ActivityFields, picked: PickedMountain | null) => void;
    /** 저장해 둔 산을 되살렸다 — 칸의 글은 건드리지 않는다 */
    onRestore: (picked: PickedMountain) => void;
    /** 지금 창의 상세 내용에 적힌 글 */
    readNote: () => string;
    /** 상세 내용에 넣을 글(고른 코스의 한 줄, 또는 그 줄을 지운 빈 글) — 창이 칸에 넣는다 */
    onNote: (next: string) => void;
}

type Answer = { list: ActivityMountain[]; capped: boolean };
type Found = Answer & { q: string; state: "loading" | "done" | "error" };
/** 산 한 곳의 답에서 추린 것 — 그 산(되살릴 때 쓴다)과 고를 수 있는 코스 */
type Detail = { slug: string; state: "loading" | "done" | "error"; mountain: ActivityMountain | null; courses: ActivityCourse[] };
/** 받아 둔 답을 몇 가지 검색어까지 들고 있을까 — 지웠다 다시 칠 때 다시 묻지 않을 만큼 */
const HOLD_MAX = 12;

const Badge = () => <span className="shrink-0 rounded-full border border-[#F6D9A866] px-2 py-0.5 text-[12px] leading-none text-[#F6D9A8]">{COPY.badge}</span>;

export function ActivityMountainPicker({ picked, storedSlug, read, onFill, onRestore, readNote, onNote }: Props) {
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

    // 산 한 곳의 답 — 고른 산의 코스, 그리고 고치기 창이 저장해 둔 산(storedSlug)을 되살릴 때의 그 산. 한 번 받아 둘 다에 쓴다.
    // 조회 훅을 거치지 않는다(머리말) — 코스의 선은 버리고 칩에 쓸 값만 이 조각의 메모리에 둔다.
    const restoreSlug = chosen ? null : activityMountainSlug(storedSlug);
    const detailSlug = chosen?.slug ?? restoreSlug;
    const [detail, setDetail] = useState<Detail | null>(null);
    useEffect(() => {
        if (!detailSlug) { setDetail(null); return; }
        const ctl = new AbortController();
        setDetail({ slug: detailSlug, state: "loading", mountain: null, courses: [] });
        apiRequest(mountainKey(detailSlug)[0], { signal: ctl.signal })
            .then((res) => { if (!ctl.signal.aborted) setDetail({ slug: detailSlug, state: "done", ...readMountainDetail(res) }); })
            .catch(() => { if (!ctl.signal.aborted) setDetail({ slug: detailSlug, state: "error", mountain: null, courses: [] }); });
        return () => ctl.abort();
    }, [detailSlug]);
    const mine = detail && detail.slug === detailSlug ? detail : null;
    // 저장해 둔 산을 받았으면 '고른 산'으로 올린다 — 칸의 글은 건드리지 않는다. 받지 못했으면 찾는 칸을 그대로 둔다(창은 저장해 둔 주소를 그대로 보낸다)
    const restoredMountain = restoreSlug && mine?.state === "done" ? mine.mountain : null;
    useEffect(() => {
        if (restoredMountain) onRestore({ mountain: restoredMountain, titleOurs: false, restored: true });
        // onRestore 는 창이 그릴 때마다 새로 만든다 — 되살릴 산이 정해졌을 때 한 번만 부른다
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restoredMountain]);
    const restoring = !!restoreSlug && (!mine || mine.state === "loading" || !!restoredMountain);

    // 고른 코스 — 상세 내용에 우리가 적은 줄을 같이 들고 있다(그 줄 그대로일 때만 바꾸거나 지운다). 산이 바뀌면 처음으로
    const courses = chosen && mine?.state === "done" ? mine.courses : [];
    const [course, setCourse] = useState<{ id: string; line: string } | null>(null);
    const [courseKept, setCourseKept] = useState(false);
    const [allCourses, setAllCourses] = useState(false);
    const chosenSlug = chosen?.slug ?? null;
    useEffect(() => { setCourse(null); setCourseKept(false); setAllCourses(false); }, [chosenSlug]);
    const shownCourses = allCourses ? courses : courses.slice(0, ACTIVITY_COURSES_STEP);
    const writeNote = (next: string) => { if (next !== readNote()) onNote(next); };
    const pickCourse = (c: ActivityCourse) => {
        // 고른 코스를 다시 누르면 푼다 — 우리가 적은 줄 그대로면 비운다
        if (course?.id === c.id) {
            writeNote(clearCourseLine(readNote(), course.line));
            setCourse(null);
            setCourseKept(false);
            return;
        }
        const line = activityCourseLine(c);
        const next = fillCourseLine(readNote(), line, course?.line ?? null);
        if (next.filled) writeNote(next.description);
        // 회원이 적어 둔 글이 있으면 건드리지 않는다 — 고른 표시도 하지 않는다(적히지 않았다)
        setCourse(next.filled ? { id: c.id, line } : null);
        setCourseKept(!next.filled);
    };

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
        // 고른 코스의 줄도 우리가 적은 그대로면 같이 지운다
        if (course) writeNote(clearCourseLine(readNote(), course.line));
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
            data-track-as="hiking-activity-mountain" data-testid="activity-mountain-picker" data-state={chosen ? "chosen" : restoring ? "restoring" : "search"}
        >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p id={`${uid}-head`} className="text-[14px] font-semibold tracking-tight">{chosen || restoring ? COPY.chosen : COPY.title}</p>
                {!chosen && !restoring && <span className="text-[12.5px] text-[#F6D9A8] break-keep">{COPY.aside}</span>}
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
                    <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE3B3] break-keep" role="status" data-testid="activity-mountain-note">{picked?.restored ? COPY.restored : mountainFillNote(!!picked?.titleOurs)}</p>

                    {/* 코스 고르기 — 이 산에 받아 둔 코스가 있을 때만. 고르면 상세 내용에 한 줄을 적는다(저장하는 것은 그 글뿐이다) */}
                    {mine?.state === "loading" && <p className="mt-3 border-t border-[#FFFFFF14] pt-3 text-[12.5px] leading-snug text-[#F4EFE399]" data-testid="activity-mountain-courses-loading">{COPY.courseLoading}</p>}
                    {courses.length > 0 && (
                        <div role="group" aria-labelledby={`${uid}-course`} className="mt-3 border-t border-[#FFFFFF14] pt-3" data-testid="activity-mountain-courses" data-count={courses.length}>
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                                <p id={`${uid}-course`} className="text-[14px] font-semibold tracking-tight">{COPY.courseTitle}</p>
                                <span className="text-[12.5px] text-[#F6D9A8] break-keep">{COPY.courseAside}</span>
                            </div>
                            <ul className="mt-2.5 flex flex-wrap gap-1.5">
                                {shownCourses.map((c) => (
                                    <li key={`course-${c.id}`}>
                                        <button
                                            type="button" aria-pressed={course?.id === c.id} onClick={() => pickCourse(c)} data-testid={`activity-mountain-course-${c.id}`}
                                            className={`flex h-11 items-center rounded-full px-3.5 text-[13.5px] font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[#F28C6A] ${course?.id === c.id ? "bg-[#F28C6A] text-[#0E2A33]" : "bg-[#FFFFFF14] text-[#F4EFE3] active:bg-[#FFFFFF24]"}`}
                                        >
                                            {activityCourseChip(c)}
                                        </button>
                                    </li>
                                ))}
                                {courses.length > shownCourses.length && (
                                    <li key="more">
                                        <button
                                            type="button" onClick={() => setAllCourses(true)} data-testid="activity-mountain-courses-more"
                                            className="flex h-11 items-center rounded-full border border-[#FFFFFF1F] px-3.5 text-[13.5px] font-medium tabular-nums text-[#F4EFE3B3] outline-none focus-visible:ring-2 focus-visible:ring-[#F28C6A] active:bg-[#FFFFFF14]"
                                        >
                                            {(courses.length - shownCourses.length).toLocaleString("en-US")}{COPY.courseMore}
                                        </button>
                                    </li>
                                )}
                            </ul>
                            {(course || courseKept) && (
                                <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE3B3] break-keep" role="status" aria-live="polite" data-testid="activity-mountain-course-note" data-filled={course ? "1" : "0"}>
                                    {course ? COPY.courseFilled : COPY.courseKept}
                                </p>
                            )}
                        </div>
                    )}
                </>
            ) : restoring ? (
                <p className="mt-2.5 flex min-h-[58px] items-center rounded-xl bg-[#FFFFFF0F] px-3.5 text-[13.5px] text-[#F4EFE3B3]" role="status" data-testid="activity-mountain-restoring">{COPY.restoring}</p>
            ) : (
                <>
                    <input
                        ref={input} type="text" inputMode="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={60}
                        value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
                        placeholder={COPY.placeholder} aria-label={COPY.searchLabel} data-testid="activity-mountain-search"
                        role="combobox" aria-autocomplete="list" aria-expanded={visible.length > 0} aria-controls={listId} aria-activedescendant={active >= 0 && visible[active] ? `${uid}-opt-${active}` : undefined}
                        className="mt-2.5 h-12 w-full rounded-xl border border-[#FFFFFF1F] bg-[#FFFFFF0A] px-4 text-[15px] text-[#F4EFE3] outline-none placeholder:text-[#F4EFE399] focus:border-[#F28C6A]"
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

/**
 * 일정 카드에 놓이는 줄(2026-10-13) — 공용 카드(components/hiq/view/ClubActivityList)가 **산악회 일정일 때만** 불러 온다.
 *  · slug 가 있으면 '산 정보 보기' — 그 산의 화면으로 간다(누른 것의 기록에는 구역 이름만 남는다).
 *  · together 가 1 이상이면 '함께 정상 인증 N명' — 그 일정의 참석자 가운데 그날 그 산의 정상에서 인증한 사람 수. **수만 보여 준다(누구인지는 받지도 않는다).**
 * 지난 일정의 줄은 통째로 단추라 그 안에 링크를 둘 수 없다 — 거기서는 slug 없이 불러 칩만 그린다.
 * 공용 카드 위에 놓이지만 색은 등산의 것(리터럴)이라 제 바탕을 갖는다. 둘 다 없으면 아무것도 그리지 않는다.
 */
export function ActivityMountainMarks({ slug, together }: { slug?: string | null; together?: unknown }) {
    const to = activityMountainSlug(slug);
    const count = summitTogetherText(together);
    if (!to && !count) return null;
    return (
        <span className="flex flex-wrap items-center gap-1.5" data-testid="activity-mountain-marks">
            {to && (
                // 누르는 자리는 44px, 보이는 알약은 36px — 카드의 줄 간격을 벌리지 않게 위아래로 겹쳐 둔다
                <Link href={hikingMountainPath(to)} data-track-as="hiking-activity-mountain-link" data-testid="activity-mountain-link" className="group -my-1 inline-flex min-h-11 items-center outline-none">
                    <span
                        className="inline-flex h-9 items-center gap-1 rounded-full bg-[#0E2A33] pl-3.5 pr-2.5 text-[13px] font-medium text-[#F4EFE3] group-focus-visible:ring-2 group-focus-visible:ring-[#F28C6A] group-active:opacity-80"
                        style={{ boxShadow: "inset 0 0 0 1px #FFFFFF1F" }}
                    >
                        {COPY.link}
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M5 3 L9 7 L5 11" stroke="#F28C6A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                </Link>
            )}
            {count && (
                <span className="inline-flex h-7 items-center rounded-full bg-[#F6D9A8] px-2.5 text-[12.5px] font-medium tabular-nums text-[#0E2A33]" data-testid="activity-summit-together">
                    {count}
                </span>
            )}
        </span>
    );
}
