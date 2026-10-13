/**
 * 산행 사진 — 공개가 기본, 올린 사람이 사진마다 공개 · 비공개(2026-10-13 오너).
 * 올리면 그 산의 화면에 바로 보이므로 신고 · 차단 · 자동 가림 · 이의제기 · 운영자 큐 · 탈퇴가 한 벌로 붙어 있어야 한다 — 하나라도 빠지면 여기서 걸린다.
 * DB 없이 본다: 순수 함수는 그대로 부르고, 질의 · 라우트 · 화면은 소스의 모양을 고정한다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
    HIKING_GALLERY_LIMIT, HIKING_GALLERY_MAX, HIKING_PHOTO_AUTO_HIDE_REPORTERS, HIKING_PHOTO_CATEGORIES, HIKING_PHOTO_CATEGORY, HIKING_PHOTO_DEFAULT_PUBLIC, HIKING_PHOTO_LABEL,
    HIKING_PHOTO_REPORT_TARGET, HIKING_PHOTOS_ANCHOR, HIKING_THUMB_CATEGORY, hikingPhotoCredit, hikingPhotoMonth, isOwnHikingPhotoUrl, validPhotoSize,
} from "./hikingPhotos";
import { APPEALABLE_TARGETS, BLINDABLE_TARGETS, DELETABLE_TARGETS, REPORT_TARGET_TYPES, TARGET_LABEL, authorNoticeFor, authorNoticeRoute, availableActions } from "../server/lib/reportQueue";
import { ko } from "./i18n/ko";
import { en } from "./i18n/en";
import { es } from "./i18n/es";
import { tr } from "./i18n/tr";
import { vi } from "./i18n/vi";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|--).*$/gm, "");
/** 소스에서 한 토막 — 시작 글부터 끝 글 앞까지(끝 글을 안 주면 끝까지) */
const cut = (src: string, from: string, to?: string) => {
    const a = src.indexOf(from);
    expect(a, `없는 토막: ${from}`).toBeGreaterThanOrEqual(0);
    const b = to ? src.indexOf(to, a + from.length) : -1;
    return src.slice(a, b < 0 ? undefined : b);
};

const ME = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const OTHER = "11111111-2222-3333-4444-555555555555";
const HOST = "https://zts7idyjw1ng1uqz.public.blob.vercel-storage.com";
const LOCATION = /\blat\b|\blng\b|\blon\b|latitude|longitude|geom|coords|accuracy|exif/i;

const repo = read("server/storage/hikingPhotos.ts");
const route = read("server/routes/modules/hiking.ts");
const photoRoutes = cut(code(route), "const PHOTO_ID =", "router.get(\"/crews/:id/summits\"");
/** 라우트 한 줄(메서드 · 주소로 시작하는 줄) */
const routeLine = (method: string, path: string) => {
    const line = photoRoutes.split("\n").find((l) => l.startsWith(`router.${method}("${path}"`));
    expect(line, `${method} ${path}`).toBeTruthy();
    return line!;
};

