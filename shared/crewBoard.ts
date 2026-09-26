/**
 * 크루 게시판·사진첩의 순수 규칙(2026-09-26 크루 디자인·기능 정리). 서버 라우트와 화면이 같은 규칙을 쓰게 여기 둔다.
 *
 *  - 카테고리: 저장 값은 예전부터 쓰던 한국어 원문 그대로 둔다(데이터를 고치지 않는다). 화면은 라벨 키로 번역해 보여 준다.
 *    예전엔 서버가 아무 문자열이나 받아서 일반 멤버가 "공지사항" 으로 글을 올릴 수 있었다 → 화이트리스트 + 공지는 운영진만.
 *  - 쪽 나누기: (created_at, id) 커서. 글·사진이 쌓이면 한 번에 전부 내려주던 게 무거워졌다.
 *  - 이미지 참조: 글 사진은 사진첩에도 같은 URL 로 복사된다. 한쪽을 지울 때 다른 쪽이 아직 쓰는 파일을 지우면 깨진다.
 */

/** 게시판 카테고리 저장 값. 순서 = 칩·선택 목록 순서. */
export const CREW_POST_CATEGORIES = ["공지사항", "가입인사", "크루후기", "자유글"] as const;
export type CrewPostCategory = (typeof CREW_POST_CATEGORIES)[number];
export const CREW_NOTICE_CATEGORY: CrewPostCategory = "공지사항";
export const CREW_DEFAULT_CATEGORY: CrewPostCategory = "자유글";

// 스키마 주석에 남은 옛 이름("모임후기")으로 저장된 행도 같은 라벨로 보여 준다.
const LEGACY_ALIASES: Record<string, CrewPostCategory> = { "모임후기": "크루후기", "자유": "자유글", "공지": "공지사항" };

const LABEL_KEYS: Record<CrewPostCategory, string> = {
    "공지사항": "crewBoard.categoryNotice",
    "가입인사": "crewBoard.categoryGreeting",
    "크루후기": "crewBoard.categoryReview",
    "자유글": "crewBoard.categoryFree",
};

/** 저장 값(옛 이름 포함)을 정식 값으로. 모르는 값이면 null. */
export function canonicalCrewPostCategory(v: unknown): CrewPostCategory | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    if ((CREW_POST_CATEGORIES as readonly string[]).includes(s)) return s as CrewPostCategory;
    return LEGACY_ALIASES[s] ?? null;
}

/** 화면 표시용 i18n 키. 모르는 값이면 null(화면은 그때 원문을 그대로 쓴다). */
export function crewPostCategoryLabelKey(v: unknown): string | null {
    const c = canonicalCrewPostCategory(v);
    return c ? LABEL_KEYS[c] : null;
}

/**
 * 글 쓰기·고치기에서 받을 카테고리를 정한다.
 *  - 비었으면 자유글.
 *  - 목록에 없는 값은 거부(임의 문자열이 칩 필터를 우회해 떠다니던 것).
 *  - 공지사항은 운영진만 — 일반 멤버가 공지 카테고리로 올리면 거부한다(고정 공지 isNotice 막은 것과 같은 이유).
 */
export function resolveCrewPostCategory(v: unknown, isAdmin: boolean): { ok: true; value: CrewPostCategory } | { ok: false; reason: string } {
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return { ok: true, value: CREW_DEFAULT_CATEGORY };
    const c = canonicalCrewPostCategory(v);
    if (!c) return { ok: false, reason: "err.crew.postCategoryInvalid" };
    if (c === CREW_NOTICE_CATEGORY && !isAdmin) return { ok: false, reason: "err.crew.postNoticeAdminOnly" };
    return { ok: true, value: c };
}

// --- 쪽 나누기 ---

/** 파라미터 없이 부를 때(예전 화면·club-detail 의 글 목록) 돌려주는 일반 글 수. 공지는 따로 전부 앞에 붙는다. */
export const CREW_POSTS_FIRST_PAGE = 30;
export const CREW_PHOTOS_FIRST_PAGE = 30;
export const CREW_PAGE_MAX = 50;
/** 첫 쪽에 함께 싣는 고정 공지 상한 — 공지가 몇백 개 쌓여도 첫 쪽이 무거워지지 않게. */
export const CREW_NOTICES_MAX = 20;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 커서 = "<ISO 작성 시각>_<id>". ISO 에는 '_' 가 없어서 한 글자로 가를 수 있다. */
export function encodeCrewCursor(createdAt: string | Date, id: string): string {
    const iso = createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString();
    return `${iso}_${id}`;
}

