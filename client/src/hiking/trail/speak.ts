/**
 * 산행 중 음성 안내 — 한 줄을 소리 내어 읽는다(2026-10-13). 무엇을 언제 말할지는 shared/hikingTrail.trailSpeech 가 정한다.
 *
 * 앱(Capacitor)에서는 기기의 음성 엔진을 쓴다 — 안드로이드 웹뷰는 브라우저 음성이 나오지 않는다(점수판의 useGameAudio 와 같은 까닭).
 * 그 밖(웹 · 옛 앱)은 브라우저 음성. 어느 쪽도 안 되면 조용히 넘어간다 — 화면에는 같은 내용이 글로 있다.
 */
import { Capacitor } from "@capacitor/core";

const KEY = "rankue_hk_trail_voice";
/** 음성 안내를 켜 두었는가 — 기기에 기억한다(기본은 끔: 산에서 갑자기 소리가 나지 않게) */
export const voiceOn = (): boolean => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export const setVoiceOn = (on: boolean): void => { try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* 저장소를 못 쓰는 환경 — 이번 화면에서만 */ } };

function speakWeb(text: string): void {
    try {
        const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
        if (!synth) return;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "ko-KR";
        u.rate = 1;
        synth.speak(u);
        // iOS 웹뷰는 멈춘 채로 남는 일이 있다
        try { synth.resume(); } catch { /* noop */ }
    } catch { /* 음성을 못 쓰는 환경 */ }
}

/** 한 줄 읽기 — 여러 줄을 잇달아 부르면 차례로 읽는다 */
export function speakLine(text: string): void {
    if (!text) return;
    if (Capacitor.isNativePlatform()) {
        import("@capacitor-community/text-to-speech")
            .then(({ TextToSpeech }) => TextToSpeech.speak({ text, lang: "ko-KR", rate: 1.0 }))
            .catch(() => speakWeb(text));
        return;
    }
    speakWeb(text);
}
