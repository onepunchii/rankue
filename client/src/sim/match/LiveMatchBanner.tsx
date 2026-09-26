/**
 * 앱 어디서나 뜨는 "대전 호출" 띠(2026-09-26 오너: "방은 나가고 앱에는 있는데 알림이 안 왔다고 한다").
 *
 * 방을 열어 두고 다른 화면(홈·크루·랭킹)에 가 있던 방장은 상대가 들어와도 몰랐다 — 푸시는 기기·앱 버전·알림 설정에 따라
 * 앱을 보는 중에는 안 보이기도 한다. 그래서 푸시와 **따로** 앱 안에서 직접 알린다:
 *  - 내 대전 목록(GET /sim/matches)을 본다. 살아 있는 대전(대기 방·진행 중)이 있을 때만 10초마다 다시 본다 — 없으면 한 번만.
 *  - 진행 중이고 **내 차례**인 대전이 있으면 화면 위에 띠를 띄운다: 첫 샷이면 "○○님이 들어왔어요 · 대전 시작",
 *    아니면 "당신 차례예요". 시계가 돌고 있으면 남은 초를 보여 준다(자리 비움 유예 → 40초 → 시간 초과).
 *  - 대전 판을 보고 있을 때는 띄우지 않는다 — 그 화면이 스스로 보여 준다. 같은 주소(/online-game)의 로비·대시보드에서는 띄운다.
 *  - '나중에'를 누르면 그 차례(버전) 동안은 다시 띄우지 않는다. 차례가 바뀌면 다시 뜬다.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import { pickCallMatch, secondsLeft, parseCallRows, CALL_CLOCK_S, subscribeActiveMatchScreen, getActiveMatchScreen } from "./liveMatchCall";

const LIVE_POLL_MS = 10_000;

export function LiveMatchBanner() {
    const { t } = useT();
    const { member } = useAuth();
    const [location, navigate] = useLocation();
    const onGamePage = location.startsWith("/online-game");
    // 판을 보고 있는 대전(SimulatorPage 가 적는다) — 그 대전의 띠는 안 띄운다. 로비·대시보드에서는 띄운다.
    const screenMatch = useSyncExternalStore(subscribeActiveMatchScreen, getActiveMatchScreen, () => null);
    // 게임 화면 코드(matchApi·규칙 엔진)를 앱 첫 번들에 끌어오지 않으려고 목록을 직접 가볍게 읽는다(따로 된 키).
    const q = useQuery({
        queryKey: ["sim-call"],
        queryFn: async () => parseCallRows(await apiRequest("/api/hiq/sim/matches")),
        enabled: !!member,
        staleTime: 5_000,
        refetchOnWindowFocus: true,   // 앱으로 돌아오면 바로 확인(전역 기본값은 false)
        // 살아 있는 대전(대기·진행)이 있을 때만 주기적으로 — 대부분의 회원은 첫 한 번으로 끝난다
        refetchInterval: (query) => ((query.state.data ?? []).some((m) => m.status === "waiting" || m.status === "playing") ? LIVE_POLL_MS : false),
    });
    // 게임 화면에서 나오는 순간 다시 본다 — 거기서 방을 열었으면 첫 조회(방이 없던 때) 결과로는 주기 조회가 안 켜진다.
    const wasOnGame = useRef(onGamePage);
    useEffect(() => {
        if (wasOnGame.current && !onGamePage && member) void q.refetch();
        wasOnGame.current = onGamePage;
    }, [onGamePage, member, q]);
    const call = useMemo(() => (q.data ? pickCallMatch(q.data) : null), [q.data]);
    const [dismissed, setDismissed] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const key = call ? `${call.id}:${call.version}` : null;
    const visible = !!call && call.id !== screenMatch && !(onGamePage && screenMatch !== null) && dismissed !== key;
    useEffect(() => {
        if (!visible) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [visible]);
    if (!visible || !call) return null;

    const left = secondsLeft(call, now, q.dataUpdatedAt || now);
    const first = call.shots === 0 && call.myIndex === 0;
    const name = call.opponentName;
    const title = first ? t("sim.call.started").replace("{name}", name) : t("sim.call.yourTurn");
    const sub = left === null ? t("sim.call.sub") : left > CALL_CLOCK_S ? t("sim.call.clockIn").replace("{n}", String(left - CALL_CLOCK_S)) : t("sim.call.left").replace("{n}", String(left));

    return (
        <div
            role="alert"
            className="fixed left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-24px)] max-w-[424px] rounded-card bg-surface-1 border border-surface-line-strong rk-shadow px-4 py-3 flex items-center gap-3"
            style={{ top: "calc(env(safe-area-inset-top) + 8px)" }}
        >
            <span className="relative flex w-2.5 h-2.5 shrink-0" aria-hidden="true">
                <span className="absolute inset-0 rounded-full bg-brand animate-ping opacity-60" />
                <span className="relative w-2.5 h-2.5 rounded-full bg-brand" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink-1 leading-snug line-clamp-2">{title}</span>
                <span className="block text-[12px] font-medium text-ink-3 truncate rk-num">{sub}</span>
            </span>
            <button
                type="button" onClick={() => setDismissed(key)}
                className="h-11 px-2 shrink-0 text-[13px] font-semibold text-ink-3"
            >
                {t("sim.call.later")}
            </button>
            <button
                type="button" onClick={() => navigate(`/online-game?match=${call.id}`)}
                className="h-11 px-4 shrink-0 rounded-pill bg-brand text-brand-fg text-[14px] font-semibold"
            >
                {t("sim.call.enter")}
            </button>
        </div>
    );
}

export default LiveMatchBanner;