export interface CrewCursor { createdAt: string; id: string }

/** 잘못된 커서는 null — 서버는 그때 첫 쪽으로 답하지 않고 400 을 준다(엉뚱한 쪽이 붙는 것보다 낫다). */
export function decodeCrewCursor(raw: unknown): CrewCursor | null {
    if (typeof raw !== "string") return null;
    const i = raw.lastIndexOf("_");
    if (i <= 0) return null;
    const iso = raw.slice(0, i);
    const id = raw.slice(i + 1);
    if (!UUID_RE.test(id)) return null;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    return { createdAt: new Date(t).toISOString(), id };
}

/**
 * GET 쿼리(?before=&limit=)를 읽는다.
 *  - 둘 다 없으면 paged=false — 예전 호출(파라미터 없음)과 같은 모양(배열)으로, 첫 쪽만 준다.
 *  - before 가 있는데 못 읽으면 error.
 */
export function parseCrewPageQuery(q: { before?: unknown; limit?: unknown }, firstPage: number):
    { ok: true; cursor: CrewCursor | null; limit: number; paged: boolean } | { ok: false } {
    const hasBefore = q.before !== undefined && q.before !== "";
    const cursor = hasBefore ? decodeCrewCursor(q.before) : null;
    if (hasBefore && !cursor) return { ok: false };
    const n = Number(q.limit);
    const limit = Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), CREW_PAGE_MAX) : firstPage;
    return { ok: true, cursor, limit, paged: hasBefore || q.limit !== undefined };
}

/** 받은 목록에서 다음 쪽 커서를 만든다. 공지(isNotice)는 커서 계산에서 뺀다 — 공지는 첫 쪽에만 붙는다. */
export function nextCrewCursor<T extends { id: string; createdAt: string | Date; isNotice?: boolean | null }>(
    rows: T[], pageSize: number,
): string | null {
    const regular = rows.filter((r) => !r.isNotice);
    if (regular.length < pageSize) return null;
    const last = regular[regular.length - 1];
    return last ? encodeCrewCursor(last.createdAt, last.id) : null;
}

// --- 이미지 참조 ---

/** 문자열 URL 만 골라 중복 없이. 글 images 는 jsonb 라 null·비문자가 섞여 올 수 있다. */
export function imageUrlList(v: unknown): string[] {
    const arr = Array.isArray(v) ? v : v == null ? [] : [v];
    return Array.from(new Set(arr.filter((u): u is string => typeof u === "string" && u.length > 0)));
}

/** 글 한 편의 사진 상한(화면은 5장까지 올린다 — 여유를 둔다). */
export const CREW_POST_IMAGES_MAX = 10;

/**
 * 글 사진 목록 검사. 예전엔 서버가 아무 값이나 받아 사진첩에 그대로 복사했다(data: URL·임의 문자열도).
 * https 주소만, 상한 안에서. 비었으면 null(예전 저장 모양).
 * keep: 이미 저장돼 있던 URL — 글을 고칠 때 옛 글의 사진(규칙 전에 들어간 값)을 그대로 두면 막지 않는다.
 */
export function validateCrewPostImages(v: unknown, keep: readonly string[] = []): { ok: true; value: string[] | null } | { ok: false } {
    if (v === undefined || v === null) return { ok: true, value: null };
    if (!Array.isArray(v)) return { ok: false };
    if (v.length > CREW_POST_IMAGES_MAX) return { ok: false };
    for (const u of v) {
        if (typeof u === "string" && keep.includes(u)) continue;
        if (typeof u !== "string" || u.length > 2048 || !/^https:\/\/[^\s]+$/i.test(u)) return { ok: false };
    }
    const list = imageUrlList(v);
    return { ok: true, value: list.length > 0 ? list : null };
}

/**
 * 지워도 되는 URL = 후보 중 아직 다른 행(글·사진첩)이 쓰지 않는 것.
 * 글 사진은 사진첩에 같은 URL 로 복사되므로(createCrewPost), 예전처럼 무조건 지우면 반대쪽 타일·이미지가 깨졌다.
 */
export function unreferencedUrls(candidates: unknown, stillReferenced: Iterable<string>): string[] {
    const keep = new Set(stillReferenced);
    return imageUrlList(candidates).filter((u) => !keep.has(u));
}
