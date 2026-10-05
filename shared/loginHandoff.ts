/**
 * '앱에서 열기' — 웹의 로그인을 앱으로 넘겨준다(2026-10-06 오너: "웹에서 로그인한 사람이 앱을 깔았을 때 다시 로그인하지 않고
 * 그대로 이어 쓰게. 새 앱 빌드 없이").
 *
 * 흐름: 웹(로그인됨)이 POST /api/hiq/handoff 로 **한 번만 쓰는 토큰**을 받는다 → 그 토큰을 실은 앱 주소(rankue://open?path=…)를 연다
 * → 앱이 그 주소에서 토큰을 **떼어** 받는 쪽에 건네고, 화면은 토큰 없는 /dashboard 로 옮긴다(shared/deepLink openedAppLink · lib/nativeBridge openDeepLink)
 * → 받는 쪽(components/hiq/HandoffRedeemer)이 로그인돼 있지 않은지 확인하고, **물어본 뒤** POST /api/hiq/handoff/redeem 으로 쿠키와 바꾼다.
 * 앱의 웹뷰는 https://www.rankue.co.kr 을 그대로 띄우므로 그 쿠키가 1차 쿠키로 잡힌다 — 지금 스토어에 있는 앱(1.2)에서 그대로 된다.
 *
 * 2026-10-06 검토 — 토큰이 든 링크를 남에게 보내면 받은 사람이 보낸 사람의 계정으로 로그인됐다(링크형 로그인 CSRF). 그래서 토큰은
 * **앱이 커스텀 스킴으로 받은 것만** 쓴다: 주소(?handoff=)에 실려 온 것은 웹 브라우저든 앱이든 지우기만 하고, https 앱 링크에 실린 것도 버린다.
 * 바꾸기 전에는 묻고, 이미 로그인된 요청은 서버가 바꿔 주지 않는다(409).
 *
 * 여기에는 순수 함수와 숫자만 둔다(화면 번들에도 실린다 — 비밀 값이 없다). 토큰을 만들고 해시하는 일은 서버가 한다
 * (server/routes/modules/handoff.ts). 서버는 토큰 원문을 저장하지 않는다(sha256 만).
 */

/** 토큰이 살아 있는 시간(초). 단추를 누르고 앱이 뜰 때까지면 충분하다 — 길게 두면 주운 주소가 로그인 수단이 된다. */
export const HANDOFF_TTL_SEC = 120;
/** 토큰을 싣는 쿼리 이름. */
export const HANDOFF_PARAM = "handoff";
/** 앱이 열릴 화면 — 홈. 비로그인에게도 열려 있어(2026-10-05) 바꾸는 동안 빈 화면이 없다. */
export const HANDOFF_LAND_PATH = "/dashboard";
/** 회원 한 명이 HANDOFF_ISSUE_WINDOW_SEC 동안 받을 수 있는 토큰 수 — 넘으면 429. */
export const HANDOFF_ISSUE_MAX = 5;
export const HANDOFF_ISSUE_WINDOW_SEC = 10 * 60;

/** 앱의 커스텀 스킴과 안드로이드 패키지 — iOS Info.plist(CFBundleURLSchemes) · AndroidManifest(scheme=rankue host=open) · build.gradle(applicationId) 와 같아야 한다. */
export const HANDOFF_SCHEME = "rankue";
export const HANDOFF_ANDROID_PACKAGE = "com.rankue.app";

/** 난수 32바이트를 base64url 로 적은 길이(패딩 없음). */
export const HANDOFF_TOKEN_LENGTH = 43;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** 토큰 꼴인가 — 서버는 이 검사를 통과한 값만 해시해 찾고, 화면은 통과한 값만 서버에 보낸다. */
export function isHandoffToken(raw: unknown): raw is string {
    return typeof raw === "string" && TOKEN_RE.test(raw);
}

/** 앱 안에서 열릴 경로: /dashboard?handoff=<토큰>. */
export function handoffPath(token: string): string {
    return `${HANDOFF_LAND_PATH}?${HANDOFF_PARAM}=${encodeURIComponent(token)}`;
}

