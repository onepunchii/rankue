/**
 * 산행 전날 저녁 브리핑(2026-10-13 오너 "진행" — 산악회 × 산 제안 3번) — 내일 산악회 산행에 가는 사람에게 저녁에 한 번.
 *
 * 누구에게: 산을 고른 산악회 일정(정모)에 참가를 누른 사람(대기자는 빼낸다). 무엇을: 내일 그 산의 하늘 · 기온 · 비 올 확률과
 * 해 뜨는 시각 · 지는 시각, 그리고 챙길 것. 언제: 골프의 라운드 전날 알림과 같은 시간대(한국 19~20시대 — shared/golfRoundShare eveWindow).
 * 한 번만: 알림함의 params.reminderKey 로 본다. 보내는 일은 server/services/hikingEve.ts.
 * 재촉하지 않는다 — 빠르기 · 기록을 말하지 않고, 해 지기 전에 내려오라는 것과 챙길 것만.
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'. 순수 함수만.
 */
import { WX_LABEL, type WxDay } from "./golfWeather.js";
import { kstClock, type SunTimes } from "./hikingSun.js";
import { hikingMountainPath } from "./hikingMountains.js";

/** 같은 일정에 같은 사람에게 한 번만 — 알림함의 이 열쇠로 본다 */
export const hikingEveKey = (activityId: string) => `hiking-eve:${activityId}`;
/** 누르면 그 산의 날씨 구역으로 */
export const hikingEveUrl = (slug: string) => `${hikingMountainPath(slug)}#sec-weather`;

const WET = ["rain", "sleet", "snow", "shower"];
/** 그날 하늘의 한마디 — 오전과 오후가 같으면 한 번만 */
function skyText(day: WxDay): string {
    const words = [day.am, day.pm].filter((h): h is NonNullable<typeof h> => !!h).map((h) => WX_LABEL[h.kind]);
    return words.filter((w, i) => words.indexOf(w) === i).join(" → ");
}

/**
 * 챙길 것 — 날씨에 따라 한두 가지. 늘 물 · 간식 · 헤드랜턴(해가 일찍 지는 철이 아니어도 산에서는 기본).
 * 술 · 돈 이야기는 넣지 않는다.
 */
export function hikingEvePack(day: WxDay | null): string {
    const out = ["물", "간식", "헤드랜턴"];
    if (day) {
        const wet = [day.am, day.pm].some((h) => h && WET.includes(h.kind)) || Math.max(day.am?.pop ?? 0, day.pm?.pop ?? 0) >= 60;
        if (wet) out.push("비옷");
        if (day.tmn != null && day.tmn <= 5) out.push("보온 옷");
        if (day.wsd != null && day.wsd >= 8) out.push("바람막이");
    }
    return out.join(" · ");
}

export interface HikingEveInput {
    /** 산 이름 */
    mountain: string;
    /** 일정이 시작하는 때(ms) */
    startMs: number;
    /** 내일의 예보 — 못 읽었으면 null(준비물만 권한다) */
    day: WxDay | null;
    /** 내일의 해 — 자리를 모르면 null */
    sun: SunTimes | null;
}

/** 알림의 제목 · 본문 */
export function hikingEveNotice(o: HikingEveInput): { title: string; body: string } {
    const title = `내일 ${kstClock(o.startMs)} ${o.mountain} 산행`;
    const parts: string[] = [];
    if (o.day) {
        const sky = skyText(o.day);
        const temp = o.day.tmx != null && o.day.tmn != null ? `${Math.round(o.day.tmn)}~${Math.round(o.day.tmx)}°` : o.day.tmx != null ? `최고 ${Math.round(o.day.tmx)}°` : "";
        const pop = Math.max(o.day.am?.pop ?? 0, o.day.pm?.pop ?? 0);
        const line = [sky, temp, pop > 0 ? `비 올 확률 ${pop}%` : ""].filter(Boolean).join(" · ");
        if (line) parts.push(`산 아래 ${line}.`);
    }
    if (o.sun) parts.push(`해 뜸 ${kstClock(o.sun.rise)} · 해 짐 ${kstClock(o.sun.set)} — 해 지기 전에 내려올 시간을 남겨 두세요.`);
    parts.push(`챙길 것: ${hikingEvePack(o.day)}.`);
    return { title, body: parts.join(" ") };
}
