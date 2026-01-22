import { useCallback, useState, useEffect, useRef } from 'react';

export function useGameAudio() {
    const [isMuted, setIsMuted] = useState(false);
    const synthRef = useRef<SpeechSynthesis | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            synthRef.current = window.speechSynthesis;
            // Clear any stuck state on mount
            window.speechSynthesis.cancel();
        }
    }, []);

    // Ensure voices are loaded (especially for mobile/Chrome)
    useEffect(() => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            const loadVoices = () => {
                // Just calling this populates the list in some browsers
                window.speechSynthesis.getVoices();
            };
            loadVoices();
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
    }, []);

    const speak = useCallback((text: string) => {
        if (isMuted || !synthRef.current) return;

        // Cancel previous utterance for snappiness
        synthRef.current.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.1; // Slightly faster for game pacing
        utterance.pitch = 1.0;

        // 1. Get voices
        let voices = synthRef.current.getVoices();

        // 2. Retry loading voices if empty (common issue)
        if (voices.length === 0) {
            window.speechSynthesis.getVoices();
            voices = synthRef.current.getVoices();
        }

        // 3. Try to find Korean voice, but DON'T fail if missing
        const korVoice = voices.find(v => v.lang.includes('ko') || v.lang.includes('KR'));

        if (korVoice) {
            utterance.voice = korVoice;
            utterance.lang = 'ko-KR';
        } else {
            // Fallback: Use default voice (better English/strange accent than silence)
            // Ideally we hint 'ko-KR', but if the browser strictly checks lang vs voice supported langs, 
            // it might silence it. Let's try to set lang, but if it fails, the default voice usually works.
            utterance.lang = 'ko-KR';
            console.warn("Korean voice not found, using system default.");
        }

        // 4. Speak
        synthRef.current.speak(utterance);
    }, [isMuted]);

    // Simple beep effect using Web Audio API
    const playEffect = useCallback((type: 'click' | 'turn' | 'win' | 'finishing') => {
        if (isMuted || typeof window === 'undefined') return;

        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContext) return;

            const ctx = new AudioContext();
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
    }, [isMuted]);

    return { speak, playEffect, isMuted, setIsMuted };
}
