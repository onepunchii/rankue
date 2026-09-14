import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { Filesystem, Directory } from "@capacitor/filesystem";

// 이미지 한 장 공유·저장의 단일 진입점 (선수 카드 등 서버가 만든 PNG).
//
// 경로별 사실(ShareResultCard 에서 실측한 것과 같다):
//  1) 네이티브 앱(WebView): navigator.share 의 파일 공유도 <a download> 도 조용히 아무 일도 안 한다.
//     캐시에 파일을 쓴 뒤 Share 플러그인으로 OS 공유 시트를 띄우는 길만 확실하다.
//  2) 모바일 브라우저: navigator.canShare({files}) 가 되면 OS 시트(카톡·사진 저장으로 바로).
//  3) 데스크톱 브라우저: 파일 공유가 없으니 다운로드.
//  4) 사용자가 시트를 닫은 것은 실패가 아니다.
export type ShareImageOutcome = "shared" | "downloaded" | "cancelled" | "failed";

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(blob);
    });
}

async function shareNative(blob: Blob, filename: string, title: string, text: string): Promise<ShareImageOutcome | null> {
    // 옛 안드로이드 앱(1.0.2)에는 Share·Filesystem 플러그인이 없다 — 부르면 실패 뒤에야 폴백하니 미리 거른다.
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("Share") || !Capacitor.isPluginAvailable("Filesystem")) return null;
    try {
        const dataUrl = await blobToDataUrl(blob);
        const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        const written = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
        await Share.share({ title, text, files: [written.uri] });
        return "shared";
    } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (/cancel|abort|dismiss/i.test(msg)) return "cancelled";
        console.warn("[shareImage] native share failed", e);
        return null; // 웹 경로로 폴백
    }
}

export async function shareImage(opts: { url: string; filename: string; title: string; text: string }): Promise<ShareImageOutcome> {
    const { url, filename, title, text } = opts;
    let blob: Blob;
    try {
        const res = await fetch(url, { credentials: "omit" });
        if (!res.ok) return "failed";
        blob = await res.blob();
    } catch {
        return "failed";
    }

    const native = await shareNative(blob, filename, title, text);
    if (native) return native;

    // 모바일 브라우저 — 파일 공유 시트
    try {
        const file = new File([blob], filename, { type: blob.type || "image/png" });
        if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title, text });
            return "shared";
        }
    } catch (e: any) {
        if (e?.name === "AbortError") return "cancelled";
        /* 파일 공유가 막힌 브라우저 — 다운로드로 */
    }

    // 데스크톱 — 다운로드
    try {
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 10_000);
        return "downloaded";
    } catch {
        return "failed";
    }
}
