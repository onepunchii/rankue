/**
 * 도장에 찍는 날짜 — 한국 날짜로 "2026.10.03".
 * 서버는 도장을 얻은 때를 UTC 로 준다. 새벽 라운드가 전날로 찍히지 않게 한국 시간으로 자른다.
 */
const KST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

export function stampDate(iso: string | Date): string {
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    // en-CA 는 "2026-10-03" 꼴로 준다
    return KST_DAY.format(d).replace(/-/g, ".");
}
