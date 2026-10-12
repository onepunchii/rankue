/**
 * 라운드가 끝난 화면에서 — 이 라운드의 골프장이 도장첩의 어느 칸이고, 그 권이 지금 어디까지 찼는가(2026-10-12).
 *
 * 칸은 **내 도장**에서 찾는다(라운드의 골프장 번호로 바로 찾지 않는다): 도장이 있어야 '찍혔다'고 말할 수 있고,
 * 서버가 기록의 번호 · 이름을 원장 골프장으로 이어 놓은 것이 도장이라 옛 번호로 적힌 라운드도 같은 길을 탄다.
 *   - 도장의 원장 번호가 라운드의 골프장 번호와 같거나
 *   - 도장의 이름이 라운드의 골프장 이름과 글자가 같으면(공백 · 대소문자 무시) 그 도장이다.
 * 도장이 없으면(엘리트 명단 밖 · 미인증 · 아직 통계에 안 들어옴) null — 화면은 아무것도 그리지 않는다.
 */
import type { BookState, SlotState, StampLike } from "@shared/golfStampBooks";

export interface StampMoment<S> {
    state: BookState<S>;
    mine: SlotState<S> & { stamp: S };
    /** 그 권에 남은 칸 */
    left: number;
}

const squash = (v: string) => v.replace(/\s+/g, "").toLowerCase();

export function stampMoment<S extends StampLike>(
    states: readonly BookState<S>[], round: { courseId?: string | null; courseName?: string | null },
): StampMoment<S> | null {
    const id = round.courseId || null;
    const name = round.courseName ? squash(round.courseName) : "";
    if (!id && !name) return null;
    for (const state of states) {
        for (const slot of state.slots) {
            const s = slot.stamp;
            if (!s) continue;
            if ((id && s.clubId === id) || (name && squash(s.name) === name)) return { state, mine: { ...slot, stamp: s }, left: state.total - state.got };
        }
    }
    return null;
}
