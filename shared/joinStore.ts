/**
 * 매장 QR 로 온 사람의 '가입 매장' — 사장님이 포스터에 붙인 자기 매장 QR 로 가입하면 **그 매장의 회원**이 된다.
 * 2026-10-07 오너: "QR 은 사장님이 직접 자기 매장 포스터에 자기 매장 QR 을 통해 유저가 가입하면 해당 매장 고객으로 인식되는 부분"
 *                  · "보통 가입하려고 매장 포스터 QR 을 찍지, 이미 가입한 사람이 QR 을 다시 찍을까?"
 *
 * 앱은 원래 '가입한 매장 = 소속 매장(hiq_members.store_id)'으로 짜여 있다 — 상대 목록 · 매장 랭킹 · 경기 기록 · 사장님 화면의 회원 목록이
 * 전부 그 기준이다. 끊겨 있던 것은 사슬 하나였다: QR 을 찍고 들어와도 '어느 매장에서 왔는지'가 가입까지 전달되지 않아, 카카오·구글 가입은
 * 늘 매장 없음(글로벌), 전화번호 가입은 기본 매장으로 들어갔다(파트너 매장 2곳의 회원이 0명이었다).
 *
 * 그래서: QR 주소(/store/<slug>)로 들어온 기기에 표시를 남기고, 그 기기에서 **새 계정이 만들어질 때** 그 매장 소속으로 만든다.
 *  - 새로 가입하는 사람만이다. 이미 계정이 있는 사람은 로그인될 뿐 소속이 바뀌지 않는다(오너의 판단 — QR 은 가입하려고 찍는다).
 *  - 표시는 하루 동안만 남고, 로그인이 끝나면 지운다(다음에 이 기기에서 만들어지는 다른 계정이 엉뚱한 매장에 붙지 않게).
 *  - 서버는 표시를 그대로 믿지 않는다 — 실제로 있는 파트너 매장(사장님이 있는 매장)일 때만 쓴다(server/lib/joinStore).
 *
 * 화면 번들에도 실리는 파일이다 — 비밀 값이 없다.
 */

/** 기기 저장소(localStorage)의 칸 이름 */
export const JOIN_STORE_KEY = "rankue:join-store";
/** 표시가 남는 시간 — 하루. 포스터를 찍고 나중에(집에 가서) 가입하는 사람까지 */
export const JOIN_STORE_TTL_MS = 24 * 60 * 60 * 1000;

export type JoinStore = {
    /** 파트너 매장 slug(hiq_stores.slug) — 서버에 보내는 값 */
    slug: string;
    /** 공개 매장 페이지 코드(store_listings.code). 그 페이지가 '이 매장 회원으로 시작하기'를 띄울지 판단하는 데 쓴다. 없을 수 있다 */
    code: string | null;
    /** 표시를 남긴 시각(ms) */
    at: number;
};

/** 매장 slug 로 올 수 있는 글자인가 — 승인 때 만든 slug(리스팅 코드 소문자 + 접미)와 옛 slug 를 다 받는다. */
export function isStoreSlug(raw: unknown): raw is string {
    return typeof raw === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(raw);
}

/** 저장할 글자 — slug 가 이상하면 null(남기지 않는다). */
export function packJoinStore(slug: unknown, code: unknown, now: number): string | null {
    if (!isStoreSlug(slug)) return null;
    const value: JoinStore = { slug, code: typeof code === "string" && /^[A-Za-z0-9_-]{1,20}$/.test(code) ? code : null, at: now };
    return JSON.stringify(value);
}

/** 저장된 글자를 읽는다 — 깨졌거나, 하루가 지났거나, 시각이 미래면 null. */
export function readJoinStore(raw: unknown, now: number): JoinStore | null {
    if (typeof raw !== "string" || !raw) return null;
    let v: unknown;
    try { v = JSON.parse(raw); } catch { return null; }
    if (!v || typeof v !== "object") return null;
    const { slug, code, at } = v as Record<string, unknown>;
    if (!isStoreSlug(slug) || typeof at !== "number" || !Number.isFinite(at)) return null;
    if (at > now + 60_000 || now - at > JOIN_STORE_TTL_MS) return null;
    return { slug, code: typeof code === "string" ? code : null, at };
}
