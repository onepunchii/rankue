/**
 * 골프장의 권역(공개 페이지의 region · city) → 그 권역의 도장첩.
 * 골프장 상세의 도장 구역이 '이 권역의 그림 · 볼마커'를 고를 때 쓴다(2026-10-12).
 * 인천 · 안산은 서해, 그 밖의 경기는 경기. 도장첩이 없는 권역 값이면 null.
 */
const BY_REGION: Readonly<Record<string, string>> = { 강원: "gangwon", 충청: "chungcheong", 전라: "honam", 경상: "yeongnam", 제주: "jeju" };

export function regionBookId(region: string | null | undefined, city: string | null | undefined): string | null {
    const r = region ?? "", c = city ?? "";
    if (r === "경기") return /인천|안산/.test(c) ? "seohae" : "gyeonggi";
    return BY_REGION[r] ?? null;
}
