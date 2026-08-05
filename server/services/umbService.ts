// UMB(세계당구연맹) 공식 세계랭킹 수집기.
//
// 데이터 흐름: umb-carom.org/ranking/archive (Blazor 프리렌더 HTML)에서
// 부문·회차·날짜·PDF 링크를 긁고, PDF는 pdfjs-dist로 파싱한다.
// 파싱은 텍스트가 아니라 좌표 기반이다 — 대회별 점수 컬럼(A~M)이 희소해서
// 순서만으로는 어느 대회 점수인지 알 수 없고, 헤더 x좌표에 비닝해야 정확하다.
//
// 출처 표기 필수: 앱 화면에 "출처: UMB" + 원문 링크를 단다.

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const ARCHIVE_URL = "https://www.umb-carom.org/ranking/archive";
const BASE_URL = "https://www.umb-carom.org";
const UA = "RankueBot/1.0 (+https://www.rankue.co.kr; billiards app; contact: support@rankue.co.kr)";

export type UmbCategory = "players" | "ladies" | "juniors";

const CATEGORY_LABELS: Record<string, UmbCategory> = {
    WorldPlayers: "players",
    WorldLadies: "ladies",
    WorldJuniors: "juniors",
};

export interface ArchiveEntry {
    category: UmbCategory;
    edition: string;      // "21/2026"
    editionDate: Date;
    pdfUrl: string;
}

export interface ParsedRanking {
    rows: Array<{
        rank: number;
        playerName: string;
        fed: string;
        playerUmbId: string;
        points: number;
        penaltyPoints: number;
        eventPoints: Record<string, number>;
    }>;
    events: Array<{ colKey: string; label: string }>;
}

// --- 아카이브 스크래핑 ---

export async function fetchArchive(): Promise<ArchiveEntry[]> {
    const res = await fetch(ARCHIVE_URL, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`UMB archive fetch failed: ${res.status}`);
    const html = await res.text();

    // <a href="/uploads/rankings/x.pdf" ... title="2026-07-18">WorldPlayers - Edition 21/2026 (18.07.2026)</a>
    const entries: ArchiveEntry[] = [];
    const re = /href="(\/uploads\/rankings\/[^"]+\.pdf)"[^>]*title="(\d{4}-\d{2}-\d{2})"[^>]*>([^<]+)</g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const [, path, dateStr, label] = m;
        const labelMatch = label.match(/^(WorldPlayers|WorldLadies|WorldJuniors)\s*-\s*Edition\s+(\d{1,3}\/\d{4})/);
        if (!labelMatch) continue; // UMBEvents·NationalTeams 등은 1차 범위 밖
        entries.push({
            category: CATEGORY_LABELS[labelMatch[1]],
            edition: labelMatch[2],
            editionDate: new Date(`${dateStr}T00:00:00Z`),
            pdfUrl: `${BASE_URL}${path}`,
        });
    }
    return entries;
}

// --- PDF 파싱 (좌표 기반) ---

interface TextRow { y: number; items: Array<{ x: number; str: string }> }

async function extractRows(data: Uint8Array): Promise<TextRow[][]> {
    const doc = await getDocument({ data, useSystemFonts: true }).promise;
    const pages: TextRow[][] = [];
    try {
        for (let p = 1; p <= doc.numPages; p++) {
            const page = await doc.getPage(p);
            const tc = await page.getTextContent();
            const buckets = new Map<number, Array<{ x: number; str: string }>>();
            for (const item of tc.items as any[]) {
                const str = String(item.str || "");
                if (!str.trim()) continue;
                const y = Math.round(item.transform[5]);
                const x = item.transform[4];
                let key: number | null = null;
                for (const k of buckets.keys()) if (Math.abs(k - y) <= 2) { key = k; break; }
                if (key === null) { key = y; buckets.set(key, []); }
                buckets.get(key)!.push({ x, str });
            }
            pages.push(
                [...buckets.entries()]
                    .sort((a, b) => b[0] - a[0]) // 위에서 아래로
                    .map(([y, items]) => ({ y, items: items.sort((a, b) => a.x - b.x) }))
            );
        }
    } finally {
        await doc.destroy();
    }
    return pages;
}

