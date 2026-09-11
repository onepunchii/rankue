// 앱 안에서 이동할 주소를 고르는 순수 함수들 — 딥링크·푸시 탭·오프라인 복귀가 모두 여기를 거친다.
//
// 이 값들은 외부에서 온다(카톡 링크, 푸시 페이로드, 기기 저장소). 그대로 라우터에 넘기면
// '//evil.com'(프로토콜 상대 주소)이나 '/\evil.com'(브라우저가 \ 를 / 로 바꾼다) 같은 값이
// 다른 사이트로의 이동이 된다. 그래서 "우리 사이트 안의 경로"만 통과시킨다.

export const SITE_ORIGIN = "https://www.rankue.co.kr";
const SITE_HOSTS = new Set(["www.rankue.co.kr", "rankue.co.kr"]);
const MAX_PATH_LENGTH = 2048;

/**
 * 앱 내부 경로만 통과시킨다. '/'로 시작, '//' 아님, 역슬래시·제어문자·공백 없음, 파싱 후에도 같은 오리진.
 * 통과하면 pathname+search+hash 로 정규화해 돌려주고, 아니면 null.
 */
export function sanitizeInternalPath(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    if (raw.length === 0 || raw.length > MAX_PATH_LENGTH) return null;
    if (!raw.startsWith("/") || raw.startsWith("//")) return null;
    // 역슬래시, 제어문자(탭·개행 포함 — URL 파서가 지워서 '/\t/evil.com' 이 '//evil.com' 이 된다), 공백
    if (/[\\\u0000-\u0020\u007f]/.test(raw)) return null;
    let u: URL;
    try {
        u = new URL(raw, SITE_ORIGIN);
    } catch {
        return null;
    }
    if (u.origin !== SITE_ORIGIN) return null;
    return u.pathname + u.search + u.hash;
}

// rankue://open 뒤가 끝이거나 / ? # 로 이어질 때만. 'rankue://opener' 같은 다른 호스트는 걸러진다.
const RANKUE_OPEN = /^rankue:\/\/open(?=[/?#]|$)/i;

/**
 * 앱을 연 URL → 앱 내부 경로. 받는 형태는 이것뿐이다.
 *   https://www.rankue.co.kr/<path>   (App Links / Universal Links)
 *   https://rankue.co.kr/<path>       (apex — 서버가 www 로 넘기는 주소)
 *   rankue://open?path=<path>         (커스텀 스킴 — 카톡 인앱 브라우저의 '앱에서 열기'. 공식 모양)
 *   rankue://open/<path>              (같은 스킴의 경로 모양 — 안드로이드 매니페스트는 host=open 만 보므로 이것도 앱에 온다)
 * 그 밖의 URL(구글 로그인 복귀 같은 다른 스킴·호스트)은 null — 우리가 이동시키면 안 되는 것들이다.
 */
export function deepLinkToPath(url: unknown): string | null {
    if (typeof url !== "string" || url.length > MAX_PATH_LENGTH * 2) return null;
    const custom = RANKUE_OPEN.exec(url);
    if (custom) {
        // 커스텀 스킴은 new URL 로 풀지 않는다 — 옛 안드로이드 웹뷰(크롬 130 이전)는 비표준 스킴의 호스트를 비워 두고
        // '//open/...' 전체를 경로로 읽어서, 같은 링크가 기기마다 다르게 풀린다.
        const rest = url.slice(custom[0].length);
        const pathEnd = rest.search(/[?#]/);
        const pathPart = pathEnd === -1 ? rest : rest.slice(0, pathEnd);
        if (pathPart !== "" && pathPart !== "/") return sanitizeInternalPath(rest);
        const hashAt = rest.indexOf("#");
        const query = pathEnd !== -1 && rest[pathEnd] === "?" ? rest.slice(pathEnd + 1, hashAt === -1 ? undefined : hashAt) : "";
        return sanitizeInternalPath(new URLSearchParams(query).get("path"));
    }
    let u: URL;
    try {
        u = new URL(url);
    } catch {
        return null;
    }
    if (u.protocol === "https:" && SITE_HOSTS.has(u.hostname) && (u.port === "" || u.port === "443")) {
        if (u.username || u.password) return null;
        return sanitizeInternalPath(u.pathname + u.search + u.hash);
    }
    return null;
}

/** 오프라인 안내 페이지에서 돌아왔을 때 되돌아갈 경로를 기억하는 저장소 키와 유효 시간. */
export const LAST_PATH_KEY = "rankue_last_path";
export const RESUME_MAX_AGE_MS = 60 * 60 * 1000;

export type SavedPath = { path?: unknown; at?: unknown };

/**
 * 저장된 마지막 경로 → 복귀할 경로(순수). 1시간이 넘었거나, 미래 시각이거나, 내부 경로가 아니면 null.
 * 1시간 제한: 어제 보던 경기로 갑자기 떨어지면 오히려 혼란스럽다.
 */
export function resumeTarget(saved: SavedPath | null | undefined, now: number): string | null {
    if (!saved || typeof saved !== "object") return null;
    const at = saved.at;
    if (typeof at !== "number" || !Number.isFinite(at)) return null;
    const age = now - at;
    if (age < 0 || age > RESUME_MAX_AGE_MS) return null;
    const path = sanitizeInternalPath(saved.path);
    if (!path) return null;
    // 복귀 표식이 남은 주소로 되돌아가면 다시 복귀를 시도하는 고리가 된다
    if (/[?&]resume=1(?:&|#|$)/.test(path)) return null;
    return path;
}
