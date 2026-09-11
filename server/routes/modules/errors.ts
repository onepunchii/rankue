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

// --- 시뮬레이터 조준 자가 복구 계측 (2026-09-11) ---
// POST /api/sim-telemetry
// 인증: 없음 (익명 허용 — 조준 먹통은 비로그인 연습에서도 난다). 클라이언트: client/src/sim/gestureTelemetry.ts
// 본문: { kind: "sim-gesture-recover", reason, platform, native, view, mode } — 전부 허용 목록 값만
//
// ★ 에러가 아니다. error_logs 에 넣으면 슈퍼 대시보드의 '에러 24h'·최근 에러 목록(super.ts)이 복구 건수로 부풀어
//   진짜 에러가 묻힌다. 그래서 같은 익명 라우터에 있되 저장소는 따로 쓴다.
// ★ 저장: 새 테이블을 만들지 않는다 — shared/schema.ts 에 선언 없이 DB 에만 만든 테이블은 drizzle push 가 지우자고 제안한다
//   (daily_visits 주석 참고). 허용 목록으로 걸러낸 값만 구조화 로그 한 줄로 남기고, Vercel 런타임 로그에서 "[sim-telemetry]" 로 찾는다.
//   몇 주치 집계가 필요해지면 스키마에 테이블을 선언한 뒤 이 console.info 를 insert 로 바꾼다.
// ★ 오남용: 허용 목록 밖이면 400. IP 당 10분 20건(인스턴스 메모리 기준 best-effort — 서버리스라 인스턴스마다 따로 센다).
//   클라이언트가 먼저 세션당 사유별 1건·총 5건으로 막는다. IP 는 세기에만 쓰고 로그에 남기지 않는다.
// 사유는 client/src/sim/tableGestures.ts 의 비정상 사유(isAbnormalReset)와 같아야 한다.
const SIM_REASONS = new Set(["lostcapture", "stale-pointerdown", "blur", "hidden", "pagehide"]);
const SIM_PLATFORMS = new Set(["ios", "android", "web"]);
const SIM_VIEWS = new Set(["top", "player"]);
const SIM_MODES = new Set(["practice", "online", "drill"]);
const SIM_WINDOW_MS = 10 * 60 * 1000;
const SIM_MAX_PER_WINDOW = 20;
const SIM_MAX_KEYS = 5000;
const simHits = new Map<string, { n: number; since: number }>();

function simTelemetryAllowed(key: string, now: number): boolean {
    const h = simHits.get(key);
    if (!h || now - h.since > SIM_WINDOW_MS) {
        // 메모리 상한 — 넘치면 통째로 비운다(정확한 집계가 목적이 아니라 폭주 차단이 목적)
        if (simHits.size >= SIM_MAX_KEYS) simHits.clear();
        simHits.set(key, { n: 1, since: now });
        return true;
    }
    h.n += 1;
    return h.n <= SIM_MAX_PER_WINDOW;
}

router.post("/sim-telemetry", (req, res) => {
    const b = req.body ?? {};
    if (b.kind !== "sim-gesture-recover" || !SIM_REASONS.has(b.reason) || !SIM_PLATFORMS.has(b.platform)
        || typeof b.native !== "boolean" || !SIM_VIEWS.has(b.view) || !SIM_MODES.has(b.mode)) {
        return res.status(400).json({ error: "invalid event" });
    }
    const fwd = (req.headers["x-forwarded-for"] ?? "").toString().split(",")[0].trim();
    if (simTelemetryAllowed(fwd || req.ip || "unknown", Date.now())) {
        console.info("[sim-telemetry]", JSON.stringify({
            kind: b.kind, reason: b.reason, platform: b.platform, native: b.native, view: b.view, mode: b.mode,
        }));
    }
    return res.status(204).end();
});

export default router;
