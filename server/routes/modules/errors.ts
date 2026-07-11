import { Router } from "express";
import { db } from "../../db.js";
import { errorLogs } from "../../../shared/schema.js";

const router = Router();

// --- 클라이언트 에러 수집기 ---
// POST /api/errors
// 인증: 없음 (익명 허용 — 클라이언트 window.onerror/unhandledrejection 에서 sendBeacon 으로 전송)
// 본문: { message: string(필수), stack?: string, url?: string }
router.post("/errors", async (req, res) => {
    try {
        const { message, stack, url } = req.body ?? {};
        if (!message || typeof message !== "string") {
            return res.status(400).json({ error: "message is required" });
        }

        // 폭주/오남용 대비 길이 제한
        await db.insert(errorLogs).values({
            message: message.slice(0, 500),
            stack: typeof stack === "string" ? stack.slice(0, 2000) : null,
            url: typeof url === "string" ? url.slice(0, 300) : null,
            userAgent: (req.headers["user-agent"] ?? "").toString().slice(0, 300) || null,
        });

        return res.status(204).end();
    } catch (error) {
        // 수집기 실패가 클라이언트 동작에 영향 주면 안 되므로 조용히 넘어감
        console.error("[ErrorCollector] 에러 저장 실패:", error);
        return res.status(204).end();
    }
});

export default router;
