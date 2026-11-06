/**
 * 위치가 꺼졌을 때의 안내(2026-11-06 오너: "위치 알림 꺼져 있는 사람이면 다시 키게 하는 팝업" → "응 그렇게 하자").
 *
 * 정상 인증 실패 기록(10/24~11/5, hiking_summit_misses): 위치 거부 6번(5명) · 위치를 못 잡음 11번 — 대부분 카카오톡 · 네이버 같은
 * **다른 앱 안의 브라우저**였다. 예전 안내는 "설정에서 위치를 허용한 뒤 다시 눌러 주세요" 한 줄뿐이라, 어느 설정의 무엇을 켜야 하는지
 * 사람마다 달랐다(랭큐 앱 · 카카오톡 안 · 사파리 · 크롬). 여기서 기기와 까닭에 맞는 순서만 고른다 — 화면(LocationHelpSheet)은 그대로 그린다.
 *
 * 문구는 실제 설정 메뉴 이름과 같게 쓴다. 할 수 있는 단추는 두 가지뿐이다:
 *   · settings — 랭큐 앱의 설정 화면을 연다(아이폰은 한 번 거부하면 앱이 다시 물을 수 없어 이 길이 유일하다)
 *   · kakao-external — 카카오톡 안의 화면을 폰의 기본 브라우저로 연다(카카오톡이 받아 주는 주소)
 */
import { josa } from "./briefingMeta.js";

/** 화면이 어디서 열렸나 — 랭큐 앱 · 다른 앱 안의 브라우저 · 보통 브라우저 */
export type LocationClient = "app" | "inapp" | "web";
export type LocationOs = "ios" | "android" | "desktop";
/** denied = 위치 권한이 꺼져 있다 · unavailable = 권한은 있는데 위치를 못 잡았다(폰의 위치가 꺼졌거나 시간 초과) */
export type LocationTrouble = "denied" | "unavailable";
export type LocationHelpAction = "settings" | "kakao-external";

export interface LocationHelp {
    title: string;
    /** 따라 할 순서 — 한 줄에 한 단계 */
    steps: string[];
    /** 단추로 대신 해 줄 수 있는 것(없으면 순서만) */
    action: LocationHelpAction | null;
    /** 순서 밑의 작은 글씨 */
    note: string | null;
}

