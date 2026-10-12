/**
 * 도장에 찍는 골프장 이름 — 도장첩 밖의 골프장(여권의 도장)용.
 * 원장 이름의 꼬리(컨트리클럽 · CC · ㈜ …)를 떼고, 고리 안에 들어가게 열 자에서 자른다.
 * 도장첩 안의 골프장은 칸의 이름을 쓴다(shared/golfStampBooks 의 slot.name) — 여기를 거치지 않는다.
 */
export const STAMP_LABEL_MAX = 10;

export function stampLabel(name: string): string {
    const core = name
        .replace(/\(주\)|㈜|주식회사/g, "")
        .replace(/컨트리클럽|골프클럽|골프리조트|골프링크스|골프장|C\.C\.?|G\.C\.?|CC|GC/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    // 다 떼고 나니 아무것도 안 남으면(이름이 'CC' 뿐인 기록) 원래 글자를 쓴다
    const out = core || name.trim();
    const chars = [...out];
    return chars.length > STAMP_LABEL_MAX ? chars.slice(0, STAMP_LABEL_MAX).join("").trim() : out;
}