describe("주소 — 우리 업로드 API 가 이 회원에게 만들어 준 등산 사진만", () => {
    it("업로드 경로의 모양과 같다 — hiq/<폴더>/<회원 id>-<무작위>.<확장자>", () => {
        // 업로드 API 가 이름을 이렇게 짓는다(무작위 꼬리는 저장소가 붙인다) — 모양이 바뀌면 아래 식도 같이 바뀌어야 한다
        const upload = read("server/routes/modules/member.ts");
        expect(upload).toContain("put(`hiq/${safeCat}/${req.userId}.${clean.type ? IMAGE_EXT[clean.type] : \"webp\"}`, clean.buffer, {");
        expect(upload).toContain("addRandomSuffix: true,");
        expect(read("server/utils/imageMeta.ts")).toContain('export const IMAGE_EXT: Record<ImageKind, string> = { webp: "webp", jpeg: "jpg", png: "png" };');
        for (const ext of ["webp", "jpg", "png"]) expect(isOwnHikingPhotoUrl(`${HOST}/hiq/hiking-photo/${ME}-mLI6gXo8i4EOvnHXvjKeOHxY0rJNpQ.${ext}`, ME, HIKING_PHOTO_CATEGORY)).toBe(true);
        expect(isOwnHikingPhotoUrl(`${HOST}/hiq/hiking-thumb/${ME}-abcDEF123456.webp`, ME, HIKING_THUMB_CATEGORY)).toBe(true);
        expect(Array.from(HIKING_PHOTO_CATEGORIES)).toEqual(["hiking-photo", "hiking-thumb"]);
    });
    it("남의 사진 · 다른 폴더 · 바깥 주소 · 꼬리가 붙은 주소는 막는다", () => {
        const no = (url: unknown, id = ME, cat = HIKING_PHOTO_CATEGORY) => expect(isOwnHikingPhotoUrl(url, id, cat), String(url)).toBe(false);
        no(`${HOST}/hiq/hiking-photo/${OTHER}-abcDEF123456.webp`);
        no(`${HOST}/hiq/hiking-thumb/${ME}-abcDEF123456.webp`);
        no(`${HOST}/hiq/hiking-photo/${ME}-abcDEF123456.webp`, ME, HIKING_THUMB_CATEGORY);
        no(`${HOST}/hiq/golf-photo/${ME}-abcDEF123456.webp`);
        no(`${HOST}/hiq/golf-photo/${ME}-abcDEF123456.webp`, ME, "golf-photo");
        no(`${HOST}/hiq/hiking-photo/../golf-photo/${ME}-abcDEF123456.webp`);
        no(`${HOST}/hiq/hiking-photo/${ME}.webp`);
        no(`${HOST}/hiq/hiking-photo/${ME}-abcDEF123456.svg`);
        no(`${HOST}/hiq/hiking-photo/${ME}-abcDEF123456.webp?x=1`);
        no(`${HOST}/hiq/hiking-photo/${ME}-abcDEF123456.webp#x`);
        no(`https://evil.example.com/hiq/hiking-photo/${ME}-abcDEF123456.webp`);
        no(`http://zts7idyjw1ng1uqz.public.blob.vercel-storage.com/hiq/hiking-photo/${ME}-abcDEF123456.webp`);
        no(`${HOST}/hiq/hiking-photo/x-abcDEF123456.webp`, ".*");
        no(`${HOST}/hiq/hiking-photo/${ME}-${"x".repeat(400)}.webp`);
        no("javascript:alert(1)");
        no("not a url");
        no(null);
    });
    it("라우트는 그 식과 우리 저장소 호스트를 둘 다 본다 · 올릴 수 있는 수에 끝이 있다", () => {
        const post = cut(photoRoutes, 'router.post("/photos"', 'router.patch("/photos/:id"');
        expect(post).toContain("!isOwnHikingPhotoUrl(b.url, req.userId!, HIKING_PHOTO_CATEGORY) || !isOwnHikingPhotoUrl(b.thumbUrl, req.userId!, HIKING_THUMB_CATEGORY)");
        expect(post).toContain("!isOnOwnBlobHost(b.url) || !isOnOwnBlobHost(b.thumbUrl)");
        expect(post).toContain("HIKING_PHOTO_PER_MOUNTAIN_MAX");
        expect(post).toContain("HIKING_PHOTO_DAILY_MAX");
    });
    it("크기 — 정수이고 말이 되는 값만", () => {
        expect(validPhotoSize(1600, 1200)).toBe(true);
        expect(validPhotoSize(1600.5, 1200)).toBe(false);
        expect(validPhotoSize(0, 1200)).toBe(false);
        expect(validPhotoSize(9000, 1200)).toBe(false);
        expect(validPhotoSize("1600", 1200)).toBe(false);
    });
});

