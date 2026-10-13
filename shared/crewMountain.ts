/**
 * 산악회 일정의 '산 고르기'(2026-10-13 오너: "크루에 정모 및 장소 입력에 산 주소가 자동 입력되어도 좋을 듯").
 *
 * 산악회 회원이 일정을 만들 때 산을 고르면 '모이는 곳'에 그 산의 자리가, 비어 있는 모임명에 "<산> 산행"이 채워진다.
 * 화면은 client/src/hiking/crew/ActivityMountainPicker — 만들기 창(CreateActivityDialog)이 산악회일 때만 불러 온다.
 * 만들기 창은 이 파일의 **타입만** 임포트한다(import type) — 셈은 불러 온 조각이 한다. 그래야 등산의 규칙(shared/hikingMountains)이
 * 당구 · 골프 회원도 받는 공용 묶음에 실리지 않는다. 골프 크루의 만들기 창(CreateGolfActivityModal)은 이 파일을 모른다.
 *
 * ── 정해 둔 것 ──────────────────────────────────────────────────────
 *  · 모이는 곳의 글은 "강원 양양군 설악산" — 주소의 순서(시도 · 시군구 · 산)를 **꾸밈 글자 없이 빈칸으로만** 잇는다.
 *    일정 카드의 '지도'가 이 칸의 글을 통째로 지도 검색어로 쓰기 때문이다(ClubActivityList → shared/storeMeta mapLink).
 *    가운뎃점이 끼면 검색이 어떻게 될지 재 보지 못했고, 괄호는 mapLink 가 그 뒤를 잘라 내 같은 이름의 다른 산이 나온다.
 *    산 이름이 끝에 오는 것도 일부러다 — 이 칸은 '모이는 곳'이라 회원이 만나는 자리를 이어 적는다("… 설악산 오색 탐방지원센터 앞").
 *  · 모임명은 **비어 있을 때만** 권한다. 회원이 적은 이름은 건드리지 않는다.
 *  · 고른 산을 지우면 우리가 채운 글만 지운다 — 회원이 손댄 칸은 그대로 둔다.
 *  · **고른 산은 일정에 남는다**(2026-10-13 · hiq_crew_activities.mountain_slug — migrations/crew_activity_mountain.sql). 남기는 것은 산의 주소(slug)
 *    한 칸뿐이다: 창이 mountainSlug 로 보내고, 서버(routes/modules/crew)가 **산악회일 때만** 아래 activityMountainSlug 로 꼴을 보고 있는 산인지 확인해 적는다.
 *    당구 · 골프 크루의 일정에는 이 값을 보내도 버린다. 설명 끝에 붙여 두는 길은 쓰지 않는다(골프 투어 종료일에서 탈이 났다 — shared/crewActivity splitTourTrailer).
 *    그 칸으로 일정 카드의 '산 정보 보기', 고치기 창의 '고른 산', 지난 일정의 '함께 정상 인증 N명'을 그린다.
 *  · **고른 코스는 남지 않는다.** 코스를 고르면 상세 내용에 한 줄을 적어 줄 뿐이다 — 칸이 비어 있거나 우리가 앞서 적은 글 그대로일 때만.
 *  · '함께 정상 인증'은 **사람 수만** 센다. 누가 인증했는지는 서버의 답에도 화면에도 없다.
 *
 * 순수 함수만. 서버가 임포트할 수 있는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { duplicateNames, heightText, mountainLabel, mountainPlace } from "./hikingMountains.js";
import { courseFacts, courseShape } from "./hikingPage.js";

/** 산의 주소(slug) · 이름의 길이 상한 — 이보다 길면 우리 자료가 아니다 */
export const MOUNTAIN_SLUG_MAX = 80;
export const MOUNTAIN_NAME_MAX = 40;
/** 검색어의 길이 상한 — 서버(routes/modules/hiking GET /mountains)가 자르는 길이와 같다 */
export const MOUNTAIN_QUERY_MAX = 30;
/** 한 번에 보여 주는 산의 수 — '더 보기'로 이만큼씩 더 */
export const MOUNTAIN_OPTIONS_STEP = 8;
/** 글자를 멈춘 뒤 찾기까지 기다리는 시간 */
export const MOUNTAIN_SEARCH_WAIT_MS = 250;