export async function parseRankingPdf(buffer: ArrayBuffer): Promise<ParsedRanking> {
    const pages = await extractRows(new Uint8Array(buffer));

    const rows: ParsedRanking["rows"] = [];
    const events = new Map<string, string>();
    const seenIds = new Set<string>(); // (category,edition,playerUmbId) 유니크 제약 보호

    for (const page of pages) {
        // 이 페이지의 헤더 행에서 컬럼 x좌표를 잡는다 (페이지마다 반복됨)
        // 주니어 PDF는 "Rank."처럼 마침표가 붙는다 — startsWith로 잡는다
        const header = page.find(r =>
            r.items.some(i => i.str.startsWith("Rank")) && r.items.some(i => i.str === "Pnts"));
        let cols: Array<{ key: string; x: number }> = [];
        if (header) {
            cols = header.items
                .filter(i => /^([A-M]|PP)$/.test(i.str))
                .map(i => ({ key: i.str, x: i.x }));
        }

        for (const row of page) {
            const items = row.items;
            if (items.length < 2) continue;

            // 레전드 행: "A UMB World Championship - ... 2025-07-05 *** 80 54 ..." (첫 페이지)
            if (/^[A-M]$/.test(items[0].str) && items.length >= 2 && items[0].x < 60) {
                // 뒤쪽 점수표를 토큰 단위로 제거 — 문자 단위로 지우면 날짜의 일(日)까지
                // 먹혀 "2025-07-"처럼 잘린다. 하이픈 포함 날짜 토큰은 순수 숫자가 아니라 살아남는다.
                const tokens = items.slice(1).map(i => i.str.trim()).filter(Boolean);
                while (tokens.length && /^(\*{1,3}|-?\d{1,3})$/.test(tokens[tokens.length - 1])) tokens.pop();
                const label = tokens.join(" ").trim();
                if (label.length > 3 && !events.has(items[0].str)) events.set(items[0].str, label);
                continue;
            }

            // 선수 행: rank(숫자) name fed(2대문자) id(4자리) pnts [컬럼별 점수...]
            if (!/^\d{1,4}$/.test(items[0].str)) continue;
            const fedIdx = items.findIndex((i, idx) => idx >= 1 && /^[A-Z]{2}$/.test(i.str.trim()) && items[idx + 1] && /^\d{4}$/.test(items[idx + 1].str.trim()));
            if (fedIdx < 1) continue;
            const name = items.slice(1, fedIdx).map(i => i.str).join(" ").trim();
            if (!name) continue;
            const fed = items[fedIdx].str.trim();
            const umbId = items[fedIdx + 1].str.trim();
            // 주니어 PDF는 Player ID와 Pnts 사이에 생년월일(DOB, "24.08.2005") 컬럼이 있다
            let pntsIdx = fedIdx + 2;
            if (items[pntsIdx] && /^\d{2}\.\d{2}\.\d{4}$/.test(items[pntsIdx].str.trim())) pntsIdx++;
            const pntsItem = items[pntsIdx];
            if (!pntsItem || !/^-?\d+$/.test(pntsItem.str.trim())) continue;
            if (seenIds.has(umbId)) continue; // 드물게 PDF에 중복 표기되는 행 방지

            const eventPoints: Record<string, number> = {};
            let penaltyPoints = 0;
            for (const it of items.slice(pntsIdx + 1)) {
                const v = Number(it.str.trim());
                if (!Number.isFinite(v)) continue;
                // 가장 가까운 컬럼 헤더에 비닝 (허용 오차 10px)
                let best: { key: string; d: number } | null = null;
                for (const c of cols) {
                    const d = Math.abs(c.x - it.x);
                    if (!best || d < best.d) best = { key: c.key, d };
                }
                if (!best || best.d > 10) continue;
                if (best.key === "PP") penaltyPoints = v;
                else eventPoints[best.key] = (eventPoints[best.key] ?? 0) + v;
            }

            seenIds.add(umbId);
            rows.push({
                rank: Number(items[0].str),
                playerName: name,
                fed,
                playerUmbId: umbId,
                points: Number(pntsItem.str),
                penaltyPoints,
                eventPoints,
            });
        }
    }

    return {
        rows,
        events: [...events.entries()].map(([colKey, label]) => ({ colKey, label })),
    };
}

export async function downloadPdf(url: string): Promise<ArrayBuffer> {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`UMB pdf fetch failed: ${res.status} ${url}`);
    return res.arrayBuffer();
}
