/**
 * 골프장 코스 가이드 적재(2026-10-12) — 받은 가이드 JSON 을 규칙(shared/golfCourseGuide)으로 걸러 golf_course_pages.guide 에 담는다.
 *
 *   npx tsx --env-file=.env server/scripts/golf-course-guides.ts <golf_course_guides.json> [--apply] [--held <보류 목록을 쓸 파일>]
 *
 * --apply 가 없으면 세기만 한다(아무것도 쓰지 않는다).
 * 받은 파일의 모양: { "<슬러그>": { confidence, overview, courses[{name,holes,description}], layoutNotes, signatureHoles[{hole,description}],
 *                                   facilities, access, tips[], faq[{q,a}], notes, sources[{url,title}] } }
 *
 * 싣는 것 · 빼는 것은 전부 shared/golfCourseGuide 가 정한다 — 확신이 낮은 곳 · 우리 홀 수와 다른 곳은 싣지 않고, 문장마다 다시 거른다.
 * 이 스크립트는 guide 칸만 쓴다(다른 칸은 건드리지 않는다). 값이 달라질 때만 쓰고, 이번에 보류로 바뀐 곳의 옛 가이드는 그대로 둔다
 * (지우려면 어드민이 아니라 사람이 정할 일이다 — 보류 목록을 보고).
 * ⚠️ 칸이 먼저 있어야 한다: migrations/golf_course_guide.sql (더하기만).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pool } from "../db";
import { cleanGuide, guideHoldReason, hasGuide } from "../../shared/golfCourseGuide";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--held");
const apply = args.includes("--apply");
const heldOut = args.includes("--held") ? args[args.indexOf("--held") + 1] : null;
/** 정리한 날 — 한국 날짜(YYYY-MM-DD) */
const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

async function main() {
    if (!file) { console.error("받은 가이드 JSON 의 경로를 적어 주세요."); process.exitCode = 1; return; }
    const raw: Record<string, unknown> = JSON.parse(readFileSync(file, "utf8"));
    const col = (await pool.query(`select 1 from information_schema.columns where table_name = 'golf_course_pages' and column_name = 'guide'`)).rowCount;
    if (!col) { console.error("guide 칸이 없습니다 — migrations/golf_course_guide.sql 을 먼저 적용해 주세요."); process.exitCode = 1; return; }
    const pages = new Map<string, { name: string; holes: number | null; has: boolean }>(
        (await pool.query(`select slug, name, holes, guide is not null as has from golf_course_pages`)).rows.map((r: any) => [r.slug, { name: r.name, holes: r.holes, has: r.has }]),
    );

    const held: { slug: string; name: string; why: string }[] = [];
    let wrote = 0, same = 0;
    for (const [slug, v] of Object.entries(raw)) {
        const p = pages.get(slug);
        const why = !p ? "우리 페이지에 없음" : guideHoldReason(v, p.holes);
        const g = why ? null : cleanGuide(v, today);
        if (!g || !hasGuide(g)) { held.push({ slug, name: p?.name ?? "", why: why ?? "거르고 나니 개요가 남지 않음" }); continue; }
        if (!apply) { wrote++; continue; }
        // 정리한 날(at)만 다른 값은 같은 값이다 — 날짜 때문에 490줄을 다시 쓰지 않는다
        const r = await pool.query(
            `update golf_course_pages set guide = $2::jsonb, updated_at = now()
              where slug = $1 and (guide is null or (guide - 'at') is distinct from ($2::jsonb - 'at'))`,
            [slug, JSON.stringify(g)],
        );
        if (r.rowCount) wrote++; else same++;
    }

    const by: Record<string, number> = {};
    for (const h of held) { const k = h.why.split("(")[0]; by[k] = (by[k] ?? 0) + 1; }
    console.log(apply ? "담은 곳" : "미리 보기 — 담을 곳", wrote, apply ? `· 그대로인 곳 ${same}` : "", "· 보류", held.length, by);
    const stale = held.filter((h) => pages.get(h.slug)?.has);
    if (stale.length) console.log("보류인데 옛 가이드가 실려 있는 곳(그대로 둠):", stale.map((h) => `${h.name}(${h.why})`).join(", "));
    if (heldOut) { writeFileSync(heldOut, JSON.stringify(held, null, 1)); console.log("보류 목록 →", heldOut); }
    if (apply) console.log("가이드가 있는 페이지", (await pool.query(`select count(*)::int as n from golf_course_pages where guide is not null`)).rows[0].n);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