/** 고를 수 있는 산 — 검색 답에서 이 여섯 가지만 꺼내 쓴다 */
export interface ActivityMountain {
    slug: string;
    name: string;
    sido: string | null;
    sigungu: string | null;
    heightM: number | null;
    /** 산림청 100대 명산인가 */
    kfs100: boolean;
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * 일정에 적어 둘 산의 주소(slug) — **서버가 받는 값의 검사**(routes/modules/crew 의 정모 만들기 · 고치기). 꼴이 어긋나면 null.
 * 글자여야 하고, 비어 있지 않고 80자 안이며 빈칸 · 빗금 · ? · # 이 없어야 한다(우리 주소는 그렇게 만들어진다 — hikingMountains assignMountainSlugs).
 * 꼴만 본다 — 그 주소의 산이 정말 있는지는 서버가 따로 본다(storage/hiking mountainBySlug).
 */
export function activityMountainSlug(raw: unknown): string | null {
    const slug = text(raw);
    return slug && slug.length <= MOUNTAIN_SLUG_MAX && !/[\s/\\?#]/.test(slug) ? slug : null;
}

/**
 * 받은 값 한 줄 → 고를 수 있는 산. 꼴이 어긋나면 null(목록에서 뺀다).
 * 주소(slug)의 꼴은 위의 activityMountainSlug 그대로다. 정해 둔 여섯 가지 말고는 아무것도 옮기지 않는다.
 */
export function toActivityMountain(raw: unknown): ActivityMountain | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const slug = activityMountainSlug(r.slug);
    const name = text(r.name);
    if (!slug) return null;
    if (!name || name.length > MOUNTAIN_NAME_MAX) return null;
    const h = typeof r.heightM === "number" && Number.isFinite(r.heightM) && r.heightM > 0 ? Math.round(r.heightM) : null;
    return { slug, name, sido: text(r.sido), sigungu: text(r.sigungu), heightM: h, kfs100: Array.isArray(r.lists) && r.lists.includes("kfs100") };
}

/**
 * 검색 답({ total, items }) → 고를 수 있는 산들. 꼴이 어긋난 줄 · 같은 주소가 두 번 온 줄은 뺀다.
 * capped 는 서버가 다 주지 못했다는 표시다(한 번에 천 곳까지 — "산" 한 글자면 넘는다). 그때는 이름을 더 적으라고 말한다.
 */
export function readMountainSearch(res: unknown): { list: ActivityMountain[]; capped: boolean } {
    const r = res && typeof res === "object" ? (res as { total?: unknown; items?: unknown }) : {};
    const items = Array.isArray(r.items) ? r.items : [];
    const seen = new Set<string>();
    const list: ActivityMountain[] = [];
    for (const it of items) {
        const m = toActivityMountain(it);
        if (!m || seen.has(m.slug)) continue;
        seen.add(m.slug);
        list.push(m);
    }
    return { list, capped: typeof r.total === "number" && r.total > items.length };
}

// ── 검색어 ────────────────────────────────────────────────────────────
/** 아직 글자가 되지 않은 낱자(ㅅ · ㅏ …) — 한글을 치는 도중에 잠깐 들어온다. 산 이름에는 없다 */
const LOOSE_JAMO = /[ㄱ-ㆎ]/g;

/**
 * 친 글 → 서버에 물을 이름(q)과 그 뒤의 낱말(rest).
 * 서버는 **이름으로만** 찾는다. 같은 이름의 산이 많아서("백운산"은 전국에 여럿이다) 뒤의 낱말로 시도 · 시군구를 좁힌다 — "백운산 포천".
 * 치는 도중의 낱자는 버린다: "설ㅇ"은 "설"로 본다(낱자째 물으면 '찾는 산이 없어요'가 깜박인다). 낱자뿐이면 묻지 않는다(q 가 빈다).
 */
export function splitMountainQuery(raw: string): { q: string; rest: string[] } {
    const words = String(raw ?? "").replace(LOOSE_JAMO, "").trim().split(/\s+/).filter(Boolean);
    return { q: (words[0] ?? "").slice(0, MOUNTAIN_QUERY_MAX), rest: words.slice(1) };
}

/**
 * 받은 산들을 고르기 좋게 — 이름에 q 가 든 산만(서버의 규칙과 같다), 뒤의 낱말이 이름 · 시도 · 시군구에 다 든 산만.
 * 순서는 이름이 q 와 같은 산, q 로 시작하는 산, 그 밖. 같은 무리 안에서는 받은 순서(명산 먼저 · 높은 순)를 지킨다.
 */
export function pickMountainOptions<T extends { name: string; sido?: string | null; sigungu?: string | null }>(items: readonly T[], q: string, rest: readonly string[] = []): T[] {
    const k = q.trim().toLowerCase();
    if (!k) return [];
    const more = rest.map((w) => w.toLowerCase());
    const grade = (name: string) => (name === k ? 0 : name.startsWith(k) ? 1 : 2);
    return items
        .map((m, i) => ({ m, i, name: m.name.toLowerCase() }))
        .filter((x) => x.name.includes(k))
        .filter((x) => { const hay = `${x.name} ${mountainPlace(x.m)} ${x.m.sido ?? ""} ${x.m.sigungu ?? ""}`.toLowerCase(); return more.every((w) => hay.includes(w)); })
        .sort((a, b) => grade(a.name) - grade(b.name) || a.i - b.i)
        .map((x) => x.m);
}

// ── 고르는 줄 ──────────────────────────────────────────────────────────
/** 한 화면에 같이 놓인 산들의 이름표 — 같은 이름이 있으면 시군을 붙인다("백운산(포천)"). 넘긴 순서 그대로 돌려준다 */
export function mountainOptionLabels(list: readonly { name: string; slug: string; sigungu?: string | null }[]): string[] {
    const dup = duplicateNames(list);
    return list.map((m) => mountainLabel(m, dup));
}
/** 이름 아래의 한 줄 — "경기 포천시 · 903m". 시군구가 없으면 시도만, 둘 다 없으면 높이만 */
export const mountainOptionWhere = (m: { sido?: string | null; sigungu?: string | null; heightM?: number | null }): string => [mountainPlace(m), heightText(m.heightM)].filter(Boolean).join(" · ");

// ── 채우기 ────────────────────────────────────────────────────────────
/** 모이는 곳에 채울 글 — "강원 양양군 설악산"(머리말). 시군구가 없으면 "강원 설악산", 자리를 모르면 산 이름만 */
export const activityMountainPlace = (m: { name: string; sido?: string | null; sigungu?: string | null }): string => [mountainPlace(m), m.name].filter(Boolean).join(" ");
/** 권하는 모임명 — "설악산 산행" */
export const activityMountainTitle = (m: { name: string }): string => `${m.name} 산행`;

/** 만들기 창의 두 칸 — 모임명 · 모이는 곳 */
export interface ActivityFields { title: string; place: string }
/**
 * 고른 산과, 그때 모임명도 우리가 채웠는지(지울 때 쓴다).
 * restored 는 고치기 창이 일정에 저장해 둔 산을 되살린 것이라는 표시다 — 그때는 아무 칸도 채우지 않았다(안내 글이 달라진다).
 */
export interface PickedMountain { mountain: ActivityMountain; titleOurs: boolean; restored?: boolean }

/**
 * 산을 골랐을 때 두 칸에 들어갈 글. 모이는 곳은 늘 그 산의 자리로 바꾼다(고른 것이 곧 채워 달라는 말이다).
 * 모임명은 비어 있을 때만 권한다 — 회원이 적어 둔 이름은 그대로다.
 */
export function fillFromMountain(now: ActivityFields, m: ActivityMountain): { fields: ActivityFields; picked: PickedMountain } {
    const titleOurs = now.title.trim() === "";
    return { fields: { place: activityMountainPlace(m), title: titleOurs ? activityMountainTitle(m) : now.title }, picked: { mountain: m, titleOurs } };
}

/**
 * 고른 산을 지웠을 때 두 칸에 남길 글 — 우리가 채운 글 그대로인 칸만 비운다. 회원이 손댄 칸은 그대로다.
 * 모임명은 우리가 채웠을 때만(titleOurs) 본다: 회원이 손수 "설악산 산행"이라 적어 둔 것을 지우면 안 된다.
 */
export function clearFromMountain(now: ActivityFields, picked: PickedMountain): ActivityFields {
    const m = picked.mountain;
    return {
        place: now.place.trim() === activityMountainPlace(m) ? "" : now.place,
        title: picked.titleOurs && now.title.trim() === activityMountainTitle(m) ? "" : now.title,
    };
}

// ── 코스 고르기 ────────────────────────────────────────────────────────
/** 한 번에 보여 주는 코스의 수 — 그보다 많으면 '더 보기'로 전부 */
export const ACTIVITY_COURSES_STEP = 6;
/** 한 산에서 받는 코스의 상한 — 이보다 많으면 우리 자료가 아니다 */
export const ACTIVITY_COURSES_MAX = 60;

/** 고를 수 있는 코스 — 산 화면의 답(courseList)에서 이 여섯 가지만 꺼내 쓴다. 길의 선(line)은 들고 있지 않는다 */
export interface ActivityCourse {
    id: string;
    /** 산 화면의 "코스 N"과 같은 번호 */
    seq: number;
    km: number;
    gainM: number;
    loop: boolean;
    summitKm: number | null;
}

const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** 받은 코스 한 줄 → 고를 수 있는 코스. 번호 · 거리가 없거나 어긋나면 null(칩을 그리지 않는다) */
export function toActivityCourse(raw: unknown): ActivityCourse | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === "number" && Number.isFinite(r.id) ? String(r.id) : text(r.id);
    const seq = finite(r.seq), km = finite(r.km), gain = finite(r.gainM), summit = finite(r.summitKm);
    if (!id || id.length > MOUNTAIN_SLUG_MAX || seq == null || !Number.isInteger(seq) || seq < 1 || km == null || km <= 0) return null;
    return { id, seq, km, gainM: gain != null && gain > 0 ? Math.round(gain) : 0, loop: r.loop === true, summitKm: summit != null && summit >= 0 ? summit : null };
}

