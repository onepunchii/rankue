/**
 * 낚시어선 명부(2026-10-14) — 신고된 낚시어선인가 · 정원이 몇 명인가 · 신고의 유효기간이 언제까지인가.
 * 선상 낚시를 예약하기 전에 확인하는 것. 우리는 예약을 중개하지 않는다 — 신고 정보를 그대로 보여 줄 뿐이다.
 *
 * 자료: 해양수산부 낚시 어선업 신고정보(공공데이터포털). 지역으로 거르는 변수가 없어 통째로 받아 표(fishing_boats)에 둔다
 * (server/scripts/fishing-load-boats.ts — 4,981척 · 한 번에 3초쯤 걸리는 호출 쉰 번).
 * 선적항 표기가 제각각이다("부산광역시 서구 암남항" · "남항") — 시군은 신고확인번호의 앞부분("부산광역시 서구 제2026-011호")이 더 믿을 만하다.
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js(지금은 임포트가 없다).
 */

export interface FishingBoat { id: string; name: string; /** 시도 · 시군구(신고확인번호의 앞부분) */ region: string; /** 선적항(적힌 그대로) */ port: string | null; tons: number | null; passengers: number | null; /** 신고의 유효기간 끝(YYYY-MM-DD) */ validUntil: string | null }
export const BOAT_SOURCE = "해양수산부 낚시 어선업 신고정보";

/** "부산광역시 서구 제2026-011호" → "부산광역시 서구". 꼴이 아니면 적힌 그대로(앞 30자) */
export function boatRegion(noticeNo: unknown): string {
    const s = String(noticeNo ?? "").replace(/\s+/g, " ").trim();
    return (s.match(/^(.*?)\s*제\s*\d{4}\s*-/)?.[1] ?? s).trim().slice(0, 30);
}
/** "20명" → 20 */
export function boatCount(v: unknown): number | null {
    const m = String(v ?? "").match(/\d+/);
    const n = m ? Number(m[0]) : NaN;
    return Number.isFinite(n) && n > 0 && n < 1000 ? n : null;
}
/** "2026.10.09 ~ 2027.10.09" → "2027-10-09". 꼴이 아니면 null */
export function boatValidUntil(v: unknown): string | null {
    const all = [...String(v ?? "").matchAll(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g)];
    const m = all[all.length - 1];
    if (!m) return null;
    const day = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    return Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? null : day;
}

/** 받은 한 줄 → 우리 줄. 번호 · 이름이 없으면 null */
export function boatRow(r: Record<string, unknown>): FishingBoat | null {
    const id = String(r.fsboNo ?? "").trim(), name = String(r.fsboNm ?? "").replace(/\s+/g, " ").trim();
    if (!/^\d{6,20}$/.test(id) || !name) return null;
    const tons = Number(r.fsboTotTons);
    return { id, name: name.slice(0, 30), region: boatRegion(r.fshNtNm), port: String(r.shpmHangNm ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || null, tons: Number.isFinite(tons) && tons > 0 ? Math.round(tons * 100) / 100 : null, passengers: boatCount(r.maxPsrNum), validUntil: boatValidUntil(r.bsnStEndDt) };
}

/** 찾기 글 — 한글 · 숫자 두 글자 이상(지역 · 항 · 배 이름의 한 조각) */
export function cleanBoatQuery(raw: unknown): string | null {
    const s = String(raw ?? "").replace(/[^가-힣0-9]/g, "").slice(0, 12);
    return s.length >= 2 ? s : null;
}
