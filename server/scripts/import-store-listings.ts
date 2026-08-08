// 수집 CSV → store_listings 임포트. 멱등(코드 기준 upsert), 재실행 안전.
//   DATABASE_URL=... npx tsx server/scripts/import-store-listings.ts <csv경로>
//
// 정제 규칙 (오너 확정 2026-08-05):
// - 객관 정보만: 이름·지역·주소·전화·영업시간·테이블 수. 설명·요금 자유텍스트 미전재.
// - 마스킹 전화(별표 포함)·형식 불량 전화는 null.
// - 해외 매장(지역이 시도가 아닌 행) 제외.
import fs from "node:fs";
import { db } from "../db.js";
import { storeListings } from "../../shared/schema.js";
import { sql } from "drizzle-orm";

const REGIONS = new Set(["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]);
const PHONE_RE = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;

// 수집 화면의 말줄임(…)이 그대로 긁힌 클럽명 86건 복구. 확실한 경우만 고치고
// 애매하면 말줄임을 유지한다 — 실존 상호를 틀리게 추측하는 것이 더 나쁘다.
const NAME_WORD_RE = /당구|캐롬|클럽|빌리|어드|당구장|Billiard/i;
function cleanName(n: string): string {
    if (!n.endsWith("...")) return n;
    const base = n.slice(0, -3).trimEnd();
    // 1) 닫히지 않은 괄호 = 부가 정보가 잘린 것 — 괄호 앞 본명만 (빈 결과면 원문 유지)
    if (base.includes("(") && !base.includes(")")) {
        const cut = base.slice(0, base.indexOf("(")).trim();
        if (cut) return cut;
    }
    // 2) 명백한 접미사 절단 복구 (이 도메인에서 "…클"은 클럽 외 이어질 수 없다)
    for (const [cut, full] of [["당구클", "당구클럽"], ["대대클", "대대클럽"], ["캐롬클", "캐롬클럽"], ["포켓클", "포켓클럽"],
        ["클럽", "클럽"], ["당구장", "당구장"], ["Billiards Clu", "Billiards Club"], ["Billiard Clu", "Billiard Club"]] as const) {
        if (base.endsWith(cut)) return base.slice(0, base.length - cut.length) + full;
    }
    // 3) 마지막 토큰(지점명 등)이 잘렸고 앞 토큰만으로 상호가 완결되면 꼬리를 버린다
    //    예: "김치당구클럽 영종..." → "김치당구클럽", "닥터캐롬 당구동호..." → "닥터캐롬"
    const tokens = base.split(/\s+/);
    if (tokens.length >= 2 && NAME_WORD_RE.test(tokens.slice(0, -1).join(" "))) {
        return tokens.slice(0, -1).join(" ");
    }
    return n; // 복구 불가 — 말줄임 유지 (사장님 인증·수정 제안으로 교정)
}

function parseCsv(text: string): string[][] {
    // 따옴표 필드(개행 포함) 지원하는 최소 CSV 파서
    const rows: string[][] = [];
    let row: string[] = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += c;
        } else if (c === '"') inQuotes = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n") i++;
            row.push(field); field = "";
            if (row.some(f => f.trim())) rows.push(row);
            row = [];
        } else field += c;
    }
    if (field || row.length) { row.push(field); if (row.some(f => f.trim())) rows.push(row); }
    return rows;
}

