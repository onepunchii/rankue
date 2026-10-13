/**
 * 화면이 꺼져도 위치 받기(2026-10-13 오너: "이것도 하자") — 앱 1.4 부터 들어가는 네이티브 기능을 한 곳에서만 부른다.
 *
 * 옛 앱(1.3 까지)과 웹에는 이 기능이 없다 — bgWatchAvailable() 이 false 를 주고, 산행 화면은 예전처럼 화면이 켜진 동안만 본다.
 * 새 앱에서는: 안드로이드는 '산행 기록 중' 알림을 띄운 채(포그라운드 서비스), 아이폰은 위쪽에 위치 표시를 띄운 채 계속 받는다.
 * **'항상 허용'을 묻지 않는다** — 권한은 산행 화면이 이미 받은 '앱을 쓰는 동안'으로 충분하다(requestPermissions: false).
 * 받은 위치는 여기서 화면으로만 넘긴다. 저장하지도 보내지도 않는다(산행 화면의 약속 그대로).
 *
 * 네이티브 쪽은 @capacitor-community/background-geolocation(MIT). 웹 묶음에 그 패키지를 넣지 않으려고 이름으로만 잇는다.
 */
import { registerPlugin } from "@capacitor/core";
import { hasPlugin } from "@shared/nativeCaps";

const PLUGIN = "BackgroundGeolocation";

interface BgLocation { latitude: number; longitude: number; accuracy: number; time: number | null }
interface BgError { code?: string; message?: string }
interface BgPlugin {
    addWatcher(
        options: { backgroundMessage?: string; backgroundTitle?: string; requestPermissions?: boolean; stale?: boolean; distanceFilter?: number },
        callback: (location?: BgLocation | null, error?: BgError | null) => void,
    ): Promise<string>;
    removeWatcher(options: { id: string }): Promise<void>;
}

let plugin: BgPlugin | null = null;
const bg = (): BgPlugin => (plugin ??= registerPlugin<BgPlugin>(PLUGIN));

/** 이 앱이 화면이 꺼져도 위치를 받을 수 있는가(앱 1.4 부터). 웹 · 옛 앱은 늘 false */
export const bgWatchAvailable = (): boolean => hasPlugin(PLUGIN);

export interface BgFix { lat: number; lng: number; accuracy: number | null }

/**
 * 받기 시작 — 끄는 함수를 돌려준다(여러 번 불러도 된다). 시작하지 못하면 null(부른 쪽이 예전 방식으로 돌아간다).
 * denied = 위치 권한이 꺼졌다(기록 중에 설정에서 끈 경우).
 */
export async function startBgWatch(opts: {
    title: string; message: string; distanceM: number;
    onFix: (fix: BgFix) => void; onDenied: () => void;
}): Promise<(() => void) | null> {
    if (!bgWatchAvailable()) return null;
    try {
        const id = await bg().addWatcher(
            { backgroundTitle: opts.title, backgroundMessage: opts.message, requestPermissions: false, stale: false, distanceFilter: opts.distanceM },
            (location, error) => {
                if (error) { if (error.code === "NOT_AUTHORIZED") opts.onDenied(); return; }
                if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return;
                opts.onFix({ lat: location.latitude, lng: location.longitude, accuracy: Number.isFinite(location.accuracy) ? location.accuracy : null });
            },
        );
        let off = false;
        return () => {
            if (off) return;
            off = true;
            bg().removeWatcher({ id }).catch(() => { /* 이미 꺼졌다 */ });
        };
    } catch {
        return null;
    }
}
