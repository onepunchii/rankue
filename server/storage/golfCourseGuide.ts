/**
 * 골프장 코스 가이드 읽기(2026-10-12) — golf_course_pages.guide. 모양과 거르는 규칙은 shared/golfCourseGuide.
 *
 * 골프장 요약(loadGolfCourseSummary — 목록 · 허브가 다 같이 쓰는 묶음)에는 싣지 않는다: 490곳의 가이드를 합치면 800KB 라
 * 목록을 여는 모든 요청이 그 무게를 지게 된다. 상세 화면과 그 검색용 화면이 한 곳씩 따로 읽는다.
 * 칸이 아직 없으면(42703) · 값이 비었거나 모양이 다르면 null — 화면은 가이드 구역을 그리지 않는다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { hasGuide, scrubGuide, type CourseGuide } from "../../shared/golfCourseGuide.js";

const missingColumn = (e: any) => (e?.code ?? e?.cause?.code) === "42703" || /column "?guide"? does not exist/.test(String(e?.message ?? ""));

export async function getCourseGuide(slug: string): Promise<CourseGuide | null> {
    try {
        const r: any = await db.execute(sql`select guide from golf_course_pages where slug = ${slug}`);
        const g = ((r.rows ?? r) as any[])[0]?.guide;
        // 읽을 때 꼬리표(<cite …>)를 한 번 더 뗀다 — 넣을 때 놓친 글이 화면 · 검색용 화면에 나가지 않게
        return hasGuide(g) ? scrubGuide(g) : null;
    } catch (e) {
        if (missingColumn(e)) return null;
        throw e;
    }
}