async function main() {
    const path = process.argv[2];
    if (!path) { console.error("사용법: npx tsx server/scripts/import-store-listings.ts <csv경로>"); process.exit(1); }
    const raw = fs.readFileSync(path, "utf-8").replace(/^﻿/, "");
    const [header, ...rows] = parseCsv(raw);
    const col = (name: string) => header.indexOf(name);
    const iCode = col("클럽코드"), iRegion = col("지역"), iName = col("클럽명"), iHours = col("영업시간"),
        iPhone = col("전화"), iAddr = col("주소"), iL = col("당구대_대대"), iM = col("당구대_중대"), iP = col("당구대_포켓"),
        iFlatL = col("정액_대대"), iFlatM = col("정액_중대"), iFlatP = col("정액_포켓"),
        iRateL = col("시간_대대"), iRateM = col("시간_중대"), iRateP = col("시간_포켓");
    // "요금안내" 자유텍스트 컬럼은 의도적으로 읽지 않는다 — 원문 전재 금지 정책

    let ok = 0, skippedForeign = 0, phoneDropped = 0;
    const values: any[] = [];
    for (const r of rows) {
        const region = (r[iRegion] || "").trim();
        if (!REGIONS.has(region)) { skippedForeign++; continue; } // 해외·이상 지역 제외
        const code = (r[iCode] || "").trim();
        const name = cleanName((r[iName] || "").trim());
        const address = (r[iAddr] || "").trim();
        // CODE_RE(listings.ts·prerender.ts)와 같은 형식만 — 어긋난 코드는 API 404 짜리 죽은 URL 이 된다
        if (!/^[A-Za-z0-9_-]{1,20}$/.test(code) || !name || !address) { skippedForeign++; continue; }

        let phone: string | null = (r[iPhone] || "").trim().replace(/\s+/g, "");
        if (!phone || phone.includes("*") || !PHONE_RE.test(phone)) {
            if (phone) phoneDropped++;
            phone = null;
        }
        const num = (v: string | undefined) => {
            const n = parseInt((v || "").trim(), 10);
            return Number.isFinite(n) && n > 0 && n < 100 ? n : null;
        };
        // "2,000원" → 2000. 100원 미만·10만원 초과는 오기로 보고 버린다
        const won = (v: string | undefined) => {
            const digits = (v || "").replace(/[^\d]/g, "");
            if (!digits) return null;
            const n = parseInt(digits, 10);
            return Number.isFinite(n) && n >= 100 && n <= 100_000 ? n : null;
        };
        values.push({
            code, name, region, address, phone,
            openHours: (r[iHours] || "").trim() || null,
            tableLarge: num(r[iL]), tableMedium: num(r[iM]), tablePocket: num(r[iP]),
            rate10Large: won(r[iRateL]), rate10Medium: won(r[iRateM]), rate10Pocket: won(r[iRateP]),
            flatLarge: won(r[iFlatL]), flatMedium: won(r[iFlatM]), flatPocket: won(r[iFlatP]),
        });
        ok++;
    }

    // 같은 청크에 중복 code 가 있으면 ON CONFLICT 가 "cannot affect row a second time" 으로 죽는다 — 뒤 행 우선 dedupe
    const byCode = new Map(values.map(v => [v.code, v]));
    if (byCode.size < values.length) console.warn(`중복 클럽코드 ${values.length - byCode.size}건 — 마지막 행 기준으로 병합`);
    const deduped = [...byCode.values()];

    for (let i = 0; i < deduped.length; i += 200) {
        await db.insert(storeListings).values(deduped.slice(i, i + 200))
            .onConflictDoUpdate({
                target: storeListings.code,
                set: {
                    name: sql`excluded.name`, region: sql`excluded.region`, address: sql`excluded.address`,
                    phone: sql`excluded.phone`, openHours: sql`excluded.open_hours`,
                    tableLarge: sql`excluded.table_large`, tableMedium: sql`excluded.table_medium`,
                    tablePocket: sql`excluded.table_pocket`,
                    rate10Large: sql`excluded.rate10_large`, rate10Medium: sql`excluded.rate10_medium`,
                    rate10Pocket: sql`excluded.rate10_pocket`,
                    flatLarge: sql`excluded.flat_large`, flatMedium: sql`excluded.flat_medium`,
                    flatPocket: sql`excluded.flat_pocket`, updatedAt: sql`now()`,
                },
            });
    }
    console.log(`임포트 ${deduped.length}건 | 해외·이상지역 제외 ${skippedForeign}건 | 전화 제외(마스킹·불량) ${phoneDropped}건`);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