/**
 * 산 한 곳의 답(GET /api/hiq/hiking/mountains/:slug) → 그 산(고치기 창이 '고른 산'을 되살릴 때 쓴다)과 고를 수 있는 코스들.
 * 어긋난 줄 · 같은 코스(id)가 두 번 온 줄은 뺀다. 순서와 번호는 받은 그대로(산 화면의 순서 · "코스 N")다.
 */
export function readMountainDetail(res: unknown): { mountain: ActivityMountain | null; courses: ActivityCourse[] } {
    const list = res && typeof res === "object" && Array.isArray((res as { courseList?: unknown }).courseList) ? ((res as { courseList: unknown[] }).courseList) : [];
    const ids = new Set<string>();
    const courses: ActivityCourse[] = [];
    for (const it of list) {
        const c = toActivityCourse(it);
        if (!c || ids.has(c.id)) continue;
        ids.add(c.id);
        courses.push(c);
        if (courses.length >= ACTIVITY_COURSES_MAX) break;
    }
    return { mountain: toActivityMountain(res), courses };
}

/** 코스 칩의 글 — "코스 1 · 7.1km"(산 화면의 코스 번호 · 거리 그대로) */
export const activityCourseChip = (c: { seq: number; km: number; gainM: number }): string => `코스 ${c.seq} · ${courseFacts(c).km}`;
/**
 * 상세 내용에 적는 한 줄 — "코스 1 · 정상까지 · 7.1km · 오르막 1,370m · 걷는 시간 약 4시간 5분(어림)".
 * 숫자와 길의 모양은 산 화면의 것(shared/hikingPage courseFacts · courseShape)이다. 걷는 시간은 거리와 오르막으로 어림한 값이라 그렇게 적는다.
 */