describe("공개가 기본 — 이미 있던 사진과 옛 화면의 사진은 비공개로 남는다", () => {
    const sql = code(read("migrations/hiking_photos_public.sql"));
    it("새 화면은 공개 여부를 늘 실어 보내고, 그 기본값은 공개다", () => {
        expect(HIKING_PHOTO_DEFAULT_PUBLIC).toBe(true);
        const api = read("client/src/hiking/photos/photoApi.ts");
        expect(api).toContain("export async function uploadHikingPhoto(mountainId: string, file: File, isPublic: boolean = HIKING_PHOTO_DEFAULT_PUBLIC)");
        expect(api).toContain("body: JSON.stringify({ mountainId, url, thumbUrl, width: big.width, height: big.height, isPublic })");
        // 올릴 때 고르게 하지 않는다(올린 뒤에 사진마다 바꾼다) — 화면은 기본값으로만 올린다
        expect(read("client/src/hiking/photos/MyPhotos.tsx")).toContain("await uploadHikingPhoto(mountainId, f);");
    });
    it("서버는 실려 온 값만 믿는다 — 실려 오지 않은 요청(\"내 사진첩에만\"이라 적힌 옛 화면)은 비공개로 적는다", () => {
        expect(photoRoutes).toContain("const publishing = (req: AuthRequest) => req.body?.isPublic === true;");
        expect(cut(photoRoutes, 'router.post("/photos"', 'router.patch("/photos/:id"')).toContain("isPublic: publishing(req) })");
        // 표의 기본값에 맡기지 않고 줄마다 적는다
        expect(repo).toContain("insert into hiking_photos (member_id, mountain_id, url, thumb_url, width, height, is_public)");
        expect(repo).toContain("${p.isPublic === true})");
    });
    it("표 — 더하기만, 여러 번 돌려도 같다. 이미 있는 줄은 비공개다", () => {
        const stmts = sql.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
        expect(stmts).toEqual([
            "alter table hiking_photos add column if not exists is_public boolean not null default false",
            "alter table hiking_photos add column if not exists hidden_at timestamp",
            "alter table hiking_photos add column if not exists appeal_text text",
            "alter table hiking_photos add column if not exists appeal_at timestamp",
            "create index if not exists hiking_photos_public_idx on hiking_photos (mountain_id, taken_at desc) where is_public and hidden_at is null",
        ]);
        // 있는 줄을 공개로 뒤집는 문장이 없다
        expect(sql).not.toMatch(/default true|set default|\bupdate\b|\bdelete\b|\bdrop\b/i);
    });
    it("새 칸이 아직 없어도 읽기는 버틴다 — 내 사진은 옛 칸으로(전부 비공개), 공개 목록은 빈 값", () => {
        expect(repo).toContain("false as is_public, false as hidden, false as appealed`;");
        expect(repo).toContain("if (missingColumn(e)) return (await run(MINE_BEFORE)).map(out);");
        expect(cut(repo, "export async function listMountainPhotos", "// ── 신고")).toContain("if (missingTable(e) || missingColumn(e)) return [];");
    });
});

describe("올린 사람의 길 — 내 사진만 읽고 바꾸고 지운다", () => {
    const mine = cut(code(repo), "export async function listPhotos", "export async function listMountainPhotos");
    it("모든 질의에 회원 조건이 있다", () => {
        const queries = mine.match(/(select|update|delete|insert)[^`]*hiking_photos[^`]*/g) ?? [];
        expect(queries.length).toBeGreaterThanOrEqual(7);
        for (const q of queries) {
            if (q.startsWith("insert")) expect(q).toContain("values (${memberId}::uuid,");
            else expect(q, q.slice(0, 70)).toContain("member_id = ${memberId}::uuid");
        }
    });
    it("공개 · 비공개는 올린 사람만, 언제든 — 거두는 쪽(비공개 · 지우기 · 이의제기)은 로그인만 본다", () => {
        expect(mine).toContain("update hiking_photos set is_public = ${isPublic === true} where id = ${photoId}::uuid and member_id = ${memberId}::uuid");
        expect(routeLine("patch", "/photos/:id")).toContain('router.patch("/photos/:id", requireAuth, hikingIfPublishing, termsIfPublishing, asyncHandler(');
        expect(routeLine("delete", "/photos/:id")).toContain('router.delete("/photos/:id", requireAuth, asyncHandler(');
        expect(routeLine("post", "/photos/:id/appeal")).toContain('router.post("/photos/:id/appeal", requireAuth, asyncHandler(');
        // 공개로 내놓는 쪽은 등산의 문과 약관(정지된 계정 포함)을 지난다
        expect(routeLine("post", "/photos")).toContain('router.post("/photos", ...requireHikingAccess, termsIfPublishing, asyncHandler(');
        expect(routeLine("get", "/me/photos")).toContain("...requireHikingAccess");
        expect(photoRoutes).toContain("if (!publishing(req)) return next(); checkHiking(req, res, next).catch(next);");
        expect(photoRoutes).toContain("if (!publishing(req)) return next(); requireTermsAccepted(req, res, next).catch(next);");
    });
    it("이의제기는 가려진 내 사진에만", () => {
        expect(mine).toContain("where id = ${photoId}::uuid and member_id = ${memberId}::uuid and hidden_at is not null returning id");
        expect(mine).toContain("appeal_at = now()");
    });
    it("화면 — 사진마다 공개 · 비공개를 고르고, 비공개 사진에는 자물쇠가 붙는다", () => {
        const ui = read("client/src/hiking/photos/MyPhotos.tsx");
        expect(ui).toContain('role="radiogroup" aria-label="공개 여부"');
        expect(ui).toContain("onPick={(isPublic) => audience.mutate({ id: open.id, isPublic })}");
        expect(ui).toContain('data-testid="hk-photo-lock"');
        expect(ui).toContain("{open.isPublic ? HIKING_PHOTO_LABEL.face : HIKING_PHOTO_LABEL.privateNow}");
        // 가려진 사진 — 알림과 이의제기는 한 벌
        expect(ui).toContain("appeal.mutate(open.id)");
        // 남에게 보이는 사진이다 — 약관에 동의하지 않았으면 먼저 묻는다
        expect(ui).toContain("if (needsConsent) {");
    });
});

