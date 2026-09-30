/**
 * Elite 60 정복 판정 — Elite 60 화면(useEliteCourses)과 여권 배너(Passport)가 **같은 함수**를 쓴다(2026-09-30).
 *
 * 도장은 여권 통계의 인증 도장(서버 golfStamps.collectStamps — 현장 인증 + 이 규칙 전 옛 기록)만 받는다.
 * 예전엔 Elite 60 화면이 기록(/history)을 따로 묶어서 현장 인증 없는 라운드(기록 도장)까지 정복으로 셌고,
 * 여권 배너는 이름이 글자 그대로 같을 때만 세서 두 숫자가 달랐다.
 * 이름은 정적 목록(golfCourses.ts)과 원장 이름이 조금씩 달라 공백·'CC·GC·컨트리클럽·골프클럽'을 떼고 포함 관계까지 본다(옛 규칙 그대로).
 */
export interface EliteStampLike { name: string }

export const cleanCourseName = (name: string) => name.replace(/\s/g, "").replace(/CC|컨트리클럽|골프클럽|GC/g, "");

/** 이 골프장(정적 목록 이름)에 맞는 도장 — 없으면 undefined */
export function findEliteStamp<S extends EliteStampLike>(courseName: string, stamps: readonly S[]): S | undefined {
    const target = cleanCourseName(courseName);
    if (!target) return undefined;
    return stamps.find((s) => {
        const c = cleanCourseName(s.name);
        return !!c && (c === target || target.includes(c) || c.includes(target));
    });
}

/** Elite 60 목록 중 정복한 곳 수 */
export function countEliteConquered(courses: readonly { name: string; isRankue60?: boolean }[], stamps: readonly EliteStampLike[]): number {
    return courses.filter((c) => c.isRankue60 && !!findEliteStamp(c.name, stamps)).length;
}
