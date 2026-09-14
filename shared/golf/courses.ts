/**
 * 기본 코스 "랭큐 파크" 9홀(2026-09-14). 좌표는 W36×H60. 티는 아래, 컵은 위쪽이 기본.
 * 홀마다 한 가지 재미(직선 → 꺾임 → 범퍼 → 지그재그 → 좁은 문 → 뱅크 → 섬 → 광장 → 종합)를 준다.
 */
import { COURSE_H, COURSE_W, v, type Course, type Hole } from "./course";

const cx = COURSE_W / 2;

const HOLES: Hole[] = [
    {
        id: "h1", name: "첫 티샷", par: 2, hint: "곧게 밀어 넣으세요",
        tee: v(cx, 50), cup: v(cx, 12),
        fairway: [v(12, 6), v(24, 6), v(24, 56), v(12, 56)],
    },
    {
        id: "h2", name: "꺾인 길", par: 3, hint: "벽에 한 번 튕겨 보세요",
        tee: v(8, 52), cup: v(29, 11),
        fairway: [v(3, 6), v(33, 6), v(33, 17), v(14, 17), v(14, 57), v(3, 57)],
    },
    {
        id: "h3", name: "범퍼", par: 3, hint: "범퍼 사이로",
        tee: v(cx, 52), cup: v(cx, 10),
        fairway: [v(6, 4), v(30, 4), v(30, 57), v(6, 57)],
        bumpers: [{ c: v(12, 30), r: 2.2 }, { c: v(24, 30), r: 2.2 }, { c: v(18, 20), r: 1.8 }],
    },
    {
        id: "h4", name: "지그재그", par: 4, hint: "세 번 꺾입니다",
        tee: v(7, 54), cup: v(29, 8),
        fairway: [v(3, 3), v(33, 3), v(33, 20), v(12, 20), v(12, 26), v(33, 26), v(33, 44), v(12, 44), v(12, 50), v(33, 50), v(33, 58), v(3, 58), v(3, 41), v(24, 41), v(24, 29), v(3, 29), v(3, 17), v(24, 17), v(24, 9), v(3, 9)],
    },
    {
        id: "h5", name: "좁은 문", par: 3, hint: "문을 통과해야 합니다",
        tee: v(cx, 53), cup: v(cx, 9),
        fairway: [v(4, 3), v(32, 3), v(32, 58), v(4, 58)],
        blocks: [[v(4, 29), v(15, 29), v(15, 32), v(4, 32)], [v(21, 29), v(32, 29), v(32, 32), v(21, 32)]],
    },
    {
        id: "h6", name: "뱅크샷", par: 3, hint: "대각선 벽을 이용하세요",
        tee: v(7, 53), cup: v(29, 9),
        fairway: [v(3, 3), v(33, 3), v(33, 58), v(3, 58)],
        blocks: [[v(3, 20), v(20, 20), v(20, 23), v(3, 23)], [v(16, 36), v(33, 36), v(33, 39), v(16, 39)]],
    },
    {
        id: "h7", name: "섬", par: 3, hint: "가운데 섬을 돌아서",
        tee: v(cx, 54), cup: v(cx, 8),
        fairway: [v(4, 3), v(32, 3), v(32, 58), v(4, 58)],
        blocks: [[v(12, 22), v(24, 22), v(24, 38), v(12, 38)]],
    },
    {
        id: "h8", name: "광장", par: 2, hint: "넓지만 컵은 작습니다",
        tee: v(cx, 52), cup: v(cx, 14),
        fairway: [v(10, 3), v(26, 3), v(34, 11), v(34, 49), v(26, 57), v(10, 57), v(2, 49), v(2, 11)],
        bumpers: [{ c: v(9, 30), r: 1.6 }, { c: v(27, 30), r: 1.6 }],
    },
    {
        id: "h9", name: "마지막 홀", par: 4, hint: "범퍼를 피해 두 번 꺾어 올라가세요",
        tee: v(7, 55), cup: v(30, 7),
        fairway: [v(3, 3), v(33, 3), v(33, 24), v(14, 24), v(14, 34), v(33, 34), v(33, 59), v(3, 59), v(3, 44), v(23, 44), v(23, 14), v(3, 14)],
        bumpers: [{ c: v(18, 8), r: 1.6 }, { c: v(9, 52), r: 1.5 }],
    },
];

export const RANKUE_PARK: Course = { id: "rankue-park", name: "랭큐 파크", holes: HOLES };
export const COURSES: readonly Course[] = [RANKUE_PARK];
export function courseById(id: string): Course | null { return COURSES.find((c) => c.id === id) ?? null; }
export function coursePar(c: Course): number { return c.holes.reduce((s, h) => s + h.par, 0); }
