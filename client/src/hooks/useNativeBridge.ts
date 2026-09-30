import { useEffect, useState, useCallback } from 'react';
import { hasPlugin } from '@shared/nativeCaps';

// 📡 App -> Native: 메시지 타입
export type AppMessage =
    | { type: 'LOGIN_SUCCESS'; payload: { token: string; user: any } }
    | { type: 'LOGOUT' }
    | { type: 'OPEN_QR_SCANNER' }
    | { type: 'GET_LOCATION' }
    | { type: 'VIBRATE'; payload: { style: 'light' | 'medium' | 'heavy' } }
    | { type: 'SHARE'; payload: { title: string; url: string } };

// 📡 Native -> App: 수신 메시지 타입
export type NativeMessage =
    | { type: 'QR_SCANNED'; payload: { data: string; type: string } }
    | { type: 'LOCATION_UPDATE'; payload: { lat: number; lng: number } }
    | { type: 'FCM_TOKEN'; payload: { token: string } };

/** 위치 요청 결과 — 'denied' 는 사용자가 거부, 'unavailable' 은 기기 위치가 꺼졌거나 시간 초과. */
export type LocationResult = 'granted' | 'denied' | 'unavailable';

/** 위치 한 번 — 정확도(m)는 기기가 안 주면 null */
export interface DeviceFix { lat: number; lng: number; accuracy: number | null }
/** 'prompt' 는 아직 권한을 안 정했는데 묻지 말라고(prompt:false) 해서 묻지 않은 것 */
export type PositionResult = { status: 'granted'; fix: DeviceFix } | { status: 'denied' | 'unavailable' | 'prompt' };

/** 권한 상태를 **묻지 않고** 본다. 'unknown' 은 브라우저가 알려 주지 않는 경우(옛 사파리 등). */
export async function locationPermission(): Promise<'granted' | 'prompt' | 'denied' | 'unknown'> {
    if (hasPlugin('Geolocation')) {
        try {
            const { Geolocation } = await import('@capacitor/geolocation');
            const p = await Geolocation.checkPermissions();
            if (p.location === 'granted' || p.coarseLocation === 'granted') return 'granted';
            if (p.location === 'denied' && p.coarseLocation === 'denied') return 'denied';
            return 'prompt';
        } catch { return 'unknown'; }
    }
    try {
        const perms = typeof navigator !== 'undefined' ? (navigator as any).permissions : null;
        if (!perms?.query) return 'unknown';
        const st = await perms.query({ name: 'geolocation' });
        return st.state === 'granted' ? 'granted' : st.state === 'denied' ? 'denied' : 'prompt';
    } catch { return 'unknown'; }
}

/**
 * 위치 한 번을 **바로** 돌려준다(좌표·정확도) — 현장 인증(2026-09-30)처럼 결과를 기다려 서버에 보내는 쪽이 쓴다.
 * 훅의 requestLocation 도 이걸 거친다(위치를 얻는 길은 하나). 새 앱은 @capacitor/geolocation, 옛 앱·웹은 브라우저 geolocation.
 * prompt=false 면 권한을 묻지 않는다 — 아직 안 정했거나 알 수 없으면 'prompt' 로 끝(라운드 중 조용한 확인이 권한 창을 또 띄우지 않게).
 * 백그라운드 위치는 절대 요청하지 않는다.
 */
export async function getDevicePosition(opts: { prompt: boolean; highAccuracy?: boolean; timeoutMs?: number; maximumAgeMs?: number }): Promise<PositionResult> {
    const { prompt, highAccuracy = false, timeoutMs = 8000, maximumAgeMs = 300000 } = opts;
    const acc = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    if (hasPlugin('Geolocation')) {
        try {
            const { Geolocation } = await import('@capacitor/geolocation');
            const ok = (p: { location: string; coarseLocation: string }) => p.location === 'granted' || p.coarseLocation === 'granted';
            let perm = await Geolocation.checkPermissions();
            if (!ok(perm)) {
                // 영구 거부면 창이 안 뜬다 — 묻지 않고 바로 알린다(안드로이드 첫 거부 뒤는 'prompt-with-rationale' 이라 한 번 더 묻는다)
                if (perm.location === 'denied' && perm.coarseLocation === 'denied') return { status: 'denied' };
                if (!prompt) return { status: 'prompt' };
                perm = await Geolocation.requestPermissions();
                if (!ok(perm)) return { status: 'denied' };
            }
            const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: maximumAgeMs });
            return { status: 'granted', fix: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: acc(pos.coords.accuracy) } };
        } catch {
            // 기기 위치 서비스가 꺼졌거나 시간 초과
            return { status: 'unavailable' };
        }
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) return { status: 'unavailable' };
    if (!prompt) {
        const st = await locationPermission();
        if (st === 'denied') return { status: 'denied' };
        if (st !== 'granted') return { status: 'prompt' };
    }
    return new Promise<PositionResult>((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ status: 'granted', fix: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: acc(pos.coords.accuracy) } }),
            (err) => resolve({ status: err?.code === 1 ? 'denied' : 'unavailable' }),
            { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: maximumAgeMs }
        );
    });
}

