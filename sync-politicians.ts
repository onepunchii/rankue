
import 'dotenv/config';
import axios from 'axios';
import { db } from "./server/db";
import { politicians } from "./shared/schema";
import { eq } from "drizzle-orm";

const KEY = '54424d7984cf4edd93b711fb868e22df';
// 국회의원 인적사항
const SERVICE_ID = 'nwvrqwxyaytdsfvhu';

async function syncPoliticians() {
    console.log("🏛️ [Sync] 국회의원 실데이터 동기화 (22대)...");

    try {
        // 1. Fetch from API (Get all 300)
        const url = `https://open.assembly.go.kr/portal/openapi/${SERVICE_ID}?KEY=${KEY}&Type=json&pIndex=1&pSize=500&AGE=22`;
        const res = await axios.get(url);

        if (!res.data[SERVICE_ID]) {
            throw new Error(`API Error: ${JSON.stringify(res.data)}`);
        }

        const rows = res.data[SERVICE_ID][1].row;
        console.log(`📡 API Fetch Success: ${rows.length} members found.`);

        // 2. Clear existing mock data
        await db.delete(politicians);
        console.log("🧹 기존 가짜 데이터 삭제 완료.");

        // 3. Transform and Insert
        // Map fields
        // HG_NM: 이름, POLY_NM: 정당, ORIG_NM: 지역구, REELE_GBN_NM: 선수, SEX_GBN_NM: 성별, CMIT_NM: 위원회
        const memberList = rows.map((r: any) => ({
            name: r.HG_NM,
            nameHanja: r.HJ_NM || null,
            nameEng: r.ENG_NM || null,
            party: r.POLY_NM,
            constituency: r.ORIG_NM,
            gender: r.SEX_GBN_NM || '알수없음', // Sometimes missing
            reelectionStatus: r.REELE_GBN_NM || '초선',
            mainCommittee: r.CMIT_NM || null,
            type: "국회의원",
            status: "재직",
            // Initial Scores (Will be updated by Bill Sync later)
            activityScore: 50,
            billsProposed: 0,
            attendanceRate: "0",
        })).filter(m => m.name); // Filter empty

        // Insert in chunks or all
        await db.insert(politicians).values(memberList);
        console.log(`✅ [Success] 국회의원 ${memberList.length}명 DB 등록 완료!`);

    } catch (e) {
        console.error("❌ Sync Failed:", e);
    } finally {
        process.exit();
    }
}

syncPoliticians();
