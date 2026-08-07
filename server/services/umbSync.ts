// UMB 랭킹 동기화 — 크론(매일)과 백필 스크립트가 공유하는 적재 로직.
// 아카이브에서 아직 저장 안 된 회차를 찾아 오래된 것부터 적재한다.
//
// maxPerCategory: 크론은 서버리스 실행시간 제한이 있어 한 번에 부문당 2개까지만.
// 밀린 회차가 있어도 며칠에 걸쳐 자연 복구된다. 백필은 Infinity로 전부.
import { fetchArchive, downloadPdf, parseRankingPdf, type ArchiveEntry } from "./umbService.js";
import { storage } from "../storage/index.js";

export interface SyncResult {
    checked: number;
    ingested: Array<{ category: string; edition: string; rows: number }>;
    errors: Array<{ category: string; edition: string; error: string }>;
    namesAdded?: number; // 이번 실행에서 새로 채워진 한글 이름 수
}

export async function syncUmbRankings(opts: { maxPerCategory?: number; delayMs?: number } = {}): Promise<SyncResult> {
    const maxPerCategory = opts.maxPerCategory ?? 2;
    const delayMs = opts.delayMs ?? 300;

    const entries = await fetchArchive();
    // 아카이브에는 항상 수십 회차가 있다 — 0건은 마크업 변경 등 스크래핑 실패다.
    // 조용히 성공 처리하면 랭킹 갱신이 무음으로 영구 동결되므로 명시적으로 실패시킨다.
    if (entries.length === 0) {
        throw new Error("UMB 아카이브 스크래핑 0건 — 사이트 마크업 변경 여부 확인 필요");
    }
    const result: SyncResult = { checked: entries.length, ingested: [], errors: [] };

    // 부문별로 최신 회차부터 — 옛 회차가 영구 실패(PDF 404·스캔본)해도 크론 슬롯을
    // 매일 선점해 새 주간 회차를 굶기는 일이 없도록 한다. (editionDate가 행마다 저장되므로
    // 적재 순서는 시계열 정확성과 무관하다)
    const byCategory = new Map<string, ArchiveEntry[]>();
    for (const e of entries) {
        if (!byCategory.has(e.category)) byCategory.set(e.category, []);
        byCategory.get(e.category)!.push(e);
    }

    let namesAdded = 0;
    for (const [, list] of byCategory) {
        list.sort((a, b) => b.editionDate.getTime() - a.editionDate.getTime());
        let done = 0;
        for (const entry of list) {
            if (done >= maxPerCategory) break;
            try {
                if (await storage.umb.hasEdition(entry.category, entry.edition)) continue;
                const pdf = await downloadPdf(entry.pdfUrl);
                const parsed = await parseRankingPdf(pdf);
                if (parsed.rows.length < 10) {
                    // 파싱이 사실상 실패한 PDF를 빈 회차로 저장하면 "최신 회차"를 오염시킨다
                    throw new Error(`파싱 행 수 비정상: ${parsed.rows.length}`);
                }
                const rows = await storage.umb.upsertEdition(entry, parsed);
                result.ingested.push({ category: entry.category, edition: entry.edition, rows });
                done++;
                if (delayMs) await new Promise(r => setTimeout(r, delayMs)); // 출처 서버 예의
            } catch (e: any) {
                result.errors.push({ category: entry.category, edition: entry.edition, error: e?.message || String(e) });
                done++; // 같은 회차에서 무한 재시도로 크론이 매일 막히지 않게 카운트에 포함
            }
        }
    }
    // 새 한국 선수의 한글 이름 채우기 (결정적 변환, 멱등)
    try {
        namesAdded = await storage.umb.fillMissingKoreanNames();
    } catch (e) { console.error("[umbSync] 한글 이름 채우기 실패:", e); }
    return { ...result, namesAdded };
}
