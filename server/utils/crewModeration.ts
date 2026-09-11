import { checkContent, maskContacts } from "./contentFilter.js";

// 크루 UGC 안전장치 (Apple 1.2 / Play UGC) — 크루 게시판·댓글·사진·채팅·크루 소개에
// 커뮤니티와 같은 필터를 거는 순수 함수 모음. 라우트(crew.ts)는 결과만 보고 400 을 돌려준다.
// 커뮤니티와 다른 점은 checkContent 의 "crew" 맥락 하나뿐 — 모임비·정산 이야기를 내기로 오탐하지 않는다.

// 크루 콘텐츠 신고 대상. 커뮤니티 /reports 는 crew_photo_comment 를 모르므로 크루 신고는
// POST /crews/:id/reports 로 받는다(대상이 그 크루 것인지 서버가 확인할 수 있는 자리이기도 하다).
export const CREW_REPORT_TARGETS = ["crew_post", "crew_comment", "crew_photo", "crew_photo_comment", "crew_chat"] as const;
export type CrewReportTarget = typeof CREW_REPORT_TARGETS[number];

// 커뮤니티 /reports 와 같은 사유 목록 — 관리자 신고 큐가 한 목록으로 읽는다.
export const REPORT_REASONS = ["abuse", "gambling", "trade", "privacy", "spam", "other"] as const;

export const isCrewReportTarget = (v: unknown): v is CrewReportTarget =>
    typeof v === "string" && (CREW_REPORT_TARGETS as readonly string[]).includes(v);

export const isReportReason = (v: unknown): boolean =>
    typeof v === "string" && (REPORT_REASONS as readonly string[]).includes(v);

export type Screened<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * 글·댓글·채팅처럼 여러 텍스트 필드를 한 번에 검사한다. 하나라도 걸리면 거부,
 * 통과하면 각 필드의 전화번호·외부 링크를 가린 값을 돌려준다.
 * 줄바꿈으로 이어 붙여 검사하는 이유: 패턴의 `.` 은 줄바꿈을 넘지 않아 필드끼리 이어진
 * 오탐이 생기지 않고, 태그·제목에 쪼개 넣는 우회는 같은 검사 한 번에 걸린다.
 */
export function screenCrewFields<K extends string>(fields: Record<K, string | null | undefined>): Screened<Record<K, string | null | undefined>> {
    const keys = Object.keys(fields) as K[];
    const joined = keys.map((k) => fields[k] || "").join("\n");
    const f = checkContent(joined, { context: "crew" });
    if (f.blocked) return { ok: false, reason: f.reason! };
    const out = {} as Record<K, string | null | undefined>;
    for (const k of keys) {
        const v = fields[k];
        out[k] = typeof v === "string" ? maskContacts(v) : v;
    }
    return { ok: true, value: out };
}

/** 한 덩어리 텍스트(댓글·채팅 한 줄) */
export function screenCrewText(text: string): Screened<string> {
    const r = screenCrewFields({ text });
    return r.ok ? { ok: true, value: r.value.text as string } : r;
}

/**
 * 요청 본문에서 사람이 쓴 문자열 칸만 골라 한 번에 검사한다(정모·투표·대회·정산처럼 칸 이름이 라우트마다 다른 곳).
 * 문자열이 아닌 값·빠진 칸은 건드리지 않는다 — 형식 검증은 라우트 몫이고, 돌려준 값을 본문에 덮어써도 안전하다.
 * extra 는 칸 이름이 없는 목록(투표 선택지·정산 항목 이름)으로, 같은 검사에 함께 넣고 가린 값을 같은 순서로 돌려준다.
 */
export function screenCrewBody<K extends string>(
    body: Partial<Record<K, unknown>> | null | undefined,
    keys: readonly K[],
    extra: readonly unknown[] = [],
): Screened<{ fields: Partial<Record<K, string>>; extra: unknown[] }> {
    const src = body ?? {};
    const picked = {} as Record<string, string>;
    for (const k of keys) {
        const v = (src as Record<string, unknown>)[k];
        if (typeof v === "string") picked[k] = v;
    }
    extra.forEach((v, i) => { if (typeof v === "string") picked[`__extra_${i}`] = v; });
    const r = screenCrewFields(picked);
    if (!r.ok) return r;
    const fields: Partial<Record<K, string>> = {};
    for (const k of keys) if (k in r.value) fields[k] = r.value[k] as string;
    const outExtra = extra.map((v, i) => (typeof v === "string" ? r.value[`__extra_${i}`] as string : v));
    return { ok: true, value: { fields, extra: outExtra } };
}

// --- 회원 프로필(이름·소개) ---

const CONTACT_IN_NAME = "이름에는 연락처나 외부 링크를 넣을 수 없습니다";

/**
 * 회원 이름·소개 — 랭킹·크루 프로필 시트·커뮤니티 작성자 줄에 누구에게나 보이는 문구(검토 policy:R5).
 * 공개 표면이라 커뮤니티 규칙(크루 모임비 면제 없음)을 쓴다. 이름은 짧은 식별 칸이라 크루 이름처럼 연락처가 있으면
 * 가리지 않고 거부하고, 소개는 가려서 저장한다. 들어온 칸만 돌려준다.
 */
