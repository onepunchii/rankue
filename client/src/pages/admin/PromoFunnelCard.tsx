/**
 * 검색 유입 → 가입 깔때기(2026-09-27) — 매장·선수 페이지 '길 찾기' 배너. 최근 14일 단계별 사람 수(하루 유니크의 합).
 * 표(promo_events)가 아직 없으면 '미설정' — migrations/promo_events.sql 을 Neon 에서 돌리면 채워진다.
 */
import { useQuery } from "@tanstack/react-query";
import { PROMO_SRCS, PROMO_STEPS, type PromoSrc, type PromoStep } from "@shared/promoFunnel";

type Data = { ready: boolean; days: number; rows: { src: PromoSrc; step: PromoStep; n: number }[] };
const SRC_LABEL: Record<PromoSrc, string> = { store: "매장", pba: "PBA 선수", umb: "UMB 선수" };
const STEP_LABEL: Record<PromoStep, string> = { view: "배너 봄", click: "누름", use: "길 찾기", gate: "가입 안내", signup: "가입" };

export default function PromoFunnelCard() {
    const q = useQuery<Data>({ queryKey: ["/api/hiq/admin/promo-funnel"], refetchInterval: 5 * 60_000, staleTime: 60_000 });
    const d = q.data;
    const n = (src: PromoSrc | "all", step: PromoStep) =>
        (d?.rows ?? []).filter((r) => r.step === step && (src === "all" || r.src === src)).reduce((a, r) => a + Number(r.n), 0);
    const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
    return (
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
            <p className="text-[13px] font-bold text-black/60">검색 유입 → 가입 <span className="font-medium text-black/35">(길 찾기 배너 · 최근 14일)</span></p>
            {!d ? (
                <p className="mt-3 text-[13px] text-black/40">불러오는 중…</p>
            ) : !d.ready ? (
                <p className="mt-3 text-[13px] text-black/50">미설정 — migrations/promo_events.sql 을 Neon SQL 편집기에서 실행하면 집계가 시작돼요.</p>
            ) : (
                <table className="w-full mt-3 text-[12.5px] tabular-nums">
                    <thead>
                        <tr className="text-black/40">
                            <th className="text-left font-semibold pb-1.5">출처</th>
                            {PROMO_STEPS.map((s) => <th key={s} className="text-right font-semibold pb-1.5">{STEP_LABEL[s]}</th>)}
                            <th className="text-right font-semibold pb-1.5">가입률</th>
                        </tr>
                    </thead>
                    <tbody>
                        {([...PROMO_SRCS, "all"] as const).map((src) => (
                            <tr key={src} className={`border-t border-black/[0.05] ${src === "all" ? "font-bold" : ""}`}>
                                <td className="py-1.5 text-left">{src === "all" ? "합계" : SRC_LABEL[src]}</td>
                                {PROMO_STEPS.map((s) => <td key={s} className="py-1.5 text-right">{n(src, s).toLocaleString()}</td>)}
                                <td className="py-1.5 text-right text-brand">{pct(n(src, "signup"), n(src, "click"))}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <p className="mt-2 text-[11px] text-black/35">가입률 = 가입 ÷ 누름. 단계마다 하루 한 번(같은 기기)만 센다.</p>
        </div>
    );
}
