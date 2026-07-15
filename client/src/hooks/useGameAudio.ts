import { useCallback, useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

export function useGameAudio() {
    const [isMuted, setIsMuted] = useState(false);
    const synthRef = useRef<SpeechSynthesis | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const unlockedRef = useRef(false);

    // One shared AudioContext, created lazily. Mobile webviews cap the number of contexts
    // and start each one 'suspended' until a user gesture resumes it — so the old code that
    // did `new AudioContext()` on every beep would eventually fail. Reuse a single one.
    const getCtx = useCallback((): AudioContext | null => {
        if (typeof window === 'undefined') return null;
        if (!audioCtxRef.current) {
            const AC = window.AudioContext || (window as any).webkitAudioContext;
            if (!AC) return null;
            audioCtxRef.current = new AC();
        }
        return audioCtxRef.current;
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            synthRef.current = window.speechSynthesis;
            window.speechSynthesis.cancel();
            const loadVoices = () => window.speechSynthesis.getVoices();
            loadVoices();
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
    }, []);

    // Audio on mobile webviews (iOS WKWebView / Android) stays locked until the user
    // interacts. Prime speechSynthesis + AudioContext on the first gesture so the later
    // game callbacks (score/inning/turn), which don't originate from a direct tap, can
    // actually produce sound. This is why match TTS was silent after the Capacitor move.
    useEffect(() => {
        const unlock = () => {
            if (unlockedRef.current) return;
            unlockedRef.current = true;
            const synth = synthRef.current;
            if (synth) {
                try {
                    synth.resume();
                    const prime = new SpeechSynthesisUtterance(' ');
                    prime.volume = 0;
                    synth.speak(prime);
                } catch { /* noop */ }
            }
            try { getCtx()?.resume(); } catch { /* noop */ }
        };
        window.addEventListener('pointerdown', unlock);
        window.addEventListener('touchend', unlock);
        window.addEventListener('click', unlock);
        return () => {
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('touchend', unlock);
            window.removeEventListener('click', unlock);
        };
    }, [getCtx]);

    // Web Speech path — used on the browser and as a fallback. Android WebView barely
    // supports this (that's why native TTS below exists); iOS WKWebView needs the gesture
    // unlock + resume() handled above/here.
    const speakWeb = useCallback((text: string) => {
        if (!synthRef.current) return;
        const synth = synthRef.current;

        // iOS WKWebView leaves the queue 'paused' after cancel(); without resume() nothing
        // is ever spoken.
        try { synth.resume(); } catch { /* noop */ }
        synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.1; // Slightly faster for game pacing
        utterance.pitch = 1.0;
        utterance.lang = 'ko-KR';

        let voices = synth.getVoices();
        if (voices.length === 0) voices = synth.getVoices();
        const korVoice = voices.find(v => v.lang?.includes('ko') || v.lang?.includes('KR'));
        if (korVoice) utterance.voice = korVoice;

        synth.speak(utterance);
        try { synth.resume(); } catch { /* noop */ }
    }, []);

    const speak = useCallback((text: string) => {
        if (isMuted) return;

        // Bridge to a native TTS handler if the legacy Expo/React Native shell is present.
        if (typeof window !== 'undefined' && (window as any).ReactNativeWebView) {
            (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: 'SPEAK', payload: { text } }));
            return;
        }

        // Native app (Capacitor): use the OS text-to-speech engine. Web Speech doesn't work
        // in the Android WebView, so this is the only reliable path there. If the installed
        // APK predates the plugin, the call rejects → fall back to Web Speech.
        if (Capacitor.isNativePlatform()) {
            try {
                TextToSpeech.speak({ text, lang: 'ko-KR', rate: 1.1 }).catch(() => speakWeb(text));
            } catch {
                speakWeb(text);
            }
            return;
        }

        speakWeb(text);
    }, [isMuted, speakWeb]);

    // Simple beep effect using the shared Web Audio context.
    const playEffect = useCallback((type: 'click' | 'turn' | 'win' | 'finishing') => {
        if (isMuted) return;

        try {
            const ctx = getCtx();
            if (!ctx) return;
            if (ctx.state === 'suspended') ctx.resume();

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            const now = ctx.currentTime;

            if (type === 'click') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
            } else if (type === 'turn') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.linearRampToValueAtTime(880, now + 0.1);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
            } else if (type === 'win') {
                osc.type = 'square';
                // Simple arpeggio
                osc.frequency.setValueAtTime(523.25, now); // C5
                osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
                osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
                osc.frequency.setValueAtTime(1046.50, now + 0.3); // C6
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.6);
                osc.start(now);
                osc.stop(now + 0.6);
            } else if (type === 'finishing') {
                // Warning sound
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(220, now);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
            }
        } catch (e) {
            console.error("Audio play failed", e);
        }
    }, [isMuted, getCtx]);

    return { speak, playEffect, isMuted, setIsMuted };
}