/** 다른 앱 안의 브라우저면 그 앱의 이름(설정에서 찾을 이름) — 모르면 null */
export function inAppName(ua: unknown): string | null {
    const s = typeof ua === "string" ? ua : "";
    if (/kakaotalk/i.test(s)) return "카카오톡";
    if (/naver\(inapp/i.test(s)) return "네이버";
    if (/instagram/i.test(s)) return "인스타그램";
    if (/fban|fbav/i.test(s)) return "페이스북";
    if (/(?:^|[\s;(])Line\//.test(s)) return "라인";
    if (/daumapps/i.test(s)) return "다음";
    return null;
}

/** 보통 브라우저의 이름 — 위치를 켜는 곳이 브라우저마다 다르다 */
export type WebBrowser = "safari" | "chrome" | "samsung" | "other";
export function webBrowser(ua: unknown): WebBrowser {
    const s = typeof ua === "string" ? ua : "";
    if (/samsungbrowser/i.test(s)) return "samsung";
    if (/crios|chrome\//i.test(s) && !/edg\//i.test(s)) return "chrome";
    if (/safari/i.test(s) && /iphone|ipad|ipod|macintosh/i.test(s)) return "safari";
    return "other";
}

/** 카카오톡 안의 화면을 기본 브라우저로 여는 주소 */
export function kakaoExternalUrl(href: string): string {
    return `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`;
}

/** 폰의 위치(GPS) 자체를 켜는 순서 — 위치를 못 잡았을 때 공통 */
function deviceLocationSteps(os: LocationOs): string[] {
    if (os === "ios") return ["설정 › 개인정보 보호 및 보안 › 위치 서비스를 켜 주세요.", "하늘이 트인 곳에서 잠시 뒤 다시 눌러 주세요."];
    if (os === "android") return ["화면 위에서 아래로 내려 '위치'를 켜 주세요.", "하늘이 트인 곳에서 잠시 뒤 다시 눌러 주세요."];
    return ["하늘이 트인 곳이나 창가에서 잠시 뒤 다시 눌러 주세요."];
}

/**
 * 기기 · 까닭에 맞는 안내. ua 는 화면의 navigator.userAgent(앱 안에서는 client 가 'app' 이라 보지 않는다).
 * canOpenSettings=false 는 설정 화면을 열 수 없는 옛 앱(안드로이드 1세대) — 단추 대신 설정에서 찾는 길을 적는다.
 */
export function locationHelp(o: { client: LocationClient; os: LocationOs; trouble: LocationTrouble; ua?: string; canOpenSettings?: boolean }): LocationHelp {
    const { client, os, trouble } = o;
    if (trouble === "unavailable") {
        const app = client === "inapp" ? inAppName(o.ua) : null;
        return {
            title: "위치를 잡지 못했어요",
            steps: deviceLocationSteps(os),
            // 카카오톡 안에서는 위치가 자주 늦다 — 기본 브라우저로 열면 나아진다(11번 실패가 한 사람의 카카오톡 안 화면이었다)
            action: app === "카카오톡" ? "kakao-external" : null,
            note: client === "inapp" ? `${app ?? "지금 앱"} 안에서는 위치가 늦게 잡힐 때가 있어요. 랭큐 앱이나 브라우저로 열면 더 잘 돼요.` : null,
        };
    }
    if (client === "app") {
        const button = o.canOpenSettings !== false;
        const first = button ? "아래 '설정 열기'를 눌러 주세요." : os === "ios" ? "아이폰 설정 › 랭큐로 가 주세요." : "폰 설정 › 애플리케이션 › 랭큐로 가 주세요.";
        return {
            title: "랭큐 앱의 위치가 꺼져 있어요",
            steps: os === "ios"
                ? [first, "위치 › '앱을 사용하는 동안'을 고르고, '정확한 위치'를 켜 주세요.", "랭큐로 돌아와 다시 눌러 주세요."]
                : [first, "권한 › 위치 › '앱 사용 중에만 허용'을 고르고, '정확한 위치 사용'을 켜 주세요.", "랭큐로 돌아와 다시 눌러 주세요."],
            action: button ? "settings" : null,
            note: "위치는 거리를 재는 데만 쓰고, 좌표는 저장하지 않아요.",
        };
    }
    if (client === "inapp") {
        const app = inAppName(o.ua);
        const name = app ?? "지금 쓰는 앱";
        const steps = os === "ios"
            ? [`아이폰 설정 › ${name} › 위치 › '앱을 사용하는 동안'을 골라 주세요.`, `${josa(name, "로/으로")} 돌아와 다시 누르고, 위치를 물으면 '허용'을 눌러 주세요.`]
            : os === "android"
                ? [`폰 설정 › 애플리케이션 › ${name} › 권한 › 위치 › '앱 사용 중에만 허용'을 골라 주세요.`, `${josa(name, "로/으로")} 돌아와 다시 누르고, 위치를 물으면 '허용'을 눌러 주세요.`]
                : [`${name}의 위치 권한을 켜 주세요.`];
        return {
            title: `${name} 안에서 열린 화면이에요`,
            steps,
            action: app === "카카오톡" ? "kakao-external" : null,
            note: app === "카카오톡"
                ? "브라우저로 열면 다시 로그인해야 할 수 있어요."
                : `${name} 오른쪽 위나 아래의 ⋯ 메뉴에서 '다른 브라우저로 열기'를 골라도 돼요.`,
        };
    }
    // 보통 브라우저 — 사이트마다의 위치 허용
    const b = webBrowser(o.ua);
    const steps = os === "ios"
        ? b === "chrome"
            ? ["아이폰 설정 › Chrome › 위치 › '앱을 사용하는 동안'을 골라 주세요.", "이 화면으로 돌아와 다시 누르고, 위치를 물으면 '허용'을 눌러 주세요."]
            : ["주소창 왼쪽의 '가가' › 웹 사이트 설정 › 위치 › '허용'을 골라 주세요.", "그래도 안 되면 아이폰 설정 › 개인정보 보호 및 보안 › 위치 서비스 › Safari 웹 사이트 › '앱을 사용하는 동안'을 골라 주세요."]
        : os === "android"
            ? ["주소창 왼쪽의 아이콘을 눌러 주세요.", "권한(또는 사이트 설정) › 위치 › '허용'을 골라 주세요.", "이 화면으로 돌아와 다시 눌러 주세요."]
            : ["주소창 왼쪽의 자물쇠 아이콘을 눌러 주세요.", "위치를 '허용'으로 바꾼 뒤 다시 눌러 주세요."];
    return { title: "이 사이트의 위치가 꺼져 있어요", steps, action: null, note: "랭큐 앱으로 하면 위치가 가장 잘 잡혀요." };
}
