/**
 * 배포 직후 '흰 화면'(2026-10-01 오너: "버튼을 누르면 하얗게 변하면서 아무것도 안 나온다, 당구에서 주로").
 *
 * 원인(오류 수집 실측): 앱은 열어 둔 채인데 그 사이 새로 배포하면, 열려 있던 화면은 **옛 빌드의 조각 파일 이름**을
 * 들고 있다. 온라인 대전·대회·용어 사전·홈의 대전 카드처럼 나중에 불러오는(lazy) 화면을 누르면 그 옛 파일을 찾는데,
 * 새 배포엔 없어서 서버가 index.html 을 돌려준다 → "'text/html' is not a valid JavaScript MIME type" /
 * "Importing a module script failed" → React 가 통째로 내려가 흰 화면. 앱(원격 URL 모드)은 며칠씩 켜 두니 더 잦다.
 *
 * 처리: 그 오류면 **한 번** 새로고침한다(새 index.html 이 새 파일 이름을 안다). 20초 안에 또 나면 다시 하지 않는다 —
 * 진짜로 파일이 없는 경우 새로고침이 끝없이 돌지 않게. 그때는 오류 화면(AppErrorBoundary)이 '다시 시도'를 보여 준다.
 */

const RELOAD_KEY = "rankue_chunk_reload_at";
const RELOAD_GUARD_MS = 20_000;

/** 조각 파일을 못 읽은 오류인가 — 브라우저마다 문구가 다르다(크롬·사파리·파이어폭스·웹뷰) */
export function isChunkLoadError(err: unknown): boolean {
    const msg = String((err as { message?: unknown } | null)?.message ?? err ?? "");
    return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|is not a valid JavaScript MIME type|Expected a JavaScript(-or-Wasm)? module script|Unable to preload CSS|ChunkLoadError|Loading chunk [\w-]+ failed/i.test(msg);
}

/** 한 번만 새로고침. 했으면 true, 막 새로고침한 직후라 참았으면 false */
export function reloadOnce(): boolean {
    try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
        if (last && Date.now() - last < RELOAD_GUARD_MS) return false;
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
        // 세션 저장소를 못 쓰면 고리를 막을 길이 없다 — 새로고침하지 않고 오류 화면에 맡긴다
        return false;
    }
    window.location.reload();
    return true;
}

/** main.tsx 에서 한 번. Vite 가 lazy 조각을 못 읽으면 'vite:preloadError' 를 쏜다 */
export function installChunkReload(): void {
    window.addEventListener("vite:preloadError", () => { reloadOnce(); });
}
