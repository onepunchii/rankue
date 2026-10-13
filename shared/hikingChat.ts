/**
 * 등산 — 산악회 방의 '산' 카드와 '다음 산 투표'의 보기 채우기(2026-10-13).
 *
 * ── 산 카드 ─────────────────────────────────────────────────────────
 *  산악회 방의 + 에서 산을 골라 보내면 방에 그 산의 카드가 올라온다(이름 · 높이 · 자리 · 코스 · '산 정보 보기').
 *  채팅 카드는 **서버만 만든다**(server/routes/modules/chatCards 머리말) — 화면은 산의 주소(slug) 하나만 보내고,
 *  이름 · 높이 · 자리 · 코스는 서버가 산 표에서 읽어 채운다. 본문의 다른 열쇠는 읽지도 않는다(mountainCardSlug 가 slug 만 꺼낸다).
 *  산악회 방에서만 붙는다 — 당구 · 골프 방에는 붙지 않는다(라우트의 종목 검사).
 *  요약(옛 앱 · 알림의 한 줄)은 "산 · 설악산". 등산의 글은 번역 열쇠 없이 한국어 그대로다(등산은 한국어 화면만 있다).
 *
 * ── 다음 산 투표 ─────────────────────────────────────────────────────
 *  산악회의 투표 만들기 창에 '산으로 보기 채우기' 한 줄이 놓인다 — 산을 고르면 그 이름이 보기로 들어간다.
 *  보기는 글자 그대로다(표가 바뀌지 않는다 — 산을 가리키는 칸이 없다). 그래서 정해 둔 것:
 *   · 빈 보기 칸이 있으면 그 칸부터 채우고, 없으면 새 칸을 더한다. 창의 상한(보기 10개)을 넘기지 않는다.
 *   · 같은 이름의 산이 이미 보기에 들어가 있으면 둘 다 시군을 붙여 가른다("백운산(광양)" · "백운산(포천)").
 *   · 회원이 손으로 적어 둔 같은 이름의 보기가 있으면 새로 넣는 산에 시군을 붙인다("설악산" 옆에 "설악산(양양)").
 *   · 같은 산을 두 번 넣지 않는다. 시군을 붙여도 글이 같으면 겹친 것으로 본다(투표 서버가 겹친 보기를 거절한다).
 *   · 회원이 고치거나 지운 보기는 회원의 글이다 — 우리가 넣은 글 그대로인 보기만 '넣은 산'으로 기억한다.
 *
 * ── 찾기 ────────────────────────────────────────────────────────────
 *  두 곳이 같은 찾기를 쓴다(client/src/hiking/chat/mountainSearch). 공개 목록(GET /api/hiq/hiking/mountains?q=)의 답에서
 *  쓸 것만 추리고, 이름 뒤에 적은 시군으로 좁힌다("백운산 포천"). 일정 만들기의 산 고르기(shared/crewMountain)와 같은 규칙이다.
 *
 * 순수 함수만. ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { duplicateNames, heightText, mountainLabel, mountainPlace } from "./hikingMountains.js";
import { kmRange } from "./hikingPage.js";

// ── 산 카드 ──────────────────────────────────────────────────────────
/** 카드의 종류(metadata.type) — 화면의 ChatCard 가 이 이름으로 그린다 */
export const MOUNTAIN_CARD = "MOUNTAIN";
/** 산의 주소(slug) · 이름의 길이 상한 — 이보다 길면 우리 자료가 아니다(shared/crewMountain 과 같은 값) */
export const MOUNTAIN_SLUG_MAX = 80;
export const MOUNTAIN_NAME_MAX = 40;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const pos = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const km1 = (v: number | null | undefined): number | null => (v != null && Number.isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : null);
/** 우리 주소의 꼴 — 비어 있지 않고 80자 안, 빈칸 · 빗금 · ? · # 이 없다(hikingMountains assignMountainSlugs 가 그렇게 만든다) */
const validSlug = (v: unknown): string | null => {
    const s = str(v);
    return s && s.length <= MOUNTAIN_SLUG_MAX && !/[\s/\\?#]/.test(s) ? s : null;
};

/**
 * 보내기 요청의 본문 → 산의 주소. **slug 하나만 읽는다** — name · heightM 같은 다른 열쇠가 같이 와도 쓰이지 않는다.
 * 꼴이 어긋나면 null(라우트가 400 으로 답한다).
 */
export function mountainCardSlug(body: unknown): string | null {
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return validSlug((body as { slug?: unknown }).slug);
}

/** 서버가 산 표에서 읽은 줄 — server/storage/hiking 의 MountainSummary 가 이 꼴을 채운다 */
export interface MountainCardSource {
    id: string;
    slug: string;
    name: string;
    heightM: number | null;
    region: string | null;
    sido: string | null;
    sigungu: string | null;
    lists: readonly string[];
    courses: number;
    minKm: number | null;
    maxKm: number | null;
}
/** 카드에 싣는 것 — 전부 서버가 채운다 */
export interface MountainCard {
    /** 산의 id — 100대 명산 와펜 그림의 열쇠 */
    mountainId: string;
    slug: string;
    name: string;
    heightM: number | null;
    /** "강원 양양군" */
    place: string;
    /** 권역(표지 그림의 열쇠) */
    region: string | null;
    /** 산림청 100대 명산인가 */
    kfs100: boolean;
    courses: number;
    minKm: number | null;
    maxKm: number | null;
}

/** 산 표의 줄 → 카드. 요청에서 온 값은 하나도 받지 않는다(넘길 자리가 없다) */
export function buildMountainCard(m: MountainCardSource): MountainCard {
    const courses = Number.isFinite(m.courses) && m.courses > 0 ? Math.floor(m.courses) : 0;
    return {
        mountainId: m.id, slug: m.slug, name: m.name,
        heightM: m.heightM != null && Number.isFinite(m.heightM) && m.heightM > 0 ? Math.round(m.heightM) : null,
        place: mountainPlace(m), region: m.region ?? null, kfs100: m.lists.includes("kfs100"),
        courses, minKm: courses > 0 ? km1(m.minKm) : null, maxKm: courses > 0 ? km1(m.maxKm) : null,
    };
}

/** 카드를 못 그리는 옛 앱 · 알림의 한 줄 — "산 · 설악산". 주소에 시군이 붙은 산은 "산 · 지리산(통영)" */
export const mountainCardSummary = (c: { name: string; slug: string }): string => `산 · ${mountainLabel(c)}`;
/** 알림의 제목 — room 은 "[산악회 이름]" */
export const mountainCardPushTitle = (room: string): string => `${room} · 산 공유`;

/** 받은 카드(metadata)를 그릴 수 있는 꼴로 — 주소나 이름이 없으면 null(화면은 요약 한 줄을 보인다) */
export function readMountainCard(md: unknown): MountainCard | null {
    if (!md || typeof md !== "object" || Array.isArray(md)) return null;
    const r = md as Record<string, unknown>;
    const slug = validSlug(r.slug);
    const name = str(r.name);
    if (!slug || !name) return null;
    const courses = Math.floor(pos(r.courses) ?? 0);
    return {
        mountainId: str(r.mountainId) ?? "", slug, name, heightM: pos(r.heightM), place: str(r.place) ?? "", region: str(r.region), kfs100: r.kfs100 === true,
        courses, minKm: courses > 0 ? pos(r.minKm) : null, maxKm: courses > 0 ? pos(r.maxKm) : null,
    };
}
/** "1,708m · 강원 양양군" — 높이를 모르면 자리만, 둘 다 모르면 빈 글 */
export const mountainCardFacts = (c: Pick<MountainCard, "heightM" | "place">): string => [heightText(c.heightM), c.place].filter(Boolean).join(" · ");
/** "코스 3개 · 4.2~11km" — 코스가 없으면 빈 글(줄을 그리지 않는다) */
export function mountainCardCourses(c: Pick<MountainCard, "courses" | "minKm" | "maxKm">): string {
    if (!(c.courses > 0)) return "";
    return [`코스 ${c.courses}개`, kmRange(c.minKm, c.maxKm)].filter(Boolean).join(" · ");
}

export const MOUNTAIN_CARD_COPY = { badge: "산", kfs100: "100대 명산", open: "산 정보 보기" } as const;

// ── 찾기 ────────────────────────────────────────────────────────────
/** 검색어의 길이 상한 — 서버(routes/modules/hiking GET /mountains)가 자르는 길이와 같다 */
export const MOUNTAIN_QUERY_MAX = 30;
/** 글자를 멈춘 뒤 찾기까지 기다리는 시간 */
export const MOUNTAIN_SEARCH_WAIT_MS = 250;

/** 찾은 산 한 줄 — 검색 답에서 이것만 꺼내 쓴다 */
export interface MountainHit {
    slug: string;
    name: string;
    sido: string | null;
    sigungu: string | null;
    heightM: number | null;
    kfs100: boolean;
}
/** 받은 값 한 줄 → 찾은 산. 꼴이 어긋나면 null(목록에서 뺀다) */
export function toMountainHit(raw: unknown): MountainHit | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const slug = validSlug(r.slug);
    const name = str(r.name);
    if (!slug || !name || name.length > MOUNTAIN_NAME_MAX) return null;
    const h = pos(r.heightM);
    return { slug, name, sido: str(r.sido), sigungu: str(r.sigungu), heightM: h == null ? null : Math.round(h), kfs100: Array.isArray(r.lists) && r.lists.includes("kfs100") };
}
/**
 * 검색 답({ total, items }) → 찾은 산들. 꼴이 어긋난 줄 · 같은 주소가 두 번 온 줄은 뺀다(목록의 형제 key 가 주소다).
 * capped 는 서버가 다 주지 못했다는 표시다(한 번에 천 곳까지) — 그때는 이름을 더 적으라고 말한다.
 */