describe("누구나 보는 길 — 공개 · 안 가려진 것만, 달까지만", () => {
    const pub = cut(code(repo), "export async function listMountainPhotos", "export interface HikingPhotoRow");
    it("공개 · 가림 · 탈퇴 · 차단을 거른다", () => {
        expect(pub).toContain("where p.mountain_id = ${mountainId} and p.is_public and p.hidden_at is null ${notBlocked}");
        expect(pub).toContain("join hiq_members m on m.id = p.member_id and m.profile_id is not null");
        expect(pub).toContain("and not exists (select 1 from hiq_blocks b where b.blocker_id = ${viewerId}::uuid and b.blocked_id = p.member_id)");
        expect(pub).toContain("order by p.taken_at desc, p.created_at desc limit ${n}");
        expect(HIKING_GALLERY_LIMIT).toBe(12);
        expect(HIKING_GALLERY_MAX).toBeGreaterThanOrEqual(HIKING_GALLERY_LIMIT);
    });
    it("나가는 것은 사진 · 이름 · 달뿐 — 전화 · 메일 · 정확한 날이 없다", () => {
        const select = cut(pub, "select p.id::text as id", "from hiking_photos p");
        expect(select.replace(/\s+/g, " ").trim()).toBe("select p.id::text as id, p.member_id::text as member_id, p.url, p.thumb_url, p.width, p.height, ${at(\"p.taken_at\")} as taken_at, m.name");
        const shape = cut(pub, "return r.map((x) => ({", "}));");
        expect(shape.match(/\b(\w+):/g)).toEqual(["id:", "memberId:", "credit:", "month:", "url:", "thumbUrl:", "width:", "height:"]);
        expect(shape).toContain("month: hikingPhotoMonth(utc(x.taken_at))");
        expect(shape).toContain("credit: hikingPhotoCredit(x.name)");
        expect(pub).not.toMatch(/phone|email|takenAt|appeal_text/);
    });
    it("달까지만 — 한국 시각으로", () => {
        expect(hikingPhotoMonth("2026-09-30T16:30:00Z")).toBe("2026년 10월"); // 한국 시각 10/1 01:30
        expect(hikingPhotoMonth(new Date("2026-09-15T03:00:00Z"))).toBe("2026년 9월");
        expect(hikingPhotoMonth("모름")).toBe("");
        expect(hikingPhotoMonth("2026-10-13T01:02:03.000Z")).not.toMatch(/13|일/);
    });
    it("이름이 없거나 탈퇴한 회원이면 이름을 싣지 않는다", () => {
        expect(hikingPhotoCredit("산다람쥐")).toBe("산다람쥐");
        expect(hikingPhotoCredit("  ")).toBe("랭큐 회원");
        expect(hikingPhotoCredit("탈퇴회원")).toBe("랭큐 회원");
        expect(hikingPhotoCredit(null)).toBe("랭큐 회원");
        expect(hikingPhotoCredit("가".repeat(40))).toHaveLength(20);
    });
    it("길은 누구에게나 열려 있고(등산의 문이 없다), 사람마다 답이 달라 공용 캐시에 두지 않는다", () => {
        const line = routeLine("get", "/mountains/:slug/photos");
        expect(line).toBe('router.get("/mountains/:slug/photos", asyncHandler(async (req: any, res: any) => {');
        const fn = cut(photoRoutes, 'router.get("/mountains/:slug/photos"', 'router.get("/me/photos"');
        expect(fn).toContain('res.set("Cache-Control", "private, no-store");');
        expect(fn).toContain("listMountainPhotos(m.id, viewerOf(req), limit)");
        expect(photoRoutes).toContain("const viewerOf = (req: any): string | null => req.signedCookies?.hiq_user_id ?? null;");
    });
    it("화면 — 방문자에게도 보이고, 남의 사진에는 신고 · 차단이 붙는다", () => {
        const page = read("client/src/hiking/pages/MountainPage.tsx");
        // 등산을 쓰는 회원만 보는 구역(my.mine) 밖에 놓인다 · 코스 구역 다음이다
        expect(page).toContain("<MountainPhotos key={`mountain-photos:${d.slug}`} slug={d.slug} name={d.name} />\n\n                {/* 내 산행 사진");
        expect(page.indexOf("<MountainPhotos ")).toBeGreaterThan(page.indexOf("<Courses key="));
        expect(page.indexOf("<MountainPhotos ")).toBeLessThan(page.indexOf("<MyPhotos key="));
        const ui = read("client/src/hiking/photos/MountainPhotos.tsx");
        expect(ui).toContain("if (photos.length === 0) return null;");
        expect(ui).toContain("<UgcActionMenu key={`ugc:${open.id}`} targetType={HIKING_PHOTO_REPORT_TARGET} targetId={open.id} authorId={open.memberId} authorName={open.credit}");
        // 로그인하지 않은 사람 — 신고 · 차단의 자리가 보이고 로그인으로 간다
        expect(ui).toContain('(["신고", "차단"] as const).map(');
        expect(ui).toContain("goLogin(setLocation, window.location.pathname + window.location.search)");
        // 답이 사람마다 다르다 — 열쇠에 보는 사람
        expect(read("client/src/hiking/photos/photoApi.ts")).toContain('export const mountainPhotosKey = (slug: string, viewer: string) => [HIKING_PHOTOS_KEY, "mountain", slug, viewer] as const;');
        // 크게 보는 화면은 신고 창(z-50)보다 높지 않다 — 높이면 신고 창이 밑에 깔린다
        expect(read("client/src/hiking/photos/PhotoStage.tsx")).toContain('className="fixed inset-0 z-50 flex flex-col');
    });
});

