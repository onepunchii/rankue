// ISO 3166-1 alpha-2 국가코드 → 국기 이모지 (KR → 🇰🇷)
// 지역 지시 기호(Regional Indicator) 조합 — 폰트·플랫폼 무관하게 동작.
export function flagEmoji(cc?: string | null): string {
  if (!cc || cc.length !== 2 || !/^[A-Za-z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
