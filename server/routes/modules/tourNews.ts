/**
 * 투어 소식(2026-10-05) — /api/hiq/tour-news/:topic. 공개 읽기 전용.
 * 네이버 뉴스 검색을 그 자리에서 불러 그대로 돌려준다(shared/tourNews 머리말): 저장·캐싱·가공 없이, no-store.
 * 검색어는 주제표(TOUR_NEWS)에 있는 것만 — 아무 말이나 받아 주면 남의 검색 대리가 된다.
 */
import { Router } from "express";
import { sendError, sendSuccess } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { isTourNewsTopic } from "../../../shared/tourNews.js";

const router = Router();

/** 하루 한도(25,000회)를 한 사람이 태우지 못하게 — 인스턴스 안에서 IP 당 1분 30회(서버리스라 느슨한 막이다) */
const hits = new Map<string, { n: number; until: number }>();
function allow(ip: string, now = Date.now()): boolean {
    if (hits.size > 5000) hits.clear();
    const h = hits.get(ip);
    if (!h || h.until < now) { hits.set(ip, { n: 1, until: now + 60_000 }); return true; }
    return ++h.n <= 30;
}

router.get("/:topic", asyncHandler(async (req: any, res: any) => {
    const topic = req.params.topic;
    res.set("Cache-Control", "no-store");
    if (!isTourNewsTopic(topic)) return sendError(res, 404, "없는 주제예요");
    if (!allow(String(req.ip ?? ""))) return sendError(res, 429, "잠시 뒤에 다시 시도해 주세요");
    const { searchTourNews } = await import("../../services/naverNews.js");
    const r = await searchTourNews(topic);
    if (!r.ok) return sendError(res, r.reason === "nokey" ? 501 : r.reason === "quota" ? 429 : 502, "지금은 불러올 수 없어요", `NEWS_${r.reason.toUpperCase()}`);
    return sendSuccess(res, { query: r.query, items: r.items });
}));

export default router;
