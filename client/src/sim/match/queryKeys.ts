/** 대전 목록 쿼리 키. 대시보드 배너와 로비 목록이 같은 캐시를 쓴다(엔진을 끌어오지 않도록 작은 모듈로 분리). */
export const MATCH_LIST_QUERY_KEY = ["sim-matches"] as const;
export const MATCH_LIST_REFETCH_MS = 10_000;
