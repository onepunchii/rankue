/**
 * 당구대 로고 · 광고를 묻는 곳(2026-10-24) — GET /api/hiq/sim/table-brand(로그인 없이 · CDN 5분). 게임 · 관전이 같이 쓴다.
 * 한 번 물은 답은 5분 둔다. 실패하면 다음에 다시 묻고(실패한 promise 를 붙잡아 두지 않는다) 로고 없이 간다.
 * '@/' 별칭을 쓰지 않는다 — 관전 화면 시험(vitest)이 이 파일까지 불러온다.
 */
import { useEffect, useState } from "react";
import { parseBrands, type BrandTableId, type TableBrandView } from "@shared/tableBrand";

type Brands = Record<BrandTableId, TableBrandView | null>;
const NONE: Brands = { DAEDAE: null, JUNGDAE_KR: null };
const KEEP_MS = 5 * 60_000;
let pending: Promise<Brands> | null = null;
let at = 0;

export function fetchTableBrands(): Promise<Brands> {
    if (typeof fetch !== "function") return Promise.resolve(NONE);
    if (!pending || Date.now() - at > KEEP_MS) {
        at = Date.now();
        pending = fetch("/api/hiq/sim/table-brand", { credentials: "omit" })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then((j) => parseBrands(j?.data))
            .catch(() => { pending = null; return NONE; });
    }
    return pending;
}

/** 이 테이블에 지금 걸 로고(없으면 null) */
export function useTableBrand(tableId: string | null | undefined): TableBrandView | null {
    const [brands, setBrands] = useState<Brands>(NONE);
    useEffect(() => {
        let alive = true;
        void fetchTableBrands().then((b) => { if (alive) setBrands(b); });
        return () => { alive = false; };
    }, []);
    return tableId === "DAEDAE" || tableId === "JUNGDAE_KR" ? brands[tableId] : null;
}