export function activityCourseLine(c: ActivityCourse): string {
    const f = courseFacts(c);
    return `코스 ${c.seq} · ${courseShape(c)} · ${f.km} · 오르막 ${f.gain} · 걷는 시간 ${f.time}(어림)`;
}

/**
 * 코스를 골랐을 때 상세 내용에 들어갈 글. **칸이 비어 있거나(빈칸뿐이어도) 우리가 앞서 적은 줄(ours) 그대로일 때만** 그 줄로 바꾼다.
 * 회원이 적은 글이 있으면 건드리지 않는다(filled: false — 화면이 그렇게 말해 준다). 산 고르기의 '우리가 채운 글만' 규칙과 같다.
 */
export function fillCourseLine(description: string | null | undefined, line: string, ours: string | null): { description: string; filled: boolean } {
    const now = String(description ?? "");
    if (now.trim() === "" || (ours != null && now.trim() === ours)) return { description: line, filled: true };
    return { description: now, filled: false };
}
/** 고른 코스를 풀거나 산을 지웠을 때 상세 내용에 남길 글 — 우리가 적은 줄 그대로면 비우고, 회원이 손댔으면 그대로 둔다 */
export function clearCourseLine(description: string | null | undefined, ours: string | null): string {
    const now = String(description ?? "");
    return ours != null && now.trim() === ours ? "" : now;
}

// ── 함께 정상 인증 ─────────────────────────────────────────────────────
/**
 * '함께 정상 인증'을 셀 일정인가 — 고른 산이 있고 **모이는 시각이 지난** 일정만. 아직 모이지 않은 일정은 세지 않는다(셀 것이 없다).
 * 세는 것은 그 일정의 참석자 가운데 그날(한국 날짜) 그 산의 정상에서 인증한 사람 수다 — server/storage/hikingStamps activitySummitCounts.
 */