export function screenMemberProfile(input: { name?: unknown; introduction?: unknown }): Screened<{ name?: string; introduction?: string }> {
    const name = typeof input.name === "string" ? input.name : null;
    const intro = typeof input.introduction === "string" ? input.introduction : null;
    const f = checkContent([name ?? "", intro ?? ""].join("\n"));
    if (f.blocked) return { ok: false, reason: f.reason! };
    if (name && maskContacts(name) !== name) return { ok: false, reason: CONTACT_IN_NAME };
    const out: { name?: string; introduction?: string } = {};
    if (name !== null) out.name = name;
    if (intro !== null) out.introduction = maskContacts(intro);
    return { ok: true, value: out };
}

// --- 크루 소개(이름·소개·태그·지역·가입 질문) ---

export interface CrewProfileInput {
    name?: unknown;
    description?: unknown;
    shortIntro?: unknown;
    region?: unknown;
    tags?: unknown;
    introQuestions?: unknown;
}

const CONTACT_IN_SHORT_FIELD = "크루 이름·지역·태그에는 연락처나 외부 링크를 넣을 수 없습니다";

/**
 * 크루 생성·수정 본문 가운데 사람이 쓴 문구만 골라 검사한다. 들어온 키만 돌려주므로
 * PATCH 에 그대로 덮어써도 보내지 않은 필드를 건드리지 않는다.
 *
 * 짧은 식별 필드(이름·지역·태그)는 가리면 뜻이 망가지고 이름은 중복 검사 대상이라,
 * 연락처가 섞여 있으면 가리지 않고 거부한다. 긴 문구(소개·한줄소개·가입 질문)는 커뮤니티처럼 가린다.
 * 모양이 틀린 값(숫자 태그 등)은 여기서 판단하지 않고 그대로 둔다 — 형식 검증은 라우트 몫이다.
 */
export function screenCrewProfile(input: CrewProfileInput): Screened<Partial<CrewProfileInput>> {
    const texts: string[] = [];
    const str = (v: unknown) => (typeof v === "string" ? v : null);

    const name = str(input.name);
    const region = str(input.region);
    const description = str(input.description);
    const shortIntro = str(input.shortIntro);
    const tags = Array.isArray(input.tags) ? input.tags : null;
    const questions = Array.isArray(input.introQuestions) ? input.introQuestions : null;
    const questionText = (q: unknown) => (typeof q === "string" ? q : (q && typeof (q as any).text === "string" ? (q as any).text as string : null));

    for (const v of [name, region, description, shortIntro]) if (v) texts.push(v);
    for (const t of tags || []) if (typeof t === "string") texts.push(t);
    for (const q of questions || []) { const s = questionText(q); if (s) texts.push(s); }

    const f = checkContent(texts.join("\n"), { context: "crew" });
    if (f.blocked) return { ok: false, reason: f.reason! };

    const hasContact = (s: string) => maskContacts(s) !== s;
    if ((name && hasContact(name)) || (region && hasContact(region))
        || (tags || []).some((t) => typeof t === "string" && hasContact(t))) {
        return { ok: false, reason: CONTACT_IN_SHORT_FIELD };
    }

    const patch: Partial<CrewProfileInput> = {};
    if (description !== null) patch.description = maskContacts(description);
    if (shortIntro !== null) patch.shortIntro = maskContacts(shortIntro);
    if (questions) {
        patch.introQuestions = questions.map((q) => {
            if (typeof q === "string") return maskContacts(q);
            if (q && typeof (q as any).text === "string") return { ...(q as any), text: maskContacts((q as any).text) };
            return q;
        });
    }
    return { ok: true, value: patch };
}

const PROFILE_KEYS = ["name", "description", "shortIntro", "region", "tags", "introQuestions"] as const;

/**
 * 크루 설정 저장(PATCH)에서 저장된 값과 **달라진** 소개 칸만 고른다(검토 code:R7).
 * 화면은 폼 전체를 다시 보내므로 전부 검사하면, 예전에 저장된 문구가 나중에 새로 막히는 규칙에 걸려
 * 가입 방식처럼 전혀 다른 설정까지 저장이 막히고 어느 칸이 문제인지도 알 수 없었다.
 * 배열(태그·가입 질문)은 JSON 으로 비교한다 — 순서만 바뀌어도 새로 검사한다(가려서 저장할 값이 달라질 수 있어서).
 */
export function changedCrewProfileFields(update: Record<string, unknown>, stored: Record<string, unknown> | null | undefined): Partial<CrewProfileInput> {
    const out: Partial<CrewProfileInput> = {};
    const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    for (const k of PROFILE_KEYS) {
        if (!(k in update)) continue;
        if (stored && same(update[k], stored[k])) continue;
        out[k] = update[k];
    }
    return out;
}
