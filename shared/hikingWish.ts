/**
 * 가고 싶은 산(2026-10-13) — 골프장 상세의 '관심 등록'을 등산으로 옮긴 것. 산 화면에서 담아 두면 등산 홈에 모인다.
 * 알림을 보내지 않는다(산에는 '취소 티' 같은 것이 없다) — 담아 둔 목록과, 오르면 '다녀온 산'으로 바뀌는 표시뿐이다.
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { josa } from "./briefingMeta.js";

/** 한 사람이 담을 수 있는 산의 수 */
export const HIKING_WISH_MAX = 100;

export const HIKING_WISH_LABEL = {
    add: "가고 싶은 산에 담기",
    added: "가고 싶은 산에 담았어요",
    shelf: "가고 싶은 산",
    empty: "산 화면에서 '가고 싶은 산에 담기'를 누르면 여기에 모여요.",
    full: `가고 싶은 산은 ${HIKING_WISH_MAX}곳까지 담을 수 있어요.`,
    done: "다녀온 산",
} as const;

// ── 방문자의 '가고 싶은 산' ────────────────────────────────────────────
/**
 * 가입하고 담기(2026-11-04 오너: "비회원으로 접속한 사람이 최대한 CTR 을 늘리는 것을 목표로").
 * 검색으로 산 화면에 온 방문자가 '가고 싶은 산'을 누르면 그 산을 이 기기에 적어 두고 가입 팝업을 연다.
 * 가입을 마치고 등산 화면에 있으면(카카오처럼 화면이 통째로 다녀와도 누른 화면으로 돌아온다) 바로 담는다 — 누른 일이 헛되지 않게.
 * 적는 것은 산의 slug · 이름(알림 글에 쓴다)과 누른 때뿐이다. 오래된 것(WISH_AFTER_LOGIN_MAX_MS)은 버린다 — 며칠 뒤 로그인한 사람에게
 * 잊은 산이 담기지 않게.
 */
export const WISH_AFTER_LOGIN_KEY = "rankue_hk_wish_after_login";
export const WISH_AFTER_LOGIN_MAX_MS = 30 * 60_000;

export function wishAfterLoginRecord(slug: string, name: string, now: number): string {
    return JSON.stringify({ slug, name, at: now });
}

/** 적어 둔 것을 읽는다 — 꼴이 틀렸거나 오래됐거나 미래의 것(기기 시계를 돌렸다)이면 null */
export function wishAfterLoginRead(raw: unknown, now: number): { slug: string; name: string } | null {
    if (typeof raw !== "string" || !raw) return null;
    try {
        const o = JSON.parse(raw) as { slug?: unknown; name?: unknown; at?: unknown } | null;
        if (!o || typeof o.slug !== "string" || !/^[^/?#\s]{1,80}$/.test(o.slug) || typeof o.at !== "number" || !Number.isFinite(o.at)) return null;
        if (o.at > now || now - o.at > WISH_AFTER_LOGIN_MAX_MS) return null;
        return { slug: o.slug, name: typeof o.name === "string" ? o.name.slice(0, 40) : "" };
    } catch {
        return null;
    }
}

/** 가입 팝업의 제목 · 한 줄 — 무엇을 하려다 가입하는지 그대로 말한다 */
export function wishLoginAsk(name: string): { title: string; desc: string } {
    return {
        title: `${josa(name || "이 산", "을/를")} 가고 싶은 산에 담아요`,
        desc: "가입하면 바로 담겨요. 담아 둔 산은 등산 홈에 모이고, 정상에서 인증하면 도장으로 바뀌어요.",
    };
}

/** 가입하고 담긴 뒤의 알림 — 어느 산이 담겼는지 이름으로(다른 화면에서 담겨도 알아보게) */
export const wishAddedAfterLogin = (name: string): string => (name ? `${josa(name, "을/를")} 가고 싶은 산에 담았어요` : HIKING_WISH_LABEL.added);

/**
 * 홈에 놓는 순서 — 아직 안 오른 산이 먼저(새로 담은 것부터), 다녀온 산은 뒤로.
 * ids 는 새로 담은 것부터 온다(서버가 준 순서).
 */
export function orderWishes(ids: readonly string[], done: ReadonlySet<string>): string[] {
    return [...ids.filter((id) => !done.has(id)), ...ids.filter((id) => done.has(id))];
}

// ── 우리 산악회가 가고 싶은 산 ─────────────────────────────────────────
/**
 * 산악회 홈의 줄(2026-10-13) — 산악회 회원 여럿이 담아 둔 산. 다음 정기 산행을 고를 때 본다.
 * **누가 담았는지는 싣지 않는다 — 산과 사람 수뿐이다.** 한 사람만 담은 산은 그 사람의 것이라 싣지 않는다(CREW_WISH_MIN).
 * 산악회 회원만 본다(server/routes/modules/hikingWishes).
 */
/** 이만큼의 회원이 담아야 산악회의 줄에 오른다 */
export const CREW_WISH_MIN = 2;
/** 줄에 놓는 산의 수 */
export const CREW_WISH_LIMIT = 12;

export const CREW_WISH_LABEL = {
    title: "우리 산악회가 가고 싶은 산",
    membersOnly: "산악회 회원만 볼 수 있어요",
} as const;

/** 제목 옆의 한 줄 — "2명 이상이 담은 산"(서버가 준 기준으로 적는다) */
export function crewWishAside(min: number = CREW_WISH_MIN): string {
    return `${Number.isFinite(min) && min >= 1 ? Math.floor(min) : CREW_WISH_MIN}명 이상이 담은 산`;
}

/** 카드의 딱지 — "3명이 담았어요". 사람 수만 적는다(이름은 없다) */
export function crewWishChip(count: number): string {
    const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    return `${n}명이 담았어요`;
}

/** 산악회의 줄에 놓을 것만 — 사람 수가 모자란 것은 빼고, 많이 담은 산부터(같으면 산의 id 순), CREW_WISH_LIMIT 곳까지 */
export function pickCrewWishes<T extends { mountainId: string; count: number }>(list: readonly T[], min: number = CREW_WISH_MIN): T[] {
    return list.filter((m) => m.count >= min)
        .sort((a, b) => b.count - a.count || (a.mountainId < b.mountainId ? -1 : a.mountainId > b.mountainId ? 1 : 0))
        .slice(0, CREW_WISH_LIMIT);
}