describe("신고 · 자동 가림 · 이의제기 · 운영자 큐", () => {
    const T = HIKING_PHOTO_REPORT_TARGET;
    it("신고 대상의 이름이 서버 · 화면 · 큐에서 같다", () => {
        expect(T).toBe("hiking_photo");
        expect(REPORT_TARGET_TYPES as readonly string[]).toContain(T);
        expect(TARGET_LABEL[T]).toBe("산행 사진");
        const community = read("server/routes/modules/community.ts");
        expect(JSON.parse(community.match(/const REPORT_TARGETS = (\[[^\]]+\])/)![1])).toContain(T);
        expect(read("client/src/components/hiq/community/ReportDialog.tsx")).toContain('| "hiking_photo";');
        expect(read("shared/schema.ts")).toContain('"golf_photo", "hiking_photo"],');
    });
    it("볼 수 있었던 사람만 신고한다 — 비공개 사진은 신고 대상이 아니다", () => {
        const fn = cut(read("server/routes/modules/community.ts"), "async function reportTargetAuthor", 'router.post("/reports"');
        expect(cut(fn, 'case "hiking_photo": {', "default:")).toContain("return ph && ph.isPublic ? ph.memberId : null;");
    });
    it("서로 다른 3명이면 지우지 않고 가린다 — 라운드 사진과 같은 가지", () => {
        expect(HIKING_PHOTO_AUTO_HIDE_REPORTERS).toBe(3);
        const fn = cut(read("server/storage/community.repo.ts"), "async report(opts", "// 이의제기 — 자동 블라인드");
        const three = cut(fn, `if (count >= ${HIKING_PHOTO_AUTO_HIDE_REPORTERS}) {`, "return { reportCount: count, autoBlinded, authorId };");
        expect(three).toContain('} else if (opts.targetType === "hiking_photo") {');
        expect(three).toContain("const memberId = await hideHikingPhotoByReports(opts.targetId);");
        expect(three).toContain("if (memberId) { autoBlinded = true; authorId = memberId; }");
        expect(read("server/storage/community.repo.ts")).toContain('import { hideByReports as hideHikingPhotoByReports } from "./hikingPhotos.js";');
        // 이미 가려진 사진은 다시 가리지 않는다(알림이 두 번 가지 않는다) · 줄을 지우지 않는다
        expect(repo).toContain("update hiking_photos set hidden_at = now() where id = ${id}::uuid and hidden_at is null returning member_id::text as member_id");
    });
    it("가려지면 올린 사람에게 바로 알린다 — 등산 알림함으로, 이의제기할 자리로", () => {
        const fn = cut(read("server/routes/modules/community.ts"), 'if (result.autoBlinded && result.authorId && targetType === "hiking_photo") {', "// 자동 블라인드 시 작성자에게 즉시 알림");
        expect(fn).toContain('title: "notif.hikingPhoto.hidden.title",');
        expect(fn).toContain('body: "notif.hikingPhoto.hidden.body",');
        expect(fn).toContain('category: "HIKING",');
        expect(fn).toContain("storage.hikingPhotos.photoPagePath(await storage.hikingPhotos.get(targetId))");
        expect(repo).toContain("`${hikingMountainPath(p.mountainSlug)}#${HIKING_PHOTOS_ANCHOR}`");
        expect(read("client/src/hiking/pages/MountainPage.tsx")).toContain("id={HIKING_PHOTOS_ANCHOR}");
        expect(HIKING_PHOTOS_ANCHOR).toBe("sec-photos");
        for (const [name, dict] of Object.entries({ ko, en, es, tr, vi })) {
            expect(dict["notif.hikingPhoto.hidden.title"], name).toBeTruthy();
            expect(dict["notif.hikingPhoto.hidden.body"], name).toBeTruthy();
            // 등산의 글에는 그림 글자를 쓰지 않는다
            expect(`${dict["notif.hikingPhoto.hidden.title"]}${dict["notif.hikingPhoto.hidden.body"]}`, name).not.toMatch(/\p{Extended_Pictographic}/u);
        }
        expect(ko["notif.hikingPhoto.hidden.body"]).toContain("이의제기");
    });
    it("운영자 큐 — 가리기 · 다시 보이기 · 지우기 · 이의제기 판정이 라운드 사진과 같다", () => {
        expect(BLINDABLE_TARGETS).toContain(T);
        expect(DELETABLE_TARGETS).toContain(T);
        expect(APPEALABLE_TARGETS).toContain(T);
        const base = { targetType: T, exists: true, isBlinded: false, appealOpen: false, pendingCount: 1, author: { canBan: true, banned: false } } as const;
        expect(availableActions(base)).toEqual(["blind", "delete", "ban", "dismiss"]);
        expect(availableActions({ ...base, isBlinded: true })).toEqual(["unblind", "delete", "ban", "dismiss"]);
        expect(availableActions({ ...base, isBlinded: true, appealOpen: true, pendingCount: 0 })).toEqual(["appeal_approve", "appeal_reject", "delete", "ban"]);
        expect(availableActions({ ...base, exists: false, author: null, pendingCount: 0 })).toEqual([]);
        expect(authorNoticeFor("blind", T)?.body).toContain("이의제기");
        const admin = read("server/storage/admin.repo.ts");
        // 이의제기가 큐를 다시 연다 · 미리보기 · 가리기
        // 줄을 통째로 읽는다 — 새 칸이 아직 없어도 큐(모든 신고가 지나는 질의)가 서게
        expect(admin).toContain("WHEN 'hiking_photo' THEN (SELECT (to_jsonb(hp) ->> 'appeal_at')::timestamp FROM hiking_photos hp");
        expect(admin).toContain("WHERE hp.id = g.target_id AND (to_jsonb(hp) ->> 'hidden_at') IS NOT NULL)");
        const job = cut(admin, 'job("hiking_photo", async (ids) => {', 'job("crew_post"');
        expect(job).toContain("const rows = await hikingPhotos.getMany(ids);");
        expect(job).toContain("images: [r.thumbUrl || r.url],");
        expect(job).toContain("isBlinded: !!r.hiddenAt,");
        expect(job).toContain("appealText: r.appealText, appealAt: r.appealAt,");
        expect(admin).toContain('case "hiking_photo":\n                return hikingPhotos.setHidden(targetId, blinded);');
        // 지우기 — 줄과 파일을 함께
        const del = cut(read("server/services/moderation.ts"), 'case "hiking_photo": {', 'case "crew_post": {');
        expect(del).toContain("const gone = await storage.hikingPhotos.remove(id);");
        expect(del).toContain("if (gone) await deleteBlobs([gone.url, gone.thumbUrl]);");
        expect(read("server/storage/index.ts")).toContain("public hikingPhotos = hikingPhotos;");
    });
    it("조치의 결과는 등산 알림함으로 가서 '내 산행 사진'을 연다 — 지운 사진으로는 링크를 싣지 않는다", () => {
        expect(authorNoticeRoute({ targetType: T, action: "appeal_approve", link: `${HOST}/a.webp`, hikingPath: "/hiking/mountains/x#sec-photos" })).toEqual({ category: "HIKING", url: "/hiking/mountains/x#sec-photos" });
        expect(authorNoticeRoute({ targetType: T, action: "blind", link: null, hikingPath: null })).toEqual({ category: "HIKING", url: "/hiking" });
        expect(authorNoticeRoute({ targetType: T, action: "delete", link: `${HOST}/a.webp`, hikingPath: "/hiking/mountains/x#sec-photos" }).url).toBeNull();
        expect(read("server/services/moderation.ts")).toContain('const hikingPath = p.targetType === "hiking_photo" ? storage.hikingPhotos.photoPagePath(await storage.hikingPhotos.get(p.targetId)) : null;');
    });
    it("차단하면 그 사람의 사진이 바로 빠진다 — 차단 뒤에 다시 받는 목록에 들어 있다", () => {
        expect(read("client/src/components/hiq/community/ReportDialog.tsx")).toContain('queryClient.invalidateQueries({ queryKey: ["hiking-photos"] });');
        expect(read("client/src/hiking/photos/photoApi.ts")).toContain('export const HIKING_PHOTOS_KEY = "hiking-photos";');
    });
});

