/**
 * 골프장 페이지의 빈 로고를 **골프장 공식 홈페이지**에서 받은 로고로 채운다(2026-10-01 오너: "로고 넣어줘, 있는 로고는 그대로").
 *
 * 자료: `data/golf-logos-official.json`(slug → logo·website·source). 로고 파일은 `client/public/img/golf-logos/g-<sha1(slug) 10자>.png`.
 *  - 더블이글 로고가 이미 있는 페이지는 건드리지 않는다. 홈페이지 주소도 비어 있을 때만 채운다.
 *  - 로고는 고치지 않는다(배경만 투명으로, 크기만 맞춤). 흰색뿐인 로고는 `-light.png` — 화면이 어두운 판에 얹는다(CourseLogo).
 *  - source 에 받은 주소를 남긴다 — 골프장이 바꾸거나 내려 달라고 하면 이 표에서 지운다.
 *  - website 는 협회 명부·관광공사 자료로 주소·이름이 확실히 맞은 곳만 넣었다.
 *
 * golf-course-pages.ts 가 페이지를 다시 적재할 때도 applyOfficialLogos 로 같은 값을 얹는다 — 다시 돌려도 지워지지 않게.
 *   npx tsx server/scripts/golf-logos-official.ts           # 무엇이 바뀔지만
 *   npx tsx server/scripts/golf-logos-official.ts --write   # 운영 DB 에 적용
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type OfficialLogo = { logo?: string; website?: string; source?: string; found?: string };

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "data/golf-logos-official.json");

export function readOfficialLogos(): Record<string, OfficialLogo> {
    try {
        return JSON.parse(fs.readFileSync(DATA, "utf8")).logos ?? {};
    } catch {
        return {};
    }
}

/** 적재 중인 페이지 줄에 얹는다 — 로고·홈페이지가 비어 있을 때만. 얹은 로고 수를 돌려준다 */
export function applyOfficialLogos(rows: { slug?: string; logo?: string | null; website?: string | null }[]): number {
    const map = readOfficialLogos();
    let n = 0;
    for (const r of rows) {
        const o = r.slug ? map[r.slug] : undefined;
        if (!o) continue;
        if (o.logo && !r.logo) { r.logo = o.logo; n++; }
        if (o.website && !r.website) r.website = o.website;
    }
    return n;
}

async function main() {
    await import("dotenv/config");
    const { sql } = await import("drizzle-orm");
    const { db } = await import("../db.js");
    const write = process.argv.includes("--write");
    const map = readOfficialLogos();
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    let logos = 0, sites = 0, missingPage = 0;
    for (const [slug, o] of Object.entries(map)) {
        if (o.logo?.startsWith("/img/golf-logos/") && !fs.existsSync(path.join(repoRoot, "client/public", o.logo))) {
            throw new Error(`로고 파일이 없다: ${o.logo} (${slug})`);
        }
        const res: any = await db.execute(sql`select logo, website from golf_course_pages where slug = ${slug}`);
        const cur = (res.rows ?? res)[0];
        if (!cur) { missingPage++; console.log("페이지 없음:", slug); continue; }
        const setLogo = !!o.logo && !cur.logo;
        const setSite = !!o.website && !cur.website;
        if (!setLogo && !setSite) continue;
        if (setLogo) logos++;
        if (setSite) sites++;
        console.log(`${slug}: ${setLogo ? `logo ${o.logo}` : ""}${setLogo && setSite ? " · " : ""}${setSite ? `site ${o.website}` : ""}`);
        if (write) {
            await db.execute(sql`update golf_course_pages
                set logo = case when coalesce(logo, '') = '' then ${o.logo ?? null} else logo end,
                    website = case when coalesce(website, '') = '' and not ('website' = any(admin_keep)) then ${o.website ?? null} else website end,
                    updated_at = now()
                where slug = ${slug}`);
        }
    }
    console.log(`\n로고 ${logos}곳 · 홈페이지 ${sites}곳${missingPage ? ` · 페이지 없음 ${missingPage}` : ""}${write ? " — 적용함" : " — 미리보기(--write 로 적용)"}`);
    process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => { console.error(e); process.exit(1); });
}