export function summitTogetherDue(a: { mountainSlug?: string | null; activityDate?: Date | string | number | null }, nowMs: number): boolean {
    if (!activityMountainSlug(a.mountainSlug)) return false;
    const t = a.activityDate == null ? NaN : new Date(a.activityDate).getTime();
    return Number.isFinite(t) && t <= nowMs;
}
/**
 * 이만큼의 참석자가 인증해야 수를 싣는다 — 한 명이면 싣지 않는다(참석자가 한 명뿐인 일정에서는 그 수가 곧 그 사람이다).
 * '함께 오른 산'(server/storage/hikingStamps crewSummits — 같은 날 둘 이상)과 같은 기준이다. 서버가 이 아래의 수는 0 으로 내보낸다.
 */
export const SUMMIT_TOGETHER_MIN = 2;
/** 답에 실을 수 — 기준에 못 미치면 0(없는 것과 같다) */
export function summitTogetherCount(n: unknown): number {
    const k = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 0;
    return k >= SUMMIT_TOGETHER_MIN ? k : 0;
}
/** 일정 카드의 칩 — "함께 정상 인증 3명". 기준에 못 미치면(또는 값이 없으면) 빈 글 — 칩을 그리지 않는다. 사람 수만이다 */
export function summitTogetherText(n: unknown): string {
    const k = summitTogetherCount(n);
    return k > 0 ? `함께 정상 인증 ${k.toLocaleString("en-US")}명` : "";
}

// ── 화면의 글 ──────────────────────────────────────────────────────────
/** '모이는 곳' · '모임명'은 만들기 창의 칸 이름 그대로다(i18n ko 의 createActivity.locationLabelHiking · nameLabel) */
export const ACTIVITY_MOUNTAIN_COPY = {
    title: "산 고르기",
    aside: "고르면 모이는 곳이 채워져요",
    placeholder: "산 이름 (예: 북한산)",
    searchLabel: "산 이름으로 찾기",
    listLabel: "찾은 산",
    idle: "한 글자만 적어도 전국의 산에서 찾아요.",
    loading: "찾는 중이에요…",
    empty: "찾는 산이 없어요. 모이는 곳은 직접 적어도 돼요.",
    error: "지금은 산을 찾을 수 없어요. 모이는 곳은 직접 적어도 돼요.",
    more: "곳 더 보기",
    chosen: "고른 산",
    clear: "고른 산 지우기",
    badge: "100대 명산",
    // 고치기 창 — 일정에 저장해 둔 산을 되살린다
    restoring: "고른 산을 불러오는 중이에요…",
    restored: "이 일정에 저장해 둔 산이에요. 바꾸려면 지우고 다시 골라 주세요.",
    // 코스 고르기 — '상세 내용'은 만들기 창의 칸 이름 그대로다(i18n ko 의 createActivity.descLabel)
    courseTitle: "코스 고르기",
    courseAside: "고르면 상세 내용에 적어 드려요",
    courseLoading: "코스를 불러오는 중이에요…",
    courseMore: "개 더 보기",
    courseFilled: "상세 내용에 코스를 적었어요. 걷는 시간은 거리와 오르막으로 어림한 값이에요(쉬는 시간 빼고).",
    courseKept: "상세 내용에 적어 둔 글이 있어 그대로 뒀어요. 코스는 직접 적어 주세요.",
    // 일정 카드
    link: "산 정보 보기",
} as const;

/**
 * 찾은 뒤의 한 줄 — 몇 곳인지. 한 번에 보이는 수보다 많으면 좁히는 법을 알려 준다(같은 이름의 산이 많다).
 * capped(서버가 다 주지 못했다)면 수를 '넘게'로 적고 이름을 더 적으라고 한다.
 */
export function mountainFoundNote(n: number, capped = false): string {
    const count = n.toLocaleString("en-US");
    if (capped) return `${count}곳 넘게 찾았어요. 이름을 더 적어 보세요.`;
    return n > MOUNTAIN_OPTIONS_STEP ? `${count}곳을 찾았어요. 이름 뒤에 시군을 적으면 좁혀져요(예: 백운산 포천).` : `${count}곳을 찾았어요.`;
}

/** 산을 고른 뒤의 한 줄 — 무엇을 채웠는지와 다음에 할 일 */
export const mountainFillNote = (titleFilled: boolean): string =>
    `${titleFilled ? "모이는 곳과 모임명을 채웠어요." : "모이는 곳을 채웠어요."} 만나는 자리(들머리 · 주차장)를 이어서 적어 보세요.`;
