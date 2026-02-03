import { useEffect, useRef, useState, useCallback } from 'react';
import { BackHandler, Platform, StatusBar, StyleSheet, View, Animated, Image, Text, TouchableOpacity, Share, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as NavigationBar from 'expo-navigation-bar';

const WEB_URL = 'https://rankue-pi.vercel.app';

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

// --- Custom Hooks ---

const usePushNotifications = () => {
    const [expoPushToken, setExpoPushToken] = useState('');

    const registerForPushNotificationsAsync = async () => {
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });
        }

        if (Device.isDevice) {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;
            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }
            if (finalStatus !== 'granted') return;

            const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
            const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
            setExpoPushToken(token);
            return token;
        }
    };

    useEffect(() => {
        registerForPushNotificationsAsync();
    }, []);

    return { expoPushToken };
};

const useUserAgent = () => {
    const [userAgent, setUserAgent] = useState('');
    useEffect(() => {
        const getUA = async () => {
            try {
                const systemUA = await Constants.getWebViewUserAgentAsync();
                setUserAgent(`${systemUA} RankueApp`);
            } catch (_) {
                setUserAgent('Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.50 Mobile Safari/537.36 RankueApp');
            }
        };
        getUA();
    }, []);
    return userAgent;
};

// --- Main App ---

export default function App() {
    const webViewRef = useRef<WebView>(null);
    const [initialScript, setInitialScript] = useState('');

    // States
    const [isAppReady, setIsAppReady] = useState(false);
    const [isWebViewLoaded, setIsWebViewLoaded] = useState(false);
    const [canGoBack, setCanGoBack] = useState(false);

    const { expoPushToken } = usePushNotifications();
    const userAgent = useUserAgent();

    const fadeAnim = useRef(new Animated.Value(1)).current;
    const [isSplashVisible, setIsSplashVisible] = useState(true);

    // Camera State
    const [isScanning, setIsScanning] = useState(false);
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);

    const sendToWeb = useCallback((type: string, payload: any = {}) => {
        const message = JSON.stringify({ type, payload });
        webViewRef.current?.postMessage(message);
    }, []);

    // --- Handlers ---

    const handleLocation = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                sendToWeb('LOCATION_ERROR', { message: 'Permission denied' });
                return;
            }
            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            sendToWeb('LOCATION_UPDATE', {
                lat: location.coords.latitude,
                lng: location.coords.longitude
            });
        } catch (_) {
            sendToWeb('LOCATION_ERROR', { message: 'Failed to get location' });
        }
    };

    const handleHaptic = async (style: string) => {
        switch (style) {
            case 'light': await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); break;
            case 'medium': await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); break;
            case 'heavy': await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); break;
            case 'success': await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); break;
            case 'error': await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); break;
            default: await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); break;
        }
    };

    const handleShare = async (payload: { title?: string, url?: string, message?: string }) => {
        try {
            const { title, url, message } = payload;
            const shareMessage = message ? `${message} ${url || ''}` : url;
            await Share.share({ title: title || 'Rankue', message: shareMessage || '', url: url });
        } catch (_) { }
    };

    const handleBarCodeScanned = ({ type, data }: { type: string, data: string }) => {
        if (scanned) return;
        setScanned(true);
        setIsScanning(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        sendToWeb('QR_SCANNED', { data, type });
    };

    // --- Initialization ---

    // 1. Android Navigation Bar
    useEffect(() => {
        async function configureAndroidNavigationBar() {
            if (Platform.OS === 'android') {
                try {
                    // 배경을 검정색으로 설정 및 상대적 위치 강제 (비침 방지)
                    await NavigationBar.setPositionAsync('relative');
                    await NavigationBar.setBackgroundColorAsync("#000000");
                    await NavigationBar.setButtonStyleAsync("light");
                } catch (_) { }
            }
        }
        configureAndroidNavigationBar();
    }, []);

    // 2. Load Resources
    useEffect(() => {
        async function loadResources() {
            try {
                const token = await SecureStore.getItemAsync('hiq_auth_token');
                if (token) {
                    const script = `try { window.localStorage.setItem('hiq_auth_token', '${token}'); } catch (e) {} true;`;
                    setInitialScript(script);
                }
            } catch (_) {
            } finally {
                setIsAppReady(true);
            }
        }
        loadResources();
    }, []);

    // 3. Splash logic
    useEffect(() => {
        if (isAppReady && isWebViewLoaded) {
            const hideSplash = async () => {
                await SplashScreen.hideAsync();
                if (expoPushToken) sendToWeb('FCM_TOKEN', { token: expoPushToken });
                setTimeout(() => {
                    Animated.timing(fadeAnim, { toValue: 0, duration: 800, useNativeDriver: true }).start(() => setIsSplashVisible(false));
                }, 300);
            };
            hideSplash();
        }
    }, [isAppReady, isWebViewLoaded, expoPushToken, sendToWeb, fadeAnim]);

    // Back Handler
    useEffect(() => {
        const onBackPress = () => {
            if (isScanning) {
                setIsScanning(false);
                return true;
            }
            if (canGoBack && webViewRef.current) {
                webViewRef.current.goBack();
                return true;
            }
            return false;
        };
        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
    }, [isScanning, canGoBack]);

    // Bridge Listener
    const handleMessage = async (event: any) => {
        try {
            const message = JSON.parse(event.nativeEvent.data);
            switch (message.type) {
                case 'LOGIN_SUCCESS':
                    if (message.payload?.token) await SecureStore.setItemAsync('hiq_auth_token', message.payload.token);
                    if (expoPushToken) sendToWeb('FCM_TOKEN', { token: expoPushToken });
                    break;
                case 'LOGOUT':
                    await SecureStore.deleteItemAsync('hiq_auth_token');
                    break;
                case 'VIBRATE':
                    await handleHaptic(message.payload?.style);
                    break;
                case 'GET_LOCATION':
                    handleLocation();
                    break;
                case 'SHARE':
                    handleShare(message.payload || {});
                    break;
                case 'OPEN_QR_SCANNER':
                    if (!permission) return;
                    if (!permission.granted) {
                        const perm = await requestPermission();
                        if (!perm.granted) {
                            Alert.alert('권한 필요', 'QR 스캔을 위해 카메라 권한을 허용해주세요.');
                            return;
                        }
                    }
                    setScanned(false);
                    setIsScanning(true);
                    break;
            }
        } catch (_) { }
    };

    if (!isAppReady) return null;

    return (
        <SafeAreaProvider>
            {/* 핵심 수정: edges에 'bottom' 추가하여 시스템 바 영역과 확실히 분리 */}
            <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
                <StatusBar barStyle="light-content" backgroundColor="#000" />

                <WebView
                    ref={webViewRef}
                    source={{ uri: WEB_URL }}
                    style={styles.webview}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    onMessage={handleMessage}
                    injectedJavaScriptBeforeContentLoaded={initialScript}
                    onNavigationStateChange={(navState) => setCanGoBack(navState.canGoBack)}
                    onLoadEnd={() => setIsWebViewLoaded(true)}
                    originWhitelist={['*']}
                    userAgent={userAgent}
                    androidLayerType="hardware"
                    overScrollMode="never"
                />

                {isScanning && (
                    <View style={styles.cameraContainer}>
                        <CameraView
                            style={styles.camera}
                            facing="back"
                            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                        >
                            <View style={styles.overlay}>
                                <View style={styles.unfocusedContainer}></View>
                                <View style={styles.middleContainer}>
                                    <View style={styles.unfocusedContainer}></View>
                                    <View style={styles.focusedContainer}>
                                        <View style={[styles.corner, styles.topLeft]} />
                                        <View style={[styles.corner, styles.topRight]} />
                                        <View style={[styles.corner, styles.bottomLeft]} />
                                        <View style={[styles.corner, styles.bottomRight]} />
                                    </View>
                                    <View style={styles.unfocusedContainer}></View>
                                </View>
                                <View style={styles.unfocusedContainer}></View>
                            </View>
                            <TouchableOpacity style={styles.closeButton} onPress={() => setIsScanning(false)}>
                                <Text style={styles.closeText}>닫기</Text>
                            </TouchableOpacity>
                        </CameraView>
                    </View>
                )}

                {isSplashVisible && (
                    <Animated.View style={[styles.splashContainer, { opacity: fadeAnim }]}>
                        <Image source={require('./assets/images/splash-icon.png')} style={styles.splashImage} resizeMode="contain" />
                    </Animated.View>
                )}
            </SafeAreaView>
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    webview: { flex: 1, backgroundColor: '#000' },
    splashContainer: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
    splashImage: { width: '60%', height: '60%' },
    cameraContainer: { ...StyleSheet.absoluteFillObject, zIndex: 1000, backgroundColor: 'black' },
    camera: { flex: 1 },
    closeButton: { position: 'absolute', top: 60, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
    closeText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    unfocusedContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
    middleContainer: { flexDirection: 'row', flex: 1.5 },
    focusedContainer: { flex: 6 },
    corner: { position: 'absolute', width: 20, height: 20, borderColor: '#00FF00', borderWidth: 4 },
    topLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
    topRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
    bottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
    bottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
});