export function readMountainHits(res: unknown): { list: MountainHit[]; capped: boolean } {
    const r = res && typeof res === "object" ? (res as { total?: unknown; items?: unknown }) : {};
    const items = Array.isArray(r.items) ? r.items : [];
    const seen = new Set<string>();
    const list: MountainHit[] = [];
    for (const it of items) {
        const m = toMountainHit(it);
        if (!m || seen.has(m.slug)) continue;
        seen.add(m.slug);
        list.push(m);
    }
    return { list, capped: typeof r.total === "number" && r.total > items.length };
}

/** 아직 글자가 되지 않은 낱자(ㅅ · ㅏ …) — 한글을 치는 도중에 잠깐 들어온다. 산 이름에는 없다 */
const LOOSE_JAMO = /[ㄱ-ㆎ]/g;
/**
 * 친 글 → 서버에 물을 이름(q)과 그 뒤의 낱말(rest). 서버는 이름으로만 찾는다 — 뒤의 낱말은 시도 · 시군구를 좁힌다("백운산 포천").
 * 치는 도중의 낱자는 버린다("설ㅇ" → "설"). 낱자뿐이면 묻지 않는다(q 가 빈다).
 */
export function splitMountainSearch(raw: string): { q: string; rest: string[] } {
    const words = String(raw ?? "").replace(LOOSE_JAMO, "").trim().split(/\s+/).filter(Boolean);
    return { q: (words[0] ?? "").slice(0, MOUNTAIN_QUERY_MAX), rest: words.slice(1) };
}
/**
 * 받은 산들을 고르기 좋게 — 이름에 q 가 든 산만, 뒤의 낱말이 이름 · 시도 · 시군구에 다 든 산만.
 * 순서는 이름이 q 와 같은 산, q 로 시작하는 산, 그 밖. 같은 무리 안에서는 받은 순서(명산 먼저 · 높은 순)를 지킨다.
 */
