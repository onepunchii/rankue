/**
 * 매장 디렉토리(store_listings)를 읽을 때 같이 쓰는 SQL 조각(2026-10-19 — 인허가 자료 15,191곳을 잇으며).
 *  LAT · LNG   인허가 좌표가 있으면 그것(건물 번지와 견줘 중앙 7m), 없으면 있던 좌표(Nominatim — 동 · 구 수준으로 떨어진 것 포함)
 *  BASIC       인허가 자료로만 들어온 얇은 매장(shared/storeMeta isBasicListing 와 같은 뜻) — 목록에서 뒤로, 색인에서 뺀다
 *  LIVE        보여 줄 매장 — 인허가 자료로만 들어왔는데 폐업 · 말소된 곳은 숨긴다(수집 · 등록으로 들어온 곳은 그대로)
 */
import { sql } from "drizzle-orm";

export const LISTING_LAT = sql<number | null>`coalesce(store_listings.gov_lat, store_listings.latitude)`;
export const LISTING_LNG = sql<number | null>`coalesce(store_listings.gov_lng, store_listings.longitude)`;
export const LISTING_BASIC = sql<boolean>`(store_listings.source = 'gov' and not store_listings.claimed
    and coalesce(store_listings.open_hours, '') = ''
    and coalesce(store_listings.table_large, 0) + coalesce(store_listings.table_medium, 0) + coalesce(store_listings.table_pocket, 0) = 0
    and store_listings.rate10_large is null and store_listings.rate10_medium is null and store_listings.rate10_pocket is null)`;
export const LISTING_LIVE = sql<boolean>`not (store_listings.source = 'gov' and coalesce(store_listings.gov_status, 'open') = 'closed')`;
