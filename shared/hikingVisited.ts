/**
 * 다녀온 산 한 번에 고르기(2026-11-04 오너: "다녀온 산 한 번에 고르기 진행").
 * 100대 명산 와펜 판에서 다녀온 산을 톡톡 골라 인증 없는 기록(흐린 도장)으로 한꺼번에 남긴다. 다른 산은 이름으로 찾아 더한다.
 *
 * 실측(11/4): 인증 없는 기록 44건(18명) > 현장 인증 12건(10명) — 사람들은 지난 산행을 적어 두고 싶어 한다(한 회원은 20분 동안 여덟 곳을 하나씩).
 * 가입한 지 7일 넘은 등산 회원의 75%가 첫날만 썼다 — 첫날 도장첩이 비어 있지 않게 한다.
 *
 * 흐린 도장은 등급 · 와펜 · 핀 · 연간 리포트 · 산악회 도장에 들지 않는다(모두 인증만 센다 — shared/hikingStamps · hikingYear,
 * server/storage/hikingStamps 의 crewSummits). 그래서 한꺼번에 골라도 부풀 것이 없다. 날짜는 적은 날(오늘)이다 — 산 화면의 '다녀왔어요'와 같다.
 * 이미 기록이 있는 산(인증이든 아니든)은 건너뛴다.
 *
 * 방문자도 고를 수 있다 — 고른 것을 기기에 적어 두고 가입 팝업, 가입하고 이 화면으로 돌아오면 남긴다('가고 싶은 산'과 같은 길 · shared/hikingWish).
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */

export const HIKING_VISITED_PATH = "/hiking/visited";
/** 한 번에 남길 수 있는 산의 수 — 100대 명산 전부와 다른 산 몇 곳 */
export const VISITED_MAX = 120;

export const VISITED_AFTER_LOGIN_KEY = "rankue_hk_visited_after_login";
/** 가입하는 동안 기다려 줄 시간 — 지나면 버린다 */
export const VISITED_AFTER_LOGIN_MAX_MS = 60 * 60_000;

export const VISITED_LABEL = {
    title: "다녀온 산 고르기",
    lead: "다녀온 산을 골라 주세요",
    sub: "고른 산은 도장첩에 흐린 도장으로 남아요. 정상에서 인증하면 또렷한 도장이 되고 와펜이 달려요.",
    kfs: "산림청 100대 명산",
    others: "다른 산",
    search: "다른 산 이름으로 찾기",
    searchEmpty: "그 이름의 산이 없어요.",
    had: "이미 남긴 산",
    verified: "인증",
    recorded: "기록",
    pickFirst: "다녀온 산을 골라 주세요",
    save: (n: number) => `${n}곳 도장첩에 남기기`,
    join: (n: number) => `가입하고 ${n}곳 남기기`,
    saving: "남기는 중…",
    done: (n: number) => (n > 0 ? `흐린 도장 ${n}개를 찍었어요` : "이미 다 남겨 둔 산이에요"),
    doneSub: "정상에서 인증하면 또렷한 도장으로 바뀌고 와펜이 달려요.",
    entry: "100대 명산, 몇 곳 다녀왔나요?",
    entrySub: "와펜 판에서 다녀온 산을 골라 도장첩을 한 번에 채워요",
    entryRegion: (region: string) => `${region} 100대 명산, 몇 곳 다녀왔나요?`,
} as const;

/** 가입 팝업의 제목 · 한 줄 — 무엇을 하려다 가입하는지 */
export function visitedLoginAsk(n: number): { title: string; desc: string } {
    return {
        title: `다녀온 산 ${Math.max(0, Math.floor(n))}곳을 도장첩에 남겨요`,
        desc: "가입하면 고른 산이 흐린 도장으로 바로 찍혀요. 정상에서 인증하면 또렷한 도장이 되고 와펜이 달려요.",
    };
}

/** 요청의 산 목록 — 글자만, 겹친 것은 하나로, VISITED_MAX 곳까지. 꼴이 틀리면 null(서버는 그 뒤에 아는 산인지 다시 본다) */
export function cleanVisitedIds(v: unknown): string[] | null {
    if (!Array.isArray(v) || v.length === 0 || v.length > VISITED_MAX) return null;
    const out: string[] = [];
    for (const x of v) {
        if (typeof x !== "string" || x.length < 1 || x.length > 80 || /[\u0000-\u001f]/.test(x)) return null;
        if (!out.includes(x)) out.push(x);
    }
    return out;
}

export function visitedAfterLoginRecord(ids: readonly string[], now: number): string {
    return JSON.stringify({ ids, at: now });
}

/** 방문자 때 고른 것을 읽는다 — 오래됐거나 미래의 것 · 꼴이 틀린 것은 null */
export function visitedAfterLoginRead(raw: unknown, now: number): string[] | null {
    if (typeof raw !== "string" || !raw) return null;
    try {
        const o = JSON.parse(raw) as { ids?: unknown; at?: unknown } | null;
        if (!o || typeof o.at !== "number" || !Number.isFinite(o.at) || o.at > now || now - o.at > VISITED_AFTER_LOGIN_MAX_MS) return null;
        return cleanVisitedIds(o.ids);
    } catch {
        return null;
    }
}
