/**
 * 선물 도착(2026-10-16) — 어드민이 증정한 굿즈의 '받은 화면'(/gift/:id). 알림을 누르면 온다(GET /api/hiq/gifts/:id — 본인 것만).
 * 종목마다 그 굿즈가 사는 화면의 결: 당구 벨벳 · 골프 잔디 종이 · 등산 청록 · 낚시 한지(먹 그림은 곱하기). 빛살과 색종이는 동작 줄이기면 멈춘다.
 * '보러 가기'는 그 굿즈가 있는 곳(큐 케이스 · 골프 장식장 · 등산 도장첩 · 수족관).
 */
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useT } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import { caseItem, type CaseLocale } from "@shared/cueCase";
import type { GiftView, GoodsSport } from "@shared/goods";

const LOCALES: readonly CaseLocale[] = ["ko", "en", "es", "vi", "tr"];
const TONE: Readonly<Record<GoodsSport, { bg: string; card: string; ink: string; soft: string; accent: string; onAccent: string; blend?: boolean }>> = {
    billiards: { bg: "radial-gradient(circle at 50% 30%, #1d2b47, #070b14 75%)", card: "linear-gradient(160deg,#17233a,#0b1322)", ink: "#f4ead6", soft: "#f4ead6a6", accent: "#e8c46a", onAccent: "#2d1a08" },
    golf: { bg: "radial-gradient(circle at 50% 30%, #f4f8ee, #d9e6cb 80%)", card: "linear-gradient(160deg,#ffffff,#eef3e6)", ink: "#1d3a25", soft: "#1d3a25a6", accent: "#2f6b3a", onAccent: "#ffffff" },
    hiking: { bg: "radial-gradient(circle at 50% 30%, #eef6f4, #cfe2de 80%)", card: "linear-gradient(160deg,#ffffff,#e6f0ee)", ink: "#173f3c", soft: "#173f3ca6", accent: "#e07a5f", onAccent: "#ffffff" },
    fishing: { bg: "radial-gradient(circle at 50% 30%, #f6f0e2, #e3d6bd 80%)", card: "linear-gradient(160deg,#f6f0e2,#ece2cc)", ink: "#0f2838", soft: "#0f2838a6", accent: "#c8372d", onAccent: "#fff4ec", blend: true },
};

export default function GiftPage() {
    const { t, locale } = useT();
    const l: CaseLocale = (LOCALES as readonly string[]).includes(locale) ? (locale as CaseLocale) : "en";
    const { id } = useParams<{ id: string }>();
    const [, setLocation] = useLocation();
    const q = useQuery<GiftView>({ queryKey: ["/api/hiq/gifts", id], queryFn: () => apiRequest(`/api/hiq/gifts/${encodeURIComponent(id)}`), retry: false });
    const g = q.data;
    const tone = TONE[g?.sport ?? "billiards"];
    const name = g ? (g.sport === "billiards" ? caseItem(g.key)?.name[l] ?? g.name : g.name) : "";
    const bits = Array.from({ length: 22 }, (_, i) => i);
    const COLORS = [tone.accent, "#FFE14D", "#7CF2C8", "#8FB8FF", "#FF4FA3"];

    return (
        <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6" style={{ background: tone.bg, color: tone.ink, paddingTop: "env(safe-area-inset-top)", paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }} data-testid="gift-page" data-sport={g?.sport ?? ""}>
            {g && bits.map((i) => (
                <span key={i} aria-hidden className="cc-confetti pointer-events-none absolute top-[-4%] block h-3 w-2 rounded-[2px]"
                    style={{ left: `${(i * 41.3) % 100}%`, background: COLORS[i % COLORS.length], animationDelay: `${(i % 8) * 0.2}s`, animationDuration: `${2.6 + (i % 5) * 0.4}s` }} />
            ))}
            {q.isError ? (
                <div className="text-center" data-testid="gift-missing">
                    <p className="text-[17px] font-semibold">{t("gift.missing")}</p>
                    <button type="button" onClick={() => setLocation("/dashboard")} className="mt-5 h-12 rounded-full px-6 text-[15px] font-semibold" style={{ background: tone.accent, color: tone.onAccent }}>{t("gift.close")}</button>
                </div>
            ) : !g ? (
                <p className="text-[14px]" style={{ color: tone.soft }} role="status">…</p>
            ) : (
                <div className="relative w-full max-w-[380px] text-center">
                    <p className="text-[13px] font-semibold tracking-[0.06em]" style={{ color: tone.accent }}>{t("gift.from")}</p>
                    <h1 className="mt-1 text-[26px] font-bold tracking-tight">{t("gift.title")}</h1>
                    <div className="mt-6 rounded-[28px] px-5 pb-5 pt-5" style={{ background: tone.card, boxShadow: `0 18px 50px #00000040, 0 0 0 1.5px ${tone.accent}55` }}>
                        <div className="flex h-[170px] items-center justify-center">
                            {g.image
                                ? <img src={g.image} alt={name} draggable={false} className={g.shape === "cue" ? "cc-picked-cue w-full object-contain" : "cc-picked-cue max-h-[160px] max-w-full object-contain"} style={{ height: g.shape === "cue" ? 64 : undefined, mixBlendMode: tone.blend ? "multiply" : undefined }} />
                                : <span className="text-[22px] font-bold">{name}</span>}
                        </div>
                        <p className="mt-2 text-[20px] font-bold" data-testid="gift-name">{name}</p>
                        <p className="mt-0.5 text-[13px]" style={{ color: tone.soft }}>{g.groupName}</p>
                        {g.serial != null && (
                            <div className="mx-auto mt-3 w-fit rounded-md px-4 py-1" style={{ background: "linear-gradient(180deg, #f6dfa8, #d6a956 45%, #b0823a 60%, #e2bf78)", color: "#3a230f" }}>
                                <span className="rk-num text-[17px] font-bold">No.{String(g.serial).padStart(3, "0")}{g.limit ? <span className="text-[13px] opacity-70"> / {g.limit}</span> : null}</span>
                            </div>
                        )}
                        {g.message && <p className="mx-auto mt-4 max-w-[300px] rounded-2xl px-4 py-3 text-[14px] leading-relaxed break-keep" style={{ background: `${tone.accent}1f` }} data-testid="gift-message">{g.message}</p>}
                    </div>
                    <div className="mt-6 space-y-2">
                        <button type="button" onClick={() => setLocation(g.url)} className="h-12 w-full rounded-full text-[15px] font-bold" style={{ background: tone.accent, color: tone.onAccent }} data-testid="gift-open">{t("gift.open")}</button>
                        <button type="button" onClick={() => setLocation("/dashboard")} className="h-11 w-full rounded-full text-[14px] font-semibold" style={{ color: tone.soft }}>{t("gift.close")}</button>
                    </div>
                </div>
            )}
        </div>
    );
}
