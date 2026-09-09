/**
 * 한국 시각으로 고정해 읽는다.
 *
 * 왜 필요했나: 티타임은 골프장이 있는 한국 시각이다. 그런데 화면 곳곳이 그냥
 * `new Date(item.datetime).toLocaleTimeString('ko-KR', …)` 였다. 이건 **보는 사람 기기의 시간대**로
 * 바꿔 찍는다. 기기 시계가 한국이 아니면 07:00 티타임이 06:00·22:00 로 보였다(2026-09-09 검토).
 * 해외에서 접속하는 회원이 이미 있는 서비스라 실제로 틀리게 보이는 사람이 있었다.
 *
 * 날짜 열쇠(kstDateKey)도 같은 문제였다. `toISOString().split('T')[0]` 은 UTC 날짜라
 * 오전 9시 이전 티타임이 하루 앞으로 밀렸다.
 */

const KST = "Asia/Seoul";

function toDate(v: Date | string | number): Date {
    return v instanceof Date ? v : new Date(v);
}

const KEY_PARTS = new Intl.DateTimeFormat("en-US", {
    timeZone: KST, year: "numeric", month: "2-digit", day: "2-digit",
});

/**
 * 'YYYY-MM-DD' (한국 날짜). 목록의 날짜 칩·묶음 열쇠가 이걸 쓴다.
 * 로케일이 찍어 주는 **모양**에 기대지 않고 조각을 직접 뽑아 붙인다 — 'en-CA' 가 'YYYY-MM-DD' 로
 * 나온다는 건 관례일 뿐이고, ICU 가 빈약한 환경에서 다른 모양이 나오면 전부 조용히 어긋난다.
 */
export function kstDateKey(v: Date | string | number): string {
    const d = toDate(v);
    if (Number.isNaN(d.getTime())) return "";
    const p: Record<string, string> = {};
    for (const part of KEY_PARTS.formatToParts(d)) p[part.type] = part.value;
    return p.year && p.month && p.day ? `${p.year}-${p.month}-${p.day}` : "";
}

const TIME_PARTS = new Intl.DateTimeFormat("en-US", {
    timeZone: KST, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/**
 * '07:30' (한국 시각, 24시간).
 * hourCycle:'h23' 를 못박는다 — hour12:false 만 주면 ICU 판에 따라 자정이 '24:00' 으로 나온다.
 */
export function kstTime(v: Date | string | number): string {
    const d = toDate(v);
    if (Number.isNaN(d.getTime())) return "";
    const p: Record<string, string> = {};
    for (const part of TIME_PARTS.formatToParts(d)) p[part.type] = part.value;
    return p.hour && p.minute ? `${p.hour}:${p.minute}` : "";
}

/** 시(hour)만. 카드 왼쪽의 큰 숫자에 쓴다. */
export function kstHour(v: Date | string | number): string {
    return kstTime(v).split(":")[0] ?? "";
}

/** 분(minute)만. */
export function kstMinute(v: Date | string | number): string {
    return kstTime(v).split(":")[1] ?? "";
}

/** '9월 12일' 같은 한국 날짜 표기. */
export function kstDateLabel(v: Date | string | number, opts?: Intl.DateTimeFormatOptions): string {
    const d = toDate(v);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", timeZone: KST, ...opts });
}
