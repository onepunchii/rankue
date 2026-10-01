/**
 * 친구·크루 접속 배너(2026-10-01 오너: "내가 앱에 있을 때 크루 멤버나 친구가 들어오면 누가 들어왔다고" → 제안 "응 진행해").
 *
 * 앱을 보고 있을 때만 45초마다 '내 사람들' 중 새로 들어온 사람을 묻는다(화면이 뒤로 가면 묻지 않는다 — 폰을 울리는 푸시는 없다).
 * 위에 한 줄 카드: "🟢 김민수님이 방금 들어왔어요 · 친구 · 당구" + 바로 할 일 단추 —
 *   당구 친구 '같이 한 판'(1:1 방을 열고 온라인 대전 초대 카드를 보낸다), 골프 친구 '1:1 채팅', 크루원 '크루 채팅'.
 * 같은 사람은 6시간에 한 번, 앱을 한 번 여는 동안 3명까지(shared/presence). 9초 뒤 저절로 닫힌다.
 * 테마와 무관한 어두운 고정 카드(리터럴 색) — 당구·골프 어느 화면 위에서도 같은 모습. 종목은 작은 색 점으로 가른다.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { LucideX } from "@/lib/icons";
import {
    PRESENCE_BANNER_MS, PRESENCE_POLL_MS, arrivalAction, pickArrivalsToShow, type PresenceArrival,
} from "@shared/presence";

const SEEN_KEY = "rankue_presence_seen";
const COUNT_KEY = "rankue_presence_shown";
const ACCENT = { BILLIARDS: "#1FA374", GOLF: "#64DD17" } as const;
/** 로그인·가입·콘솔·경기 진행 화면에는 띄우지 않는다 — 점수판·대전 중에 위를 가리면 안 된다 */
const QUIET_PATHS = /^\/(admin|partner|register|game\/|golf\/game\/|online-game|sim)/;

const readSeen = (): Record<string, number> => {
    try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
};
const readCount = (): number => { try { return Number(sessionStorage.getItem(COUNT_KEY) || 0) || 0; } catch { return 0; } };

export function PresenceArrivals() {
    const { member } = useAuth();
    const { t } = useT();
    const { toast } = useToast();
    const qc = useQueryClient();
    const [location, setLocation] = useLocation();
    const sinceRef = useRef<string | null>(null);
    const [queue, setQueue] = useState<PresenceArrival[]>([]);
    const [busy, setBusy] = useState(false);

    const { data } = useQuery<{ now: string; arrivals: PresenceArrival[] }>({
        queryKey: ["/api/hiq/presence/arrivals", member?.id ?? ""],
        queryFn: async () => apiRequest(`/api/hiq/presence/arrivals${sinceRef.current ? `?since=${encodeURIComponent(sinceRef.current)}` : ""}`),
        enabled: !!member,
        refetchInterval: PRESENCE_POLL_MS,
        refetchIntervalInBackground: false,
        staleTime: 0,
        gcTime: 0,
        retry: false,
    });

    useEffect(() => {
        if (!data?.now) return;
        sinceRef.current = data.now;
        const list = Array.isArray(data.arrivals) ? data.arrivals : [];
        if (!list.length) return;
        const seen = readSeen();
        const picked = pickArrivalsToShow(list, seen, readCount(), Date.now());
        if (!picked.length) return;
        const now = Date.now();
        for (const a of picked) seen[a.id] = now;
        try {
            localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
            sessionStorage.setItem(COUNT_KEY, String(readCount() + picked.length));
        } catch { /* 저장소를 못 쓰면 이번만 띄운다 */ }
        setQueue((q) => [...q, ...picked]);
    }, [data]);

    const cur = queue[0];
    const dismiss = () => setQueue((q) => q.slice(1));
    useEffect(() => {
        if (!cur) return;
        const timer = setTimeout(dismiss, PRESENCE_BANNER_MS);
        return () => clearTimeout(timer);
    }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!member || !cur || QUIET_PATHS.test(location)) return null;
    const action = arrivalAction(cur);
    const label = action === "sim-invite" ? t("presence.actionSimInvite") : action === "dm" ? t("presence.actionDm") : t("presence.actionCrew");
    const accent = ACCENT[cur.sport];
    const who = cur.relation === "friend" ? t("presence.friend") : t("presence.crew").replace("{crew}", cur.crewName ?? "");

    const act = async () => {
        if (busy) return;
        setBusy(true);
        try {
            if (action === "crew-chat" && cur.crewId) {
                setLocation(`/chat/crew/${cur.crewId}`);
            } else {
                const r = await apiRequest("/api/hiq/chat/dm", { method: "POST", body: { memberIds: [cur.id], sport: cur.sport } }) as { key: string };
                if (action === "sim-invite") {
                    await apiRequest(`/api/hiq/chat/rooms/${r.key}/cards/sim-invite`, { method: "POST", body: {} });
                    toast({ title: t("presence.inviteSent").replace("{name}", cur.name) });
                }
                void qc.invalidateQueries({ queryKey: ["/api/hiq/chat/rooms"] });
                const [kind, id] = r.key.split(":");
                setLocation(`/chat/${kind}/${id}`);
            }
            dismiss();
        } catch (e: any) {
            toast({ title: e?.message || t("presence.actionFailed"), variant: "destructive" });
        } finally {
            setBusy(false);
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                key={cur.id}
                initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -80, opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="fixed inset-x-3 z-[880] mx-auto max-w-md"
                style={{ top: "calc(env(safe-area-inset-top) + 10px)" }}
                role="status" aria-live="polite"
            >
                <div className="flex items-center gap-3 rounded-2xl bg-[#1C1F1D] px-3.5 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.35)] ring-1 ring-[#FFFFFF14]">
                    <span className="relative shrink-0">
                        {cur.avatar
                            ? <img src={cur.avatar} alt="" className="w-10 h-10 rounded-full object-cover bg-[#2A2E2B]" />
                            : <span className="w-10 h-10 rounded-full bg-[#2A2E2B] flex items-center justify-center text-[15px] font-bold text-[#ffffff]">{cur.name.slice(0, 1)}</span>}
                        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#34C759] ring-2 ring-[#1C1F1D]" aria-hidden />
                    </span>
                    <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-semibold text-[#ffffff] truncate">{t("presence.arrived").replace("{name}", cur.name)}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[#FFFFFF99] truncate">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: accent }} aria-hidden />
                            {who} · {cur.sport === "GOLF" ? t("presence.golf") : t("presence.billiards")}
                        </span>
                    </span>
                    <button
                        type="button" onClick={() => void act()} disabled={busy}
                        className="shrink-0 h-9 px-3.5 rounded-full text-[13px] font-bold disabled:opacity-60 active:scale-[0.97]"
                        style={{ backgroundColor: accent, color: cur.sport === "GOLF" ? "#0B1A03" : "#ffffff" }}
                    >
                        {label}
                    </button>
                    <button type="button" onClick={dismiss} aria-label={t("presence.close")} className="shrink-0 w-7 h-7 -mr-1 rounded-full flex items-center justify-center text-[#FFFFFF80] active:bg-[#FFFFFF14]">
                        <LucideX weight="bold" className="w-4 h-4" />
                    </button>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
