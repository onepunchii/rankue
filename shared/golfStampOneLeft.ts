/**
 * 도장첩 '한 곳 남음'(2026-10-12) — 기획서 9장의 둘째 장치: "강원 도장첩 1곳 남았어요 → 그 골프장의 조인 · 날씨로".
 *
 * 무엇: '누구나' 도장첩(권역 일곱 권)에서 **빈 칸이 딱 하나** 남은 권과 그 마지막 골프장.
 *   · 초대장(회원제) 권은 넣지 않는다 — 회원과 함께 가야 하는 곳이라 재촉하지 않는다(도장첩의 규칙).
 *   · 다 채운 권 · 두 칸 넘게 남은 권도 아니다.
 * 언제 알리나: 그 상태가 **방금** 됐을 때만(그 권의 가장 늦은 도장이 24시간 안). 한참 전에 한 칸 남은 권을
 *   다른 골프장의 라운드를 끝낼 때마다 다시 알리지 않는다. 같은 권은 알림함의 열쇠(reminderKey)로 한 번만.
 * 어디로: 그 도장첩(/golf/stamps/<권>) — 맨 위에 마지막 골프장으로 가는 줄이 있다(조인 · 날씨 · 관심 알림은 그 골프장 화면에).
 *
 * 화면(도장첩 한 권의 '한 곳 남았어요' 줄)과 서버(알림)가 같은 셈을 쓴다.
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'(없으면 Vercel /api 전체 500).
 */
import { bookStates, type BookState, type SlotState, type StampLike } from "./golfStampBooks.js";
import type { DatedStamp } from "./golfStampAwards.js";

/** 알림의 type — 알림함에서는 '소식' 묶음(모르는 type 의 기본값), 설정에서는 골프 소식 칸을 탄다 */
export const ONE_LEFT_TYPE = "GOLF_STAMP";
/** 이 시간 안에 얻은 도장으로 한 칸 남은 것만 알린다 */
export const ONE_LEFT_FRESH_MS = 24 * 3600_000;
/** 같은 권을 두 번 알리지 않게 알림함에 남기는 열쇠 */
export const oneLeftKey = (bookId: string) => `stamp-one-left:${bookId}`;
/** 알림을 누르면 가는 곳 */
export const oneLeftUrl = (bookId: string) => `/golf/stamps/${bookId}`;

/** 한 권의 상태에서 — 빈 칸이 딱 하나면 그 칸. '누구나' 권만 */
export function lastEmptySlot<S extends StampLike>(state: BookState<S>): SlotState<S> | null {
    if (state.book.kind !== "open" || state.total - state.got !== 1) return null;
    return state.slots.find((s) => !s.stamp) ?? null;
}

export interface StampOneLeft {
    bookId: string;
    bookName: string;
    /** 마지막으로 남은 칸 */
    slotKey: string;
    slotName: string;
    /** 그 골프장의 공개 페이지(/golf/course/<번호>) */
    courseId: number;
    got: number;
    total: number;
    /** 그 권에서 가장 늦게 얻은 도장의 때(ms) — 이 도장으로 한 칸 남게 됐다 */
    lastAt: number;
}

const ms = (v: Date | string | number): number => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime());

/** 인증 도장 → 한 칸 남은 '누구나' 권들(도장첩 순서) */
export function stampOneLeft(stamps: readonly DatedStamp[]): StampOneLeft[] {
    const out: StampOneLeft[] = [];
    for (const st of bookStates(stamps.filter((s) => Number.isFinite(ms(s.firstDate))))) {
        const last = lastEmptySlot(st);
        if (!last) continue;
        out.push({
            bookId: st.book.id, bookName: st.book.name,
            slotKey: last.slot.key, slotName: last.slot.name, courseId: last.slot.courseId,
            got: st.got, total: st.total,
            lastAt: Math.max(...st.slots.filter((s) => s.stamp).map((s) => ms(s.stamp!.firstDate))),
        });
    }
    return out;
}

/** 방금 한 칸 남은 것만 — 앞날의 날짜(시계가 어긋난 기록)는 넣지 않는다 */
export function oneLeftFresh(list: readonly StampOneLeft[], nowMs: number): StampOneLeft[] {
    return list.filter((o) => nowMs - o.lastAt >= 0 && nowMs - o.lastAt <= ONE_LEFT_FRESH_MS);
}

/** 알림의 글 — 골프는 한국어 화면이라 문장을 그대로 쓴다(라운드 전날 알림과 같다) */
export function oneLeftNotice(o: Pick<StampOneLeft, "bookId" | "bookName" | "slotName">): { title: string; body: string; url: string } {
    return {
        title: `${o.bookName} 도장첩, 한 곳 남았어요`,
        body: `${o.slotName}만 찍으면 ${o.bookName} 볼마커를 받아요.`,
        url: oneLeftUrl(o.bookId),
    };
}