describe("탈퇴 — 그 회원의 산행 사진을 줄도 파일도 지운다", () => {
    it("탈퇴 라우트가 부르고, 못 지워도 탈퇴는 그대로 간다", () => {
        const member = read("server/routes/modules/member.ts");
        const me = cut(member, 'router.delete("/me", requireAuth', "\n}));");
        expect(me).toContain("await deleteBlobs(await storage.hikingPhotos.deleteAllByMember(req.userId!).catch((e) => {");
        expect(repo).toContain("delete from hiking_photos where member_id = ${memberId}::uuid returning url, thumb_url");
    });
});

describe("좌표는 받지도 저장하지도 내보내지도 않는다", () => {
    it("표 · 저장 · 길 · 화면에 위치 칸이 없다", () => {
        for (const f of ["migrations/hiking_photos.sql", "migrations/hiking_photos_public.sql"]) expect(code(read(f)), f).not.toMatch(LOCATION);
        expect(code(read("migrations/hiking_photos.sql"))).toContain("create table if not exists hiking_photos");
        expect(code(repo)).not.toMatch(LOCATION);
        expect(photoRoutes).not.toMatch(/\.lat\b|\.lng\b|accuracy|coords/);
        for (const f of readdirSync(resolve(__dirname, "../client/src/hiking/photos"))) expect(code(read(`client/src/hiking/photos/${f}`)), f).not.toMatch(/geolocation|\.lat\b|\.lng\b|coords|accuracy/);
        expect(code(read("shared/hikingPhotos.ts"))).not.toMatch(/\blat\b|\blng\b|latitude|longitude/);
    });
    it("올릴 때 사진 정보를 걷는다 — 알아볼 수 없는 파일은 받지 않는다", () => {
        expect(read("server/routes/modules/member.ts")).toContain("(GOLF_PHOTO_CATEGORIES.has(safeCat) || HIKING_PHOTO_CATEGORIES.has(safeCat) || FISHING_PHOTO_CATEGORIES.has(safeCat)) && !clean.type");
        expect(read("client/src/hiking/photos/photoApi.ts")).toContain("canvas.toDataURL(");
    });
});

