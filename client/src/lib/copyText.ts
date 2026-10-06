/**
 * 글자를 클립보드에 넣는다(2026-10-06 채팅 말풍선 메뉴의 '복사').
 * 클립보드 API 가 없거나 막힌 곳(옛 웹뷰·권한 거절)에서는 숨긴 textarea 를 골라 복사하는 옛 방법으로 한 번 더 해 본다.
 * 됐는지를 돌려준다 — 부르는 쪽이 "복사했어요 / 복사하지 못했어요"를 가려 말한다.
 */
export async function copyText(text: string): Promise<boolean> {
    const value = String(text ?? "");
    if (!value) return false;
    try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch { /* 아래 옛 방법으로 */ }
    try {
        if (typeof document === "undefined") return false;
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        // 화면 밖에 두되 16px — iOS 가 포커스 때 화면을 확대하지 않게
        ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;font-size:16px";
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, value.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}