export function rankMountainHits<T extends { name: string; sido?: string | null; sigungu?: string | null }>(items: readonly T[], q: string, rest: readonly string[] = []): T[] {
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
/** 한 화면에 같이 놓인 산들의 이름표 — 같은 이름이 있으면 시군을 붙인다("백운산(포천)"). 넘긴 순서 그대로 */
export function mountainHitLabels(list: readonly { name: string; slug: string; sigungu?: string | null }[]): string[] {
    const dup = duplicateNames(list);
    return list.map((m) => mountainLabel(m, dup));
}
/** 이름 아래의 한 줄 — "경기 포천시 · 903m" */
export const mountainHitWhere = (m: { sido?: string | null; sigungu?: string | null; heightM?: number | null }): string => [mountainPlace(m), heightText(m.heightM)].filter(Boolean).join(" · ");

export const MOUNTAIN_SEARCH_COPY = {
    placeholder: "산 이름 (예: 북한산)",
    searchLabel: "산 이름으로 찾기",
    listLabel: "찾은 산",
    idle: "한 글자만 적어도 전국의 산에서 찾아요.",
    loading: "찾는 중이에요…",
    empty: "찾는 산이 없어요. 이름을 다시 적어 보세요.",
    error: "지금은 산을 찾을 수 없어요. 잠시 뒤에 다시 해 보세요.",
    more: "곳 더 보기",
    badge: "100대 명산",
} as const;
/** 찾은 뒤의 한 줄 — 몇 곳인지. 한 번에 보이는 수(step)보다 많으면 좁히는 법을 알려 준다 */
export function mountainSearchNote(n: number, step: number, capped = false): string {
    const count = n.toLocaleString("en-US");
    if (capped) return `${count}곳 넘게 찾았어요. 이름을 더 적어 보세요.`;
    return n > step ? `${count}곳을 찾았어요. 이름 뒤에 시군을 적으면 좁혀져요(예: 백운산 포천).` : `${count}곳을 찾았어요.`;
}

export const MOUNTAIN_PICKER_COPY = {
    title: "산 보내기",
    desc: "산을 고르면 이 방에 산 카드가 올라가요.",
    close: "닫기",
} as const;

// ── 다음 산 투표 ─────────────────────────────────────────────────────
/** 보기 글을 견주는 눈 — 투표의 겹침 검사(shared/crewPoll normalizePollOptions)와 같다: 빈칸을 줄이고 대소문자를 가리지 않는다 */
export const pollOptionKey = (s: string): string => String(s ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();

/** 우리가 보기에 넣은 산 — label 은 그때 넣은 글 */
export interface PollMountainPick { slug: string; name: string; sigungu: string | null; label: string }
export type PollMountainFail = "full" | "duplicate" | "tooLong";
export type PollMountainResult =
    | { ok: true; options: string[]; picked: PollMountainPick[]; label: string }
    | { ok: false; reason: PollMountainFail };

/** 산을 더 넣을 수 있는 자리의 수 — 빈 보기 칸 + 상한까지 남은 칸 */
export function pollMountainRoom(options: readonly string[], maxOptions: number): number {
    return options.filter((o) => pollOptionKey(o) === "").length + Math.max(0, maxOptions - options.length);
}

/**
 * 고른 산을 보기에 넣는다(머리말의 규칙). 넣지 못하면 까닭과 함께 — 그때 보기는 그대로다.
 * options 는 창의 보기 칸(빈 칸 포함), picked 는 앞서 우리가 넣은 산, limits 는 창의 상한(shared/crewPoll POLL_LIMITS).
 */
export function addPollMountain(
    options: readonly string[], picked: readonly PollMountainPick[], m: { slug: string; name: string; sigungu?: string | null },
    limits: { maxOptions: number; optionMax: number },
): PollMountainResult {
    const keys = options.map(pollOptionKey);
    // 우리가 넣은 글 그대로 남아 있는 보기만 '넣은 산'이다 — 회원이 고치거나 지운 보기는 회원의 글이다
    const live = picked.filter((p) => keys.includes(pollOptionKey(p.label)));
    if (live.some((p) => p.slug === m.slug)) return { ok: false, reason: "duplicate" };
    const blank = keys.indexOf("");
    if (blank < 0 && options.length >= limits.maxOptions) return { ok: false, reason: "full" };
    // 같은 이름의 산이 먼저 들어가 있으면 둘 다 시군을 붙인다
    const dup = duplicateNames([...live, m]);
    // 회원이 손으로 적어 둔 같은 이름의 보기가 있으면 새 산에 시군을 붙여 가른다("설악산" 옆에 "설악산(양양)")
    const ours = new Set(live.map((p) => pollOptionKey(p.label)));
    const nameKey = pollOptionKey(m.name);
    if (keys.some((k) => k === nameKey && !ours.has(k))) dup.add(m.name);
    const label = mountainLabel(m, dup);
    if (label.length > limits.optionMax) return { ok: false, reason: "tooLong" };
    const next = [...options];
    const nextPicked = live.map((p) => {
        const again = mountainLabel(p, dup);
        const at = keys.indexOf(pollOptionKey(p.label));
        // 고쳐 적을 글이 다른 보기와 겹치거나 너무 길면 그대로 둔다
        if (again === p.label || at < 0 || again.length > limits.optionMax || keys.includes(pollOptionKey(again))) return p;
        next[at] = again;
        keys[at] = pollOptionKey(again);
        return { ...p, label: again };
    });
    if (keys.includes(pollOptionKey(label))) return { ok: false, reason: "duplicate" };
    if (blank >= 0) next[blank] = label; else next.push(label);
    return { ok: true, options: next, picked: [...nextPicked, { slug: m.slug, name: m.name, sigungu: m.sigungu ?? null, label }], label };
}

export const POLL_MOUNTAIN_COPY = {
    title: "산으로 보기 채우기",
    aside: "고르면 보기에 산 이름이 들어가요",
    idle: "다음에 갈 산을 찾아 보기로 넣어 보세요.",
    duplicate: "이미 보기에 있는 산이에요.",
    tooLong: "이름이 길어 보기에 넣을 수 없어요. 보기 칸에 직접 적어 주세요.",
} as const;
/** 넣은 뒤의 한 줄 — "설악산 · 보기에 넣었어요. 3곳 더 넣을 수 있어요." */
export const pollMountainAddedNote = (label: string, room: number): string => `${label} · 보기에 넣었어요.${room > 0 ? ` ${room}곳 더 넣을 수 있어요.` : ""}`;
/** 보기가 가득 찼을 때 */
export const pollMountainFullNote = (maxOptions: number): string => `보기가 ${maxOptions}개로 가득 찼어요. 보기를 지우면 산을 더 넣을 수 있어요.`;
/** 넣지 못한 까닭의 한 줄 */
export const pollMountainFailNote = (reason: PollMountainFail, maxOptions: number): string => (reason === "full" ? pollMountainFullNote(maxOptions) : POLL_MOUNTAIN_COPY[reason]);