describe("등산은 등산의 것으로 · 화면의 글", () => {
    it("골프의 사진 코드를 빌려 쓰지 않는다(머리 주석은 그 사실을 적은 것이라 뺀다)", () => {
        const files = [...readdirSync(resolve(__dirname, "../client/src/hiking/photos")).map((f) => `client/src/hiking/photos/${f}`), "shared/hikingPhotos.ts", "server/storage/hikingPhotos.ts"];
        expect(files.length).toBeGreaterThanOrEqual(6);
        for (const f of files) expect(code(read(f)), f).not.toMatch(/@\/golf|golf\/|golfPhoto|golf_round_photos|GolfPhoto/);
    });
    it("등산 화면의 규칙 — 리터럴 색만 · 12px 아래 글자 없음 · 굵기는 semibold 까지 · 확인 창은 우리 것", () => {
        for (const f of readdirSync(resolve(__dirname, "../client/src/hiking/photos")).filter((x) => x.endsWith(".tsx"))) {
            const src = code(read(`client/src/hiking/photos/${f}`));
            expect(src, f).not.toMatch(/\b(?:bg|text|border|ring)-(?:white|black|brand|ink-\d)\b/);
            expect([...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].every((x) => Number(x[1]) >= 12), f).toBe(true);
            expect(src, f).not.toMatch(/font-(?:bold|extrabold|black)\b/);
            expect(src, f).not.toMatch(/\bwindow\.(?:confirm|alert)\(|[^a-zA-Z.]confirm\(|[^a-zA-Z.]alert\(/);
            expect(src, f).not.toMatch(/\p{Extended_Pictographic}/u);
        }
    });
    it("약속한 것만 적는다 — 어디에 보이는지 · 얼굴 이야기 · 위치 정보", () => {
        expect(HIKING_PHOTO_LABEL.face).toBe("공개 사진은 이 산의 화면에 보여요. 같이 간 사람의 얼굴이 나온 사진은 비공개로 두세요.");
        // 올리는 순간 공개다 — 얼굴 이야기는 올리기 단추 밑에도 있다
        expect(HIKING_PHOTO_LABEL.faceShort).toBe("같이 간 사람의 얼굴이 나온 사진은 비공개로 두세요.");
        expect(read("client/src/hiking/photos/MyPhotos.tsx")).toContain('data-testid="hk-photo-face">{HIKING_PHOTO_LABEL.faceShort}</p>');
        expect(HIKING_PHOTO_LABEL.where).toContain("이 산의 화면에 보여요");
        expect(HIKING_PHOTO_LABEL.where).toContain("비공개로 돌릴 수 있어요");
        expect(HIKING_PHOTO_LABEL.note).toContain("위치 정보는 올릴 때 지워요");
        expect(HIKING_PHOTO_LABEL.galleryTitle).toBe("이 산의 사진");
        // 이제 사실이 아닌 옛 약속이 남아 있지 않다 · 그림 글자가 없다
        expect(JSON.stringify(HIKING_PHOTO_LABEL)).not.toMatch(/내 사진첩에만/);
        expect(JSON.stringify(HIKING_PHOTO_LABEL)).not.toMatch(/\p{Extended_Pictographic}/u);
        // 산행 중 화면(작은 모양)에서도 어디에 보이는지 말한다 — 올리는 순간 남에게 보인다
        const ui = read("client/src/hiking/photos/MyPhotos.tsx");
        expect(ui).toContain('<p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE399] break-keep" data-testid="hk-photo-where">{HIKING_PHOTO_LABEL.where}</p>');
        expect(ui).not.toContain("{!compact && <p className=\"mt-2 text-[12.5px] leading-snug text-[#F4EFE399] break-keep\" data-testid=\"hk-photo-where\">");
    });
});
