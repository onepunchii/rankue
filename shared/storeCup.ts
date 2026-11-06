/**
 * 매장 대회(2026-11-06 오너 '추천대로' 사장님 도구 ②).
 *
 * 예전 매장 대회(hiq_tournaments)는 만들기만 되고 손님이 볼 곳 · 참가 신청 · 대진표 · 결과가 없었다(지금까지 0개).
 * 크루 대회(hiq_crew_tournaments)에는 접수 → 대진(시드 · 부전승) → 경기는 랭큐 점수판으로(대진에 경기가 붙고, 끝나면 승자가 윗칸으로) →
 * 우승까지 다 있다. 그래서 매장 대회는 그 표를 그대로 쓰고 crew_id 대신 store_id 를 갖는다(migrations/store_cups.sql).
 *  · 사장님: 대시보드 '대회' 탭에서 만들기 · 참가자(참가비 '받음' 체크 — 돈은 랭큐가 받지 않는다) · 대진 만들기 · 취소
 *  · 손님: 매장 페이지의 '이 매장 대회' → 대회 화면(/store-cup/<id>)에서 참가 신청 · 대진표 · 내 경기 시작
 * 크루 대회와 다른 점: 크루원이 아니어도 누구나 신청(그 매장의 공개 대회), 참가비 칸, 정원 4 · 8 · 16.
 * ⚠️ 서버가 임포트하는 shared 파일 — 이 파일은 아무것도 임포트하지 않는다.
 */

export const STORE_CUP_SIZES = [4, 8, 16] as const;
export const STORE_CUP_BEST_OF = [1, 3] as const;
export const STORE_CUP_FEE_MAX = 1_000_000;

/** 대회 화면 주소 */
export const storeCupPath = (id: string): string => `/store-cup/${id}`;

export interface StoreCupInput {
    title: string; description: string | null; gameType: "3c" | "4c"; maxPlayers: number; bestOf: number;
    recruitEnd: Date | null; startAt: Date | null; prize: string | null; entryFee: number | null;
}

export type StoreCupError = "title" | "gameType" | "maxPlayers" | "bestOf" | "entryFee" | "dates";

/** 사장님이 보낸 대회 — 꼴을 고르고 거른다(글의 금칙어는 서버가 따로 본다). 틀리면 까닭 */
export function cleanStoreCup(b: Record<string, unknown> | null | undefined, now: number): { ok: true; value: StoreCupInput } | { ok: false; error: StoreCupError } {
    const o = b ?? {};
    const title = String(o.title ?? "").trim().slice(0, 60);
    if (!title) return { ok: false, error: "title" };
    if (o.gameType !== "3c" && o.gameType !== "4c") return { ok: false, error: "gameType" };
    const maxPlayers = Number(o.maxPlayers ?? 8);
    if (!(STORE_CUP_SIZES as readonly number[]).includes(maxPlayers)) return { ok: false, error: "maxPlayers" };
    const bestOf = Number(o.bestOf ?? 1);
    if (!(STORE_CUP_BEST_OF as readonly number[]).includes(bestOf)) return { ok: false, error: "bestOf" };
    let entryFee: number | null = null;
    if (o.entryFee !== undefined && o.entryFee !== null && o.entryFee !== "") {
        const f = Number(o.entryFee);
        if (!Number.isInteger(f) || f < 0 || f > STORE_CUP_FEE_MAX) return { ok: false, error: "entryFee" };
        entryFee = f || null;
    }
    const date = (v: unknown) => (v ? new Date(String(v)) : null);
    const recruitEnd = date(o.recruitEnd), startAt = date(o.startAt);
    if ((recruitEnd && Number.isNaN(recruitEnd.getTime())) || (startAt && Number.isNaN(startAt.getTime()))) return { ok: false, error: "dates" };
    if (recruitEnd && recruitEnd.getTime() < now - 60_000) return { ok: false, error: "dates" };
    if (recruitEnd && startAt && startAt.getTime() < recruitEnd.getTime()) return { ok: false, error: "dates" };
    const text = (v: unknown, max: number) => { const t = String(v ?? "").trim().slice(0, max); return t || null; };
    return { ok: true, value: { title, description: text(o.description, 500), gameType: o.gameType, maxPlayers, bestOf, recruitEnd, startAt, prize: text(o.prize, 100), entryFee } };
}

export const STORE_CUP_ERROR_TEXT: Record<StoreCupError, string> = {
    title: "대회 이름을 적어 주세요",
    gameType: "종목(3쿠션 · 4구)을 골라 주세요",
    maxPlayers: "정원은 4 · 8 · 16명 중에서 골라 주세요",
    bestOf: "판 수는 1판 · 3판(2선승) 중에서 골라 주세요",
    entryFee: "참가비를 다시 적어 주세요",
    dates: "접수 마감 · 대회 날짜를 다시 골라 주세요(접수 마감이 대회 날보다 먼저)",
};

export const STORE_CUP_STATUS: Record<string, string> = {
    recruiting: "접수 중", drawn: "대진 확정", ongoing: "진행 중", ended: "끝남", canceled: "취소",
};

/** 대회 한 줄 — "3쿠션 · 16강 · 3판 2선승 · 참가비 1만원" */
export function storeCupLine(c: { gameType: string; maxPlayers: number; bestOf: number; entryFee?: number | null }): string {
    const parts = [c.gameType === "3c" ? "3쿠션" : "4구", `${c.maxPlayers}강`, c.bestOf > 1 ? `${c.bestOf}판 ${Math.ceil(c.bestOf / 2)}선승` : "단판"];
    if (c.entryFee) parts.push(`참가비 ${feeText(c.entryFee)}`);
    return parts.join(" · ");
}

/** 10000 → "1만원", 15000 → "1만 5천원", 3000 → "3천원" */
export function feeText(won: number): string {
    if (!(won > 0)) return "없음";
    const man = Math.floor(won / 10000), rest = won % 10000;
    const chun = Math.floor(rest / 1000), tail = rest % 1000;
    if (tail) return `${won.toLocaleString("ko-KR")}원`;
    return [man ? `${man}만` : "", chun ? `${chun}천` : ""].filter(Boolean).join(" ") + "원";
}