declare global {
    interface Window {
        ReactNativeWebView?: {
            postMessage: (message: string) => void;
        };
    }
}

export function useNativeBridge() {
    const [isApp, setIsApp] = useState(false);
    const [fcmToken, setFcmToken] = useState<string | null>(null);
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [locationStatus, setLocationStatus] = useState<LocationResult | null>(null);
    const [scannedQr, setScannedQr] = useState<string | null>(null);

    useEffect(() => {
        const checkIsApp = () => {
            const isWebView = typeof window !== 'undefined' && !!window.ReactNativeWebView;
            const isCustomUA = typeof navigator !== 'undefined' && navigator.userAgent.includes('RankueApp');
            if (isWebView || isCustomUA) {
                setIsApp(true);
            }
        };

        checkIsApp();

        const handleNativeMessage = (event: any) => {
            try {
                const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                console.log('📬 [Bridge] Received:', message);

                switch (message.type) {
                    case 'FCM_TOKEN':
                        setFcmToken(message.payload.token);
                        // TODO: API로 토큰 전송 로직 추가
                        break;
                    case 'LOCATION_UPDATE':
                        setLocation(message.payload);
                        break;
                    case 'QR_SCANNED':
                        setScannedQr(message.payload.data);
                        alert(`QR Scanned: ${message.payload.data}`); // 테스트용 알림
                        break;
                }
            } catch (e) { }
        };

        if (typeof window !== 'undefined') {
            // @ts-ignore
            document.addEventListener('message', handleNativeMessage); // Android
            window.addEventListener('message', handleNativeMessage);   // iOS
        }

        return () => {
            if (typeof window !== 'undefined') {
                // @ts-ignore
                document.removeEventListener('message', handleNativeMessage);
                window.removeEventListener('message', handleNativeMessage);
            }
        };
    }, []);

    const sendMessage = useCallback((message: AppMessage) => {
        if (typeof window !== 'undefined' && window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify(message));
        } else {
            console.log('🌐 [Web Fallback] Message ignored:', message);
        }
    }, []);

    // --- Helper Functions ---

    const openQrScanner = () => sendMessage({ type: 'OPEN_QR_SCANNER' });

    // 위치 요청 — 새 앱: @capacitor/geolocation(네이티브 권한 창 한 번), 옛 앱·웹: 브라우저 geolocation 폴백.
    // iOS 웹뷰의 navigator.geolocation 은 네이티브 권한 창 뒤에 'www.rankue.co.kr' 원본 확인창을 또 띄운다(감사 L2) —
    // 플러그인이 있으면 CoreLocation 을 직접 써서 그 창을 피한다. 대략 위치(enableHighAccuracy:false)면 충분하고,
    // 백그라운드 위치는 절대 요청하지 않는다.
    // 결과를 돌려준다 — 거부('denied')·실패('unavailable')를 부르는 쪽이 안내할 수 있게(감사 L7).
    // 셋 다 같은 location 상태로 수렴하므로 소비자(크루 거리순 등)는 환경을 몰라도 된다.
    const requestLocation = useCallback(async (): Promise<LocationResult> => {
        const settle = (r: LocationResult) => { setLocationStatus(r); return r; };
        if (typeof window !== 'undefined' && window.ReactNativeWebView) {
            sendMessage({ type: 'GET_LOCATION' });
            return settle('granted'); // 옛 RN 래퍼 — 결과는 LOCATION_UPDATE 로 따로 온다
        }
        // 대략 위치(enableHighAccuracy:false)·5분 안의 위치면 충분하다(가까운 골프장·크루 거리순)
        const r = await getDevicePosition({ prompt: true, highAccuracy: false, timeoutMs: 8000, maximumAgeMs: 300000 });
        if (r.status === 'granted') {
            setLocation({ lat: r.fix.lat, lng: r.fix.lng });
            return settle('granted');
        }
        return settle(r.status === 'denied' ? 'denied' : 'unavailable');
    }, [sendMessage]);

    const vibrate = (style: 'light' | 'medium' | 'heavy' = 'medium') =>
        sendMessage({ type: 'VIBRATE', payload: { style } });

    const share = (title: string, url: string) =>
        sendMessage({ type: 'SHARE', payload: { title, url } });

    return {
        isApp,
        fcmToken,
        location,
        scannedQr,
        sendMessage,
        openQrScanner,
        requestLocation,
        locationStatus,
        vibrate,
        share
    };
}
