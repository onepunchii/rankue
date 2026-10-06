/**
 * 언어 코드(ISO 639-1, 예: "es") → 화면 언어로 쓴 이름("스페인어"). 2026-10-06 답변 다듬기의 "스페인어로 바꿨어요".
 * 이름을 모르는 코드·빈 값·Intl.DisplayNames 가 없는 옛 웹뷰에서는 빈 글 — 부르는 쪽이 언어를 말하지 않는 문구로 바꾼다.
 */
export function languageLabel(code: unknown, displayLocale: string): string {
    if (typeof code !== "string" || !/^[a-z]{2,3}$/i.test(code.trim())) return "";
    const c = code.trim().toLowerCase();
    try {
        const name = new Intl.DisplayNames([displayLocale], { type: "language" }).of(c);
        // 모르는 코드는 코드 그대로 돌아온다 — 그건 이름이 아니다
        return name && name.toLowerCase() !== c ? name : "";
    } catch {
        return "";
    }
}
