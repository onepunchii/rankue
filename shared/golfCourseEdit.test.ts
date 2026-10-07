import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ADMIN_KEEP_KEYS, COURSE_NAME_MAX, cleanCourseName } from "./golfParEdit";

/**
 * 골프장 이름 고치기 · 원장 좌표를 고치면 골프장 페이지 좌표도 같이 · 어드민이 고친 칸은 다시 적재해도 남는다
 * (2026-10-07 오너: "이거 잘못된 정보라 수정가능하게 — 1.원장좌표 수정시 골프장 좌표가 자동 반영되게 2.골프장 명 수정 가능하게").
 * 규칙과, 그 규칙이 화면·서버·적재 스크립트에 이어져 있는지를 본다.
 * 저장(무엇을 확인하고 무엇을 쓰는가)은 server/storage/adminGolfCourses.edit.test.ts, 라우트는 server/routes/modules/adminGolf/coursesEdit.test.ts.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*|--)/.test(l)).join("\n");

describe("골프장 이름 규칙", () => {
    it("앞뒤 공백을 떼고 겹친 공백은 한 칸으로 — 2~40자", () => {
        expect(cleanCourseName("  고성노벨   컨트리클럽 ")).toEqual({ ok: true, name: "고성노벨 컨트리클럽" });
        expect(cleanCourseName("88CC")).toEqual({ ok: true, name: "88CC" });
        expect(cleanCourseName("가".repeat(COURSE_NAME_MAX))).toMatchObject({ ok: true });
        expect(COURSE_NAME_MAX).toBe(40);
    });

    it("빈 값 · 한 글자 · 너무 긴 값 · 꺾쇠·제어 글자 · 글자가 아닌 값은 받지 않는다", () => {
        for (const v of ["", "   ", "가", "가".repeat(COURSE_NAME_MAX + 1), "<script>", "골프장>", "골프\u0000장", "골프\n장\u007f", null, undefined, 12, {}]) {
            expect(cleanCourseName(v).ok, JSON.stringify(v)).toBe(false);
        }
        // 줄바꿈·탭은 공백으로 접힌다
        expect(cleanCourseName("골프\t장\n클럽")).toEqual({ ok: true, name: "골프 장 클럽" });
    });

    it("'고친 칸'의 이름은 넷 — 이름 · 좌표 · 홈페이지 · 전화", () => {
        expect([...ADMIN_KEEP_KEYS]).toEqual(["name", "coords", "website", "phone"]);
    });
});

describe("다시 적재해도 남는가(소스)", () => {
    const load = root("server/scripts/golf-course-pages.ts");

    it("적재 스크립트: 어드민이 고친 이름·좌표·홈페이지·전화는 원본 자료로 덮지 않는다", () => {
        for (const line of [
            "name = case when 'name' = any(golf_course_pages.admin_keep) then golf_course_pages.name else excluded.name end,",
            "lat = case when 'coords' = any(golf_course_pages.admin_keep) then golf_course_pages.lat else excluded.lat end,",
            "lng = case when 'coords' = any(golf_course_pages.admin_keep) then golf_course_pages.lng else excluded.lng end,",
            "phone = case when 'phone' = any(golf_course_pages.admin_keep) then golf_course_pages.phone else excluded.phone end,",
            "website = case when 'website' = any(golf_course_pages.admin_keep) then golf_course_pages.website else excluded.website end,",
        ]) expect(load, line.slice(0, 40)).toContain(line);
        const sqlOnly = code(load);
        for (const old of ["name = excluded.name", "lat = excluded.lat", "lng = excluded.lng", "phone = excluded.phone", "website = excluded.website"]) {
            expect(sqlOnly.split(old).length - 1, old).toBe(0);
        }
        // 적는 이름과 읽는 이름이 같아야 한다
        for (const k of ADMIN_KEEP_KEYS) expect(load, k).toContain(`'${k}' = any(golf_course_pages.admin_keep)`);
    });

    it("적재 스크립트: 이름을 고친 페이지의 별칭(옛 이름)을 버리지 않고, 원장 짝을 못 찾았다고 있던 짝을 끊지 않는다", () => {
        expect(load).toContain("then array(select distinct unnest(golf_course_pages.aliases || excluded.aliases))");
        expect(load).toContain("club_id = coalesce(excluded.club_id, golf_course_pages.club_id),");
        expect(code(load)).not.toContain("club_id = excluded.club_id");
    });

    it("공식 로고 자료 스크립트: 어드민이 일부러 지운 홈페이지를 다시 채우지 않는다", () => {
        expect(root("server/scripts/golf-logos-official.ts")).toContain("website = case when coalesce(website, '') = '' and not ('website' = any(admin_keep)) then");
    });

    it("열은 더하기만 한 마이그레이션에 있고 스키마에도 있다", () => {
        const mig = root("migrations/golf_course_pages_admin_keep.sql");
        expect(mig).toContain("alter table golf_course_pages add column if not exists admin_keep text[] not null default '{}'::text[];");
        expect(code(mig)).not.toMatch(/\b(drop|delete|truncate)\b/i);
        expect(root("shared/schema.ts")).toContain('adminKeep: text("admin_keep").array().default([]).notNull(),');
    });
});

describe("서버가 규칙대로 쓰는가(소스)", () => {
    const store = code(root("server/storage/adminGolfCourses.ts"));

    it("원장 좌표를 고칠 때 — 그 페이지가 이 원장에 붙어 있을 때만, 그 페이지 하나만 같은 값으로", () => {
        const fn = store.slice(store.indexOf("export async function setClubCoords("), store.indexOf("export type PageCoordsResult"));
        expect(fn).toContain('if (!pg || String(pg.club_id ?? "") !== clubId) return { ok: false, reason: "page-mismatch" } as const;');
        expect(fn).toContain('await tx.execute(sql`update golf_course_pages set lat = ${lat}, lng = ${lng}, ${keepSql(["coords"])}, updated_at = now() where slug = ${slug}`);');
        // 원장과 페이지를 한 트랜잭션에서 — 한쪽만 바뀌지 않게
        expect(fn).toContain("return db.transaction(async (tx: Exec) => {");
        // 같은 원장을 쓰는 다른 페이지까지 고치는 쿼리는 없다
        expect(fn).not.toMatch(/update golf_course_pages[^`]*where club_id/);
    });

    it("이름을 고칠 때 — 주소(슬러그)는 쓰지 않는다 · 옛 이름을 별칭에 남긴다 · 원장 이름은 진행 중 경기·같이 쓰는 페이지가 없을 때만", () => {
        const fn = store.slice(store.indexOf("export async function renameCourse("));
        expect(fn).not.toMatch(/set slug\s*=|,\s*slug\s*=/);
        expect(fn).toContain('if (sib) return { ok: false, reason: "club-shared" } as const;');
        expect(fn).toContain('if (live) return { ok: false, reason: "club-live" } as const;');
        expect(fn).toContain("...(old.some((a) => key(a) === key(before)) ? [] : [before])");
        // 원장 이름을 먼저 확인·수정하고 페이지를 쓴다 — 막히면 페이지 이름도 쓰지 않는다(같은 트랜잭션)
        expect(fn.indexOf('reason: "club-live"')).toBeLessThan(fn.indexOf("update golf_course_pages set name ="));
    });

    it("라우트: 전부 관리자 가드 뒤 · 이름과 좌표 고치기는 기록을 남긴다", () => {
        const route = code(root("server/routes/modules/adminGolf/courses.ts"));
        for (const r of ['router.put("/:slug/name"', 'router.patch("/:slug/coords"', 'router.patch("/clubs/:clubId/coords"']) expect(route, r).toContain(r);
        for (const a of ['adminLog(req, "golf.course.name"', 'adminLog(req, "golf.course.coords"', 'adminLog(req, "golf.club.coords"']) expect(route, a).toContain(a);
        const index = code(root("server/routes/modules/adminGolf/index.ts"));
        expect(index.indexOf('router.use("/courses", courses);')).toBeGreaterThan(index.indexOf("router.use(checkSuperAdmin);"));
    });
});

describe("화면이 규칙대로 이어져 있는가(소스)", () => {
    const view = code(root("client/src/pages/admin/golf/GolfCoursesView.tsx"));

    it("이름 고치기 — 서버와 같은 규칙으로 막고, 고치기 전 이름을 같이 보내고, 묻고 저장한다", () => {
        const ed = view.slice(view.indexOf("function NameEditor("), view.indexOf("function ContactEditor("));
        expect(ed).toContain("const c = cleanCourseName(name);");
        expect(ed).toContain("save.mutate({ name: c.name, expected: d.name, alsoClub: withClub });");
        expect(ed).toContain("apiRequest(`${API}/${encodeURIComponent(d.slug)}/name`, { method: \"PUT\", body })");
        expect(ed).toContain("if (!(await appConfirm({");
        expect(ed).not.toMatch(/window\.confirm|[^p]confirm\(/);
        // 원장 이름은 그 원장을 이 페이지만 쓰고 진행 중 경기가 없을 때만 같이 바꿀 수 있다
        expect(ed).toContain("const clubRenamable = !!d.club && d.sharedClubPages.length === 0 && d.liveMatches === 0;");
        expect(view).toContain('<Section title="골프장 이름"><NameEditor d={d} /></Section>');
    });

    it("좌표 — 원장 좌표를 저장할 때 이 페이지(slug)를 같이 보낸다 · 짝이 없으면 페이지 좌표를 바로 고친다 · 어긋나 있으면 맞추기 단추", () => {
        const ed = view.slice(view.indexOf("function CoordsEditor("));
        expect(ed).toContain("? apiRequest(`${API}/clubs/${club.id}/coords`, { method: \"PATCH\", body: { ...body, slug: d.slug } })");
        expect(ed).toContain(": apiRequest(`${API}/${encodeURIComponent(d.slug)}/coords`, { method: \"PATCH\", body }),");
        expect(ed).toContain("const pageOff = !!club && club.lat != null && club.lng != null && (!page || page.lat !== club.lat || page.lng !== club.lng);");
        expect(ed).toContain("save.mutate({ lat: club!.lat!, lng: club!.lng! });");
        expect(ed).toContain("원장 좌표를 저장하면 골프장 페이지 좌표도 같은 값으로 바뀝니다.");
        // 예전의 '좌표를 넣을 데가 없습니다' 막다른 길은 없다
        expect(view).not.toContain("좌표를 넣을 데가 없습니다");
    });

    it("안내 글 — 고친 값이 다시 적재할 때 돌아간다는 옛 말은 없다", () => {
        expect(view).not.toContain("다시 돌리면 원본 자료 값으로 돌아갑니다");
        expect(view).toContain("자료를 다시 적재할 때 덮이지 않습니다");
        expect(view).not.toContain("스크립트를 다시 돌리면 다시 채워집니다");
    });
});
