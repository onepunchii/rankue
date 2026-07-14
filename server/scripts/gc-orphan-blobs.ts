import "dotenv/config";
import { list, del } from "@vercel/blob";
import { db } from "../db.js";
import { hiqCrews, hiqCrewPhotos, hiqCrewPosts } from "../../shared/schema.js";

/**
 * Orphan Blob GC — 크루 콘텐츠 이미지에 한정한 안전 청소.
 *
 * 기본은 DRY-RUN(출력만). 실제 삭제는 `--apply` 플래그가 있을 때만.
 * 스캔 prefix ↔ 참조 컬럼(완전 매핑, 누락 없음):
 *   hiq/crew-cover/  ↔ hiqCrews.coverImage
 *   hiq/crew-logo/   ↔ hiqCrews.emblem
 *   hiq/crew-photo/  ↔ hiqCrewPhotos.url
 *   hiq/post/        ↔ hiqCrewPosts.images[]
 *
 * 실행:
 *   npx tsx server/scripts/gc-orphan-blobs.ts            # 미리보기(삭제 안 함)
 *   npx tsx server/scripts/gc-orphan-blobs.ts --apply    # 실제 삭제
 */

const APPLY = process.argv.includes("--apply");
const PREFIXES = ["hiq/crew-cover/", "hiq/crew-logo/", "hiq/crew-photo/", "hiq/post/"];
const MIN_AGE_MS = 24 * 3600 * 1000; // 24시간 이내 업로드는 건너뜀(생성 도중 레이스 방지)

async function referencedUrls(): Promise<Set<string>> {
    const ref = new Set<string>();
    const put = (v: unknown) => { if (typeof v === "string" && v) ref.add(v); };
    const [crews, photos, posts] = await Promise.all([
        db.select({ c: hiqCrews.coverImage, e: hiqCrews.emblem }).from(hiqCrews),
        db.select({ u: hiqCrewPhotos.url }).from(hiqCrewPhotos),
        db.select({ i: hiqCrewPosts.images }).from(hiqCrewPosts),
    ]);
    crews.forEach((r) => { put(r.c); put(r.e); });
    photos.forEach((r) => put(r.u));
    posts.forEach((r) => (r.i ?? []).forEach(put));
    return ref;
}

async function main() {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) throw new Error("BLOB_READ_WRITE_TOKEN 미설정");

    const ref = await referencedUrls();

    const blobs: Array<{ url: string; pathname: string; size: number; uploadedAt: Date }> = [];
    for (const prefix of PREFIXES) {
        let cursor: string | undefined;
        do {
            const page = await list({ prefix, cursor, limit: 1000, token });
            blobs.push(...(page.blobs as any));
            cursor = page.cursor;
        } while (cursor);
    }

    const cutoff = Date.now() - MIN_AGE_MS;
    const orphans = blobs.filter(
        (b) => !ref.has(b.url) && new Date(b.uploadedAt).getTime() < cutoff,
    );
    const mb = orphans.reduce((s, b) => s + (b.size || 0), 0) / 1048576;

    console.log(`스캔 blob=${blobs.length}  DB참조=${ref.size}  orphan=${orphans.length}  (~${mb.toFixed(2)}MB)`);
    console.log(APPLY ? "모드: APPLY (실제 삭제)" : "모드: DRY-RUN — 실제 삭제하려면 --apply 추가");

    if (!APPLY) {
        orphans.slice(0, 50).forEach((b) => console.log("  -", b.pathname, `${(b.size / 1024).toFixed(0)}KB`));
        if (orphans.length > 50) console.log(`  ... 외 ${orphans.length - 50}개`);
        return;
    }

    for (let i = 0; i < orphans.length; i += 100) {
        await del(orphans.slice(i, i + 100).map((b) => b.url), { token });
        console.log(`삭제 ${Math.min(i + 100, orphans.length)}/${orphans.length}`);
    }
    console.log("완료");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
