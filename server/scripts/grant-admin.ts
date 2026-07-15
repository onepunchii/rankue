import "dotenv/config";
import { db } from "../db.js";
import { profiles, hiqStores } from "../../shared/schema.js";
import { eq } from "drizzle-orm";

/**
 * 관리자(super_admin) 계정 프로비저닝 — 기존 프로필을 승격하고 매장 소유자로 연결한다.
 * 새 계정을 만들지 않는다(전화번호로 이미 존재하는 프로필이 있어야 함 → 먼저 앱에서 가입/로그인).
 *
 * 실행:
 *   npx tsx server/scripts/grant-admin.ts <전화번호> <비밀번호> [매장slug]
 * 예:
 *   npx tsx server/scripts/grant-admin.ts 01012345678 mySecret123
 *
 * 완료 후 https://www.rankue.co.kr/partner/login 에서 전화번호+비밀번호로 로그인하면
 *   /admin (매장 관리자), /admin/dashboard (슈퍼 관리자) 접속 가능.
 */

const phone = process.argv[2];
const password = process.argv[3];
const storeSlug = process.argv[4];

async function main() {
    if (!phone || !password) {
        console.error("사용법: npx tsx server/scripts/grant-admin.ts <전화번호> <비밀번호> [매장slug]");
        process.exit(1);
    }

    // 1. 전화번호로 기존 프로필 찾기 (없으면 중단 — 새로 만들지 않음)
    const [profile] = await db.select().from(profiles).where(eq(profiles.phone, phone));
    if (!profile) {
        console.error(`❌ 전화번호 ${phone} 로 등록된 프로필이 없습니다. 먼저 앱에서 가입/로그인 후 다시 실행하세요.`);
        process.exit(1);
    }

    // 2. 연결할 매장 선택 (slug 지정, 없으면 매장이 정확히 1개일 때 자동 선택)
    const stores = await db.select().from(hiqStores);
    let store = storeSlug ? stores.find((s) => s.slug === storeSlug) : (stores.length === 1 ? stores[0] : undefined);
    if (!store) {
        console.error(
            storeSlug
                ? `❌ slug='${storeSlug}' 매장이 없습니다. 존재하는 매장: ${stores.map((s) => s.slug).join(", ") || "(없음)"}`
                : `❌ 매장이 ${stores.length}개라 자동 선택 불가. slug를 지정하세요: ${stores.map((s) => s.slug).join(", ")}`,
        );
        process.exit(1);
    }

    // 3. 프로필 승격(super_admin) + 비밀번호 설정, 매장 소유자 연결
    await db.update(profiles).set({ role: "super_admin", password }).where(eq(profiles.id, profile.id));
    await db.update(hiqStores).set({ ownerId: profile.id }).where(eq(hiqStores.id, store.id));

    console.log("✅ 완료");
    console.log(`  프로필: ${profile.nickname ?? phone} → role=super_admin, 비밀번호 설정됨`);
    console.log(`  매장: ${store.name} (${store.slug}) → 소유자=이 계정`);
    console.log("");
    console.log("다음: https://www.rankue.co.kr/partner/login 에서 전화번호+비밀번호로 로그인");
    console.log("  → /admin (매장 관리자), /admin/dashboard (슈퍼 관리자) 접속 가능");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
