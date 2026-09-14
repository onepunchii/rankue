/**
 * UMB 대회 라벨 분해 — 화면이 "UMB / CEB World Cup - ANTWERP (BE) 2025-10-12" 를 그대로 찍으면
 * 좁은 폰에서 도시도 날짜도 잘려 "UMB / CEB World Cup - ANTW…" 만 남는다(2026-09-13 오너: 글자가 많아 답답하다).
 * 종류·주최·도시·국가·날짜로 쪼개 두면 화면이 "월드컵 · Antwerp / CEB · 2025.10.12" 처럼 층을 나눠 보여 줄 수 있다.
 *
 * 실측한 라벨 형식(2026-09, 세 부문):
 *  - "UMB / CEB World Cup - ANTWERP (BE) 2025-10-12"
 *  - "UMB / ACBC World Cup - HO CHI MINH CITY (VN) 2026-05-24"
 *  - "UMB World Championship - 14/18 Oct. 2025 - ANTWERP (BE)"
 *  - "UMB World Championships 2025 - 26/28 Sep.2025 - MURCIA (ES)"   (주니어 — 's', 'Sep.2025' 붙어 씀)
 *  - "Confederal Championships" / "Confederal Championships 2024 / 2025 / 2026"
 *  - "National Championships 2025 / 2026"
 * 모르는 형식은 kind 'other' 로 원문을 그대로 돌려준다 — 못 알아본다고 정보를 잃지는 않는다.
 */
import { eventDateOf } from "./umbExpiry.js";

export type EventKind = "worldcup" | "worldchamp" | "confederal" | "national" | "other";

export interface EventLabelParts {
    readonly kind: EventKind;
    /** 주최 연맹 약자(CEB·ACBC·AMECC·CPB). 세계선수권은 'UMB'. */
    readonly org: string | null;
    /** 도시 — 첫 글자만 대문자로("Ho Chi Minh City"). */
    readonly city: string | null;
    /** ISO 3166 두 글자 국가 코드 */
    readonly country: string | null;
    /** 대회일 "2025-10-12"(세계선수권은 마지막 날). 모르면 null */
    readonly date: string | null;
    /** 대륙·국가선수권의 시즌 "2025/26" (라벨에 연도가 두 개 이상일 때) */
    readonly season: string | null;
}

/** "HO CHI MINH CITY" → "Ho Chi Minh City". 이미 섞여 쓴 건 건드리지 않는다. */
export function titleCase(s: string): string {
    return s.trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function isoDate(d: Date | null): string | null {
    return d ? d.toISOString().slice(0, 10) : null;
}

/** "2024 / 2025 / 2026" → "2024/26", "2025 / 2026" → "2025/26". 연도가 하나면 그대로, 없으면 null */
function seasonOf(s: string): string | null {
    const years = s.match(/\d{4}/g);
    if (!years || years.length === 0) return null;
    if (years.length === 1) return years[0];
    return `${years[0]}/${years[years.length - 1].slice(2)}`;
}

export function parseEventLabel(label: string): EventLabelParts {
    const raw = (label ?? "").trim();
    const none: EventLabelParts = { kind: "other", org: null, city: null, country: null, date: null, season: null };
    if (!raw) return none;

    const wc = raw.match(/^UMB\s*\/\s*([A-Z]+)\s+World\s+Cup\s*-\s*(.+?)\s*\(([A-Z]{2})\)\s*(\d{4}-\d{2}-\d{2})?\s*$/i);
    if (wc) {
        return { kind: "worldcup", org: wc[1].toUpperCase(), city: titleCase(wc[2]), country: wc[3].toUpperCase(), date: wc[4] ?? isoDate(eventDateOf(raw)), season: null };
    }

    if (/^UMB\s+World\s+Championships?\b/i.test(raw)) {
        // 도시는 맨 뒤 " - MURCIA (ES)" 조각. 날짜는 공용 파서(마지막 날 기준)
        const place = raw.match(/-\s*([^-()]+?)\s*\(([A-Z]{2})\)\s*$/i);
        return {
            kind: "worldchamp", org: "UMB",
            city: place ? titleCase(place[1]) : null,
            country: place ? place[2].toUpperCase() : null,
            date: isoDate(eventDateOf(raw)), season: null,
        };
    }

    if (/^Confederal\s+Championships?/i.test(raw)) {
        return { kind: "confederal", org: null, city: null, country: null, date: null, season: seasonOf(raw) };
    }
    if (/^National\s+Championships?/i.test(raw)) {
        return { kind: "national", org: null, city: null, country: null, date: null, season: seasonOf(raw) };
    }
    return none;
}
