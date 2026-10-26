/**
 * 카카오 지도 SDK 와 유료 호출의 허락(2026-10-25) — 코스 지도의 실제 지도 · 로드뷰 · 근처 장소가 같이 쓴다. 규칙은 shared/kakaoMap.
 *   · SDK 는 한 번만 받는다(services 묶음까지 — 근처 장소 검색이 쓴다). SDK 를 받는 것 자체에는 요금이 없다.
 *   · 유료 호출(지도 · 로드뷰를 만들기, 장소를 한 번 찾기) **직전에** askKakao(kind): 기기 하루 상한 → 서버 하루 상한(POST map-load).
 *     허락받은 뒤에만 기기 수를 올린다. 하나라도 막히면 부르지 않는다.
 * 키는 로그인과 같은 앱 키(VITE_KAKAO_JS_KEY — 덮어쓰기 VITE_KAKAO_MAP_KEY). 키가 없는 빌드에서는 어디에도 단추가 없다(kakaoMapReady).
 */
import { apiRequest } from "@/lib/queryClient";
import { KAKAO_KIND, KAKAO_MAP_LOAD_API, KAKAO_MAP_SDK_URL, deviceAllows, kstDay, type KakaoKind, type KakaoMapGate } from "@shared/kakaoMap";

declare global { interface Window { kakao?: any } }

const KEY = (import.meta.env.VITE_KAKAO_MAP_KEY || import.meta.env.VITE_KAKAO_JS_KEY) as string | undefined;
/** 이 빌드에서 카카오 지도를 쓸 수 있는가(키가 있다) */
export const kakaoMapReady = !!KEY;

export type KakaoMapFail = "device" | "cap" | "off" | "net" | "sdk";
/** 기기 하루 수를 적는 칸 — 지도는 처음 쓰던 이름 그대로 */
const DEVICE_KEY: Record<KakaoKind, string> = { map: "rankue_kmap_day", roadview: "rankue_kroad_day", local: "rankue_klocal_day" };

let sdk: Promise<any> | null = null;
/** SDK 를 받는다(같은 화면 안에서 여러 번 불러도 한 번). 실패하면 다음에 다시 받을 수 있게 비운다 */
export function loadKakaoMaps(): Promise<any> {
    if (window.kakao?.maps?.Map && window.kakao?.maps?.services) return Promise.resolve(window.kakao);
    if (sdk) return sdk;
    sdk = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = `${KAKAO_MAP_SDK_URL}?appkey=${encodeURIComponent(KEY ?? "")}&autoload=false&libraries=services`;
        s.async = true;
        const timer = window.setTimeout(() => reject(new Error("timeout")), 12_000);
        s.onload = () => {
            try { window.kakao.maps.load(() => { window.clearTimeout(timer); resolve(window.kakao); }); } catch (e) { window.clearTimeout(timer); reject(e); }
        };
        s.onerror = () => { window.clearTimeout(timer); reject(new Error("load")); };
        document.head.appendChild(s);
    }).catch((e) => { sdk = null; throw e; });
    return sdk;
}

/** 유료 호출을 해도 되는가 — 기기 하루 상한 → 서버 하루 상한. 허락받은 뒤에만 기기 수를 올린다 */
export async function askKakao(kind: KakaoKind): Promise<"ok" | KakaoMapFail> {
    if (!KEY) return "sdk";
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(DEVICE_KEY[kind]); } catch { /* 못 읽으면 막지 않는다 — 서버 상한이 뒤에 있다 */ }
    const device = deviceAllows(stored, kstDay(new Date()), KAKAO_KIND[kind].device);
    if (!device.ok) return "device";
    try {
        const r = (await apiRequest(KAKAO_MAP_LOAD_API, { method: "POST", body: { kind }, timeoutMs: 8000 })) as KakaoMapGate;
        if (!r?.ok) return r?.reason === "off" ? "off" : "cap";
    } catch { return "net"; }
    try { window.localStorage.setItem(DEVICE_KEY[kind], device.next); } catch { /* 이번만 */ }
    return "ok";
}

/** 못 했을 때의 한 줄 — 무엇이 안 되는지만, 탓하지 않게. what 은 조사까지 붙여 준다("로드뷰를") */
export function kakaoFailText(why: KakaoMapFail, what: string): string {
    if (why === "device") return `오늘은 이 기기에서 ${what} 많이 열었어요 — 내일 다시 쓸 수 있어요.`;
    if (why === "cap" || why === "off") return `지금은 ${what} 쉬고 있어요.`;
    return `${what} 불러오지 못했어요 — 신호가 약한 곳에서는 잠시 뒤에 다시 눌러 주세요.`;
}

/**
 * 좌표 → '시도 시군구'(2026-10-26 오너: "크루 개설할 때 위치 설정에 자동으로 주소가 안 뜨네") — 카카오 좌표→행정구역.
 * 사람이 '현재 위치 사용'을 눌렀을 때만 부른다(유료 — 근처 장소와 같은 하루 상한 askKakao("local")).
 * 행정동(H) 줄을 쓴다: region_1depth(시도) + region_2depth(시군구 — '고양시 덕양구'처럼 둘이 붙어 온다). 세종처럼 시군구가 없으면 시도만.
 */
export async function regionFromCoords(lat: number, lng: number): Promise<{ region: string } | { fail: KakaoMapFail | "none" }> {
    const ok = await askKakao("local");
    if (ok !== "ok") return { fail: ok };
    let kakao: any;
    try { kakao = await loadKakaoMaps(); } catch { return { fail: "sdk" }; }
    return new Promise((resolve) => {
        try {
            new kakao.maps.services.Geocoder().coord2RegionCode(lng, lat, (rows: any[], status: string) => {
                if (status !== kakao.maps.services.Status.OK || !Array.isArray(rows) || !rows.length) return resolve({ fail: "none" });
                const r = rows.find((x) => x?.region_type === "H") ?? rows[0];
                const region = [r?.region_1depth_name, r?.region_2depth_name].filter((x) => typeof x === "string" && x.trim()).join(" ").trim();
                resolve(region ? { region } : { fail: "none" });
            });
        } catch { resolve({ fail: "sdk" }); }
    });
}
