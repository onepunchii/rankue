// 크루 투표·대회의 시각 계산 — 서버와 화면이 같은 규칙을 쓰도록 여기 둔다(2026-09-26 크루 정비).
//
// 왜 한국 시각(KST)으로 못박는가: 크루는 한국 매장 기준으로 모이고, 서버(Vercel)는 UTC 로 돈다.
// 예전 투표 마감은 addDays(now, n) 이라 "3일 뒤 지금 이 분"이 됐고(밤 11시 7분 같은 어정쩡한 마감),
// 화면은 기기 시간대로, 푸시는 서버 UTC 로 찍어서 같은 마감이 9시간씩 다르게 보였다.
// 저장은 그대로 UTC 절대 시각이고, "몇 월 며칠 몇 시"로 바꾸는 순간에만 KST 를 쓴다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000; // 한국은 서머타임이 없어 고정 +9 로 충분하다.
const DAY_MS = 24 * 60 * 60 * 1000;

/** 그 순간의 KST 달력 날짜(연·월(1-12)·일). */
export function kstParts(at: Date | number): { y: number; m: number; d: number; hh: number; mm: number } {
    const k = new Date((typeof at === "number" ? at : at.getTime()) + KST_OFFSET_MS);
    return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(), hh: k.getUTCHours(), mm: k.getUTCMinutes() };
}

/**
 * KST 로 읽은 날짜·시각 → UTC 절대 시각. 입력칸(<input type=date/time>)의 값을 그대로 받는다.
 * 형식이 틀리면 null — 호출부가 "마감 시간을 확인해 주세요"를 띄운다.
 */
export function kstInputToDate(date: string, time: string): Date | null {
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
    const tm = /^(\d{2}):(\d{2})$/.exec(time ?? "");
    if (!dm || !tm) return null;
    const [y, mo, d, hh, mi] = [+dm[1], +dm[2], +dm[3], +tm[1], +tm[2]];
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mi > 59) return null;
    const utc = Date.UTC(y, mo - 1, d, hh, mi) - KST_OFFSET_MS;
    // 2월 31일처럼 넘친 날짜는 Date.UTC 가 다음 달로 굴린다 — 되읽어 다르면 틀린 입력이다.
    const back = kstParts(utc);
    if (back.y !== y || back.m !== mo || back.d !== d) return null;
    return new Date(utc);
}

/** UTC 절대 시각 → 입력칸에 넣을 KST 'YYYY-MM-DD' / 'HH:mm'. */
export function dateToKstInput(at: Date | string | number): { date: string; time: string } {
    const p = kstParts(new Date(at));
    const two = (n: number) => String(n).padStart(2, "0");
    return { date: `${p.y}-${two(p.m)}-${two(p.d)}`, time: `${two(p.hh)}:${two(p.mm)}` };
}

/**
 * 오늘(KST)부터 n 일 뒤의 23:59(KST). 투표 마감 기본값이다 —
 * "3일 뒤"를 고르면 사흘 뒤 밤 11시 59분에 닫혀야 사람들이 기억하기 쉽다.
 */
export function kstEndOfDay(now: Date | number, addDays: number): Date {
    const p = kstParts(now);
    return new Date(Date.UTC(p.y, p.m - 1, p.d + addDays, 23, 59) - KST_OFFSET_MS);
}

export interface Countdown {
    closed: boolean;
    days: number;
    hours: number;
    minutes: number;
}

/**
 * 마감까지 남은 시간. 분은 올림한다 — 30초 남았을 때 "0분 남음"이 뜨면 이미 닫힌 것처럼 읽힌다.
 * 화면이 30초마다 다시 부르므로 마감 순간에 closed 로 바뀌고 투표 버튼이 잠긴다.
 */
export function countdown(endTime: Date | string | number | null | undefined, now: Date | number = Date.now()): Countdown | null {
    if (endTime == null) return null;
    const end = new Date(endTime).getTime();
    if (Number.isNaN(end)) return null;
    const left = end - (typeof now === "number" ? now : now.getTime());
    if (left <= 0) return { closed: true, days: 0, hours: 0, minutes: 0 };
    const totalMin = Math.ceil(left / 60000);
    return {
        closed: false,
        days: Math.floor(totalMin / (24 * 60)),
        hours: Math.floor((totalMin % (24 * 60)) / 60),
        minutes: totalMin % 60,
    };
}

export { DAY_MS };