/**
 * 앱을 여는 주소(iOS·공통): rankue://open?path=<경로>. 경로는 통째로 한 번 감싼다 —
 * 안 감싸면 경로 안의 '?handoff=' 가 바깥 쿼리와 섞여 deepLinkToPath 가 path 만 읽고 토큰을 버린다.
 *
 * ★ 알고 두는 틈(2026-10-06 검토, iOS): 커스텀 스킴은 한 앱의 것이 아니다. 같은 스킴(rankue)을 등록한 다른 앱이 깔린 아이폰에서는
 *   iOS 가 그 앱을 열 수 있고, 그 앱은 받은 토큰을 120초 안에 쿠키와 바꿀 수 있다(안드로이드는 아래 intent 주소가 패키지를 못 박아 막는다).
 *   그 앱이 미리 깔려 있어야 하고 회원이 직접 눌러야 한다. 막으려면 검증된 앱만 받는 유니버설 링크(https)로 넘겨야 하는데,
 *   같은 호스트 안에서 누른 링크는 iOS 가 앱으로 넘기지 않아 다른 호스트의 경유 화면이 필요하고 기기 확인도 거쳐야 한다 — 따로 정할 일이다.
 */
export function handoffAppUrl(token: string): string {
    return `${HANDOFF_SCHEME}://open?path=${encodeURIComponent(handoffPath(token))}`;
}

/**
 * 안드로이드용: intent://open?path=…#Intent;scheme=rankue;package=com.rankue.app;end
 * 패키지를 못 박는다 — 커스텀 스킴은 아무 앱이나 등록할 수 있어서, 같은 스킴을 등록한 다른 앱이 토큰이 실린 주소를 받아 갈 수 있다.
 * 패키지가 있으면 그 앱에만 전달되고(앱이 받는 주소는 rankue://open?path=… 로 위와 같다), 앱이 없으면 플레이스토어의 그 패키지로 간다.
 */
export function handoffIntentUrl(token: string): string {
    return `intent://open?path=${encodeURIComponent(handoffPath(token))}#Intent;scheme=${HANDOFF_SCHEME};package=${HANDOFF_ANDROID_PACKAGE};end`;
}

/** POST /api/hiq/handoff 의 답. 토큰은 이 두 주소 안에만 있다 — 화면은 저장하지 말고 바로 연다. */
export type HandoffIssue = { appUrl: string; intentUrl: string; expiresInSec: number };

export type HandoffTake = {
    /** 주소에 handoff 가 실려 있었는가 — 꼴이 틀린 값이어도 true 다(그래도 주소에서 지워야 한다). */
    present: boolean;
    /** 꼴이 맞는 토큰. 없거나 꼴이 틀리면 null. */
    token: string | null;
    /** handoff 를 뺀 주소(경로 + 남은 쿼리 + 해시) — history.replaceState 에 그대로 넣는다. 다른 쿼리는 글자 그대로 둔다. */
    cleaned: string;
};

function decodePart(s: string): string {
    try {
        return decodeURIComponent(s.replace(/\+/g, " "));
    } catch {
        return s;
    }
}

/**
 * 주소(window.location.href 나 경로)에서 토큰을 꺼내고, 토큰을 지운 주소를 돌려준다.
 * 받는 쪽은 서버를 부르기 **전에** cleaned 로 주소를 바꿔 끼운다 — 새로고침·공유·뒤로 가기로 같은 토큰이 다시 쓰이지 않게.
 * URL 파서를 쓰지 않고 글자로 가른다: 다른 쿼리(?pin= 등)를 다시 적으면서 모양이 바뀌는 일이 없게.
 */
export function takeHandoffFromUrl(href: unknown): HandoffTake {
    if (typeof href !== "string") return { present: false, token: null, cleaned: "/" };
    // 원본(https://host)은 떼고 경로부터 본다
    const rest = href.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]*/, "");
    const hashAt = rest.indexOf("#");
    const hash = hashAt === -1 ? "" : rest.slice(hashAt);
    const beforeHash = hashAt === -1 ? rest : rest.slice(0, hashAt);
    const queryAt = beforeHash.indexOf("?");
    const path = (queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt)) || "/";
    const query = queryAt === -1 ? "" : beforeHash.slice(queryAt + 1);

    let present = false;
    let first: string | null = null;
    const kept: string[] = [];
    for (const pair of query.split("&")) {
        if (pair === "") continue;
        const eq = pair.indexOf("=");
        const key = decodePart(eq === -1 ? pair : pair.slice(0, eq));
        if (key !== HANDOFF_PARAM) {
            kept.push(pair);
            continue;
        }
        // 같은 이름이 여러 번 와도 전부 지운다. 쓰는 값은 첫 번째뿐이다
        if (!present) first = eq === -1 ? "" : decodePart(pair.slice(eq + 1));
        present = true;
    }
    return {
        present,
        token: isHandoffToken(first) ? first : null,
        cleaned: path + (kept.length ? `?${kept.join("&")}` : "") + hash,
    };
}
