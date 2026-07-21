import { useEffect, useState, useCallback } from 'react';

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

    // 위치 요청 — 앱: 네이티브 GPS 브릿지 / 웹: 브라우저 geolocation 폴백.
    // 둘 다 같은 location 상태로 수렴하므로 소비자(크루 거리순 등)는 환경을 몰라도 된다.
    const requestLocation = useCallback(() => {
        if (typeof window !== 'undefined' && window.ReactNativeWebView) {
            sendMessage({ type: 'GET_LOCATION' });
            return;
        }
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => { /* 거부·실패 시 조용히 무시 — 위치 없이도 목록은 동작 */ },
                { timeout: 8000, maximumAge: 300000 }
            );
        }
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
        vibrate,
        share
    };
}
