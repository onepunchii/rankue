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
        if (hasPlugin('Geolocation')) {
            try {
                const { Geolocation } = await import('@capacitor/geolocation');
                const ok = (p: { location: string; coarseLocation: string }) => p.location === 'granted' || p.coarseLocation === 'granted';
                let perm = await Geolocation.checkPermissions();
                if (!ok(perm)) {
                    // 영구 거부면 창이 안 뜬다 — 묻지 않고 바로 알린다(안드로이드 첫 거부 뒤는 'prompt-with-rationale' 이라 한 번 더 묻는다)
                    if (perm.location === 'denied' && perm.coarseLocation === 'denied') return settle('denied');
                    perm = await Geolocation.requestPermissions();
                    if (!ok(perm)) return settle('denied');
                }
                const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
                setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                return settle('granted');
            } catch {
                // 기기 위치 서비스가 꺼졌거나 시간 초과
                return settle('unavailable');
            }
        }
        if (typeof navigator === 'undefined' || !navigator.geolocation) return settle('unavailable');
        return new Promise<LocationResult>((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    resolve(settle('granted'));
                },
                (err) => resolve(settle(err?.code === 1 ? 'denied' : 'unavailable')),
                { timeout: 8000, maximumAge: 300000 }
            );
        });
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
