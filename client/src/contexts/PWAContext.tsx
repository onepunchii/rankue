import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface PWAContextType {
    isStandalone: boolean;
    deferredPrompt: any;
    installApp: () => Promise<void>;
    updateBadge: (count: number) => void;
    clearBadge: () => void;
    share: (data: ShareData) => Promise<void>;
    scheduleNotification: (title: string, options: NotificationOptions, delayMs: number) => void;
}

const PWAContext = createContext<PWAContextType | undefined>(undefined);

export const PWAProvider = ({ children }: { children: ReactNode }) => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        // Check if app is in standalone mode
        const checkStandalone = () => {
            const isS = window.matchMedia('(display-mode: standalone)').matches ||
                (navigator as any).standalone ||
                document.referrer.includes('android-app://');
            setIsStandalone(!!isS);
        };

        checkStandalone();

        // Listen for beforeinstallprompt
        const handleInstallPrompt = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            console.log('✅ [PWA] Install prompt detected');
        };

        window.addEventListener('beforeinstallprompt', handleInstallPrompt);

        // Listen for app installed
        window.addEventListener('appinstalled', () => {
            setDeferredPrompt(null);
            setIsStandalone(true);
            console.log('✅ [PWA] App installed successfully');
        });

        return () => {
            window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
        };
    }, []);

    const installApp = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`[PWA] Install User choice: ${outcome}`);
        setDeferredPrompt(null);
    };

    const updateBadge = (count: number) => {
        if ('setAppBadge' in navigator) {
            (navigator as any).setAppBadge(count).catch(console.error);
        }
    };

    const clearBadge = () => {
        if ('clearAppBadge' in navigator) {
            (navigator as any).clearAppBadge().catch(console.error);
        }
    };

    const share = async (data: ShareData) => {
        if (navigator.share) {
            try {
                await navigator.share(data);
                console.log('✅ [PWA] Shared successfully');
            } catch (err) {
                console.error('❌ [PWA] Share failed:', err);
            }
        } else {
            console.warn('⚠️ [PWA] Web Share API not supported');
            // Fallback: Copy to clipboard?
            if (data.url) {
                navigator.clipboard.writeText(data.url);
                alert('링크가 클립보드에 복사되었습니다.');
            }
        }
    };

    const scheduleNotification = (title: string, options: NotificationOptions, delayMs: number) => {
        if (!('Notification' in window)) return;

        setTimeout(() => {
            if (Notification.permission === 'granted') {
                new Notification(title, options);
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        new Notification(title, options);
                    }
                });
            }
        }, delayMs);
    };

    // Auto-clear badge on start
    useEffect(() => {
        clearBadge();
    }, []);

    return (
        <PWAContext.Provider value={{
            isStandalone,
            deferredPrompt,
            installApp,
            updateBadge,
            clearBadge,
            share,
            scheduleNotification
        }}>
            {children}
        </PWAContext.Provider>
    );
};

export const usePWA = () => {
    const context = useContext(PWAContext);
    if (context === undefined) {
        throw new Error('usePWA must be used within a PWAProvider');
    }
    return context;
};
