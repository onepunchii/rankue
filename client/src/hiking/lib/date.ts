/**
 * 도장에 찍는 날짜 — 한국 날짜로 "2026.10.03"(등산). 서버는 때를 UTC 로 준다. 새벽 산행이 전날로 찍히지 않게 한국 시간으로 자른다.
 */
const KST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
export function stampDate(v: string | Date | number): string {
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? "" : KST_DAY.format(d).replace(/-/g, ".");
}
