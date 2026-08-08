// 매장 디렉토리 좌표 백필 — Nominatim(키 불필요, 1req/s 정책 준수).
//   npx tsx server/scripts/geocode-listings.ts
// 멱등: 좌표 없는 행만 처리. 중단돼도 재실행하면 이어서 돈다.
// 전체 주소가 OSM에 없으면 geocodeCity가 동→구→시 수준으로 축소 재시도 —
// "내 주변 거리순"에는 동 단위 정밀도면 충분하다.
import { db } from "../db.js";
import { storeListings } from "../../shared/schema.js";
import { eq, isNull } from "drizzle-orm";
import { geocodeCity } from "../lib/geocode.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Neon WebSocket 은 20분+ 배치 중 유휴 연결이 끊길 수 있다(실측: ECONNRESET 로 프로세스 사망).
// 소켓의 비동기 error 이벤트가 unhandled 로 터지는 것을 삼키고, 쿼리는 새 연결로 재시도한다.
process.on("uncaughtException", (e) => console.warn("[geocode] 연결 오류 무시:", (e as Error)?.message));
process.on("unhandledRejection", (e) => console.warn("[geocode] 비동기 오류 무시:", (e as any)?.message ?? e));

async function saveWithRetry(code: string, lat: number, lng: number): Promise<boolean> {
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await db.update(storeListings)
                .set({ latitude: lat, longitude: lng })
                .where(eq(storeListings.code, code));
            return true;
        } catch (e) {
            console.warn(`[geocode] DB 저장 실패(${attempt}/3) ${code}:`, (e as Error)?.message);
            await sleep(3000);
        }
    }
    return false;
}

const rows = await db.select({ code: storeListings.code, address: storeListings.address })
    .from(storeListings).where(isNull(storeListings.latitude));
console.log(`좌표 미보유 ${rows.length}건 — 예상 소요 ~${Math.ceil(rows.length * 1.15 / 60)}분`);

let ok = 0, fail = 0;
for (const [i, r] of rows.entries()) {
    // 번지 뒤 층·호 표기는 지오코딩에 노이즈 — "서울 동대문구 답십리동 492-1 5층" → 층 제거
    const cleaned = r.address.replace(/\s+(지하\s*)?\d+층.*$/, "").replace(/\s+[\dB]+호.*$/, "");
    const geo = await geocodeCity(cleaned, "KR");
    if (geo && await saveWithRetry(r.code, geo.lat, geo.lng)) {
        ok++;
    } else {
        fail++;
        console.warn(`실패: ${r.code} ${cleaned}`);
    }
    if ((i + 1) % 50 === 0) console.log(`진행 ${i + 1}/${rows.length} (성공 ${ok}, 실패 ${fail})`);
    await sleep(1100); // Nominatim 정책: 최대 1req/s
}
console.log(`완료 — 성공 ${ok}건, 실패 ${fail}건`);
process.exit(0);
