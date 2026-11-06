/**
 * 테이블 QR 뽑기(2026-11-06 — shared/storeVenue). 사장님이 테이블마다 붙일 QR 한 장씩 — 인쇄하거나 캡처해서 쓴다.
 * QR 주소는 /store/<매장>?table=N — 손님이 찍으면 랭큐 점수판이 그 매장 · 테이블 경기로 열린다(앱을 깔았으면 앱에서).
 * 장 수는 적어 둔 대대 + 중대(없으면 6), 화면에서 바꿀 수 있다. 인쇄는 브라우저 인쇄(카드만 찍힌다 — print: 클래스).
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import { LucideArrowLeft } from "@/lib/icons";
import type { HiqStore } from "@shared/schema";
import { VENUE_MAX_TABLE, tableCountOf, tableQrPath } from "@shared/storeVenue";

export default function PartnerTableQr() {
    const [, setLocation] = useLocation();
    const { data: store, isLoading, isError } = useQuery<HiqStore>({ queryKey: ["/api/hiq/partner/store"], retry: false });
    const [count, setCount] = useState<number | null>(null);
    // 사장님 로그인이 풀렸으면 입구로(대시보드와 같다)
    useEffect(() => { if (isError) setLocation("/partner/login"); }, [isError, setLocation]);
    if (isLoading || !store) return <div className="min-h-screen bg-surface-0 flex items-center justify-center text-black/55">불러오는 중…</div>;
    const n = count ?? tableCountOf(store.tableLarge, store.tableMedium);
    const origin = typeof window !== "undefined" ? window.location.origin : "https://www.rankue.co.kr";

    return (
        <div className="min-h-screen bg-surface-0 pb-16 font-sans text-ink-1 print:bg-white print:pb-0">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-black/10 bg-surface-0 px-3 py-3 print:hidden">
                <button type="button" onClick={() => setLocation("/partner/dashboard")} aria-label="뒤로" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/[0.05]">
                    <LucideArrowLeft className="h-6 w-6" />
                </button>
                <h1 className="flex-1 text-[16px] font-bold">테이블 QR</h1>
                <button type="button" onClick={() => window.print()} className="h-10 rounded-xl bg-brand px-4 text-[14px] font-bold text-brand-fg">인쇄하기</button>
            </div>
            <div className="mx-auto max-w-[720px] px-4 pt-4 print:hidden">
                <p className="text-[13.5px] leading-relaxed text-black/60 break-keep">
                    테이블마다 한 장씩 붙여 주세요. 손님이 찍으면 랭큐 점수판이 <b className="text-ink-1">{store.name} · 그 테이블 경기</b>로 열려요.
                    친 경기는 대시보드의 '우리 매장에서 친 경기'와 매장 페이지의 '이달의 에버 왕'에 쌓여요. 처음 온 손님이 찍고 가입하면 우리 매장 회원이 돼요.
                </p>
                <label className="mt-3 flex items-center gap-2 text-[13.5px] font-semibold">
                    테이블 수
                    <input type="number" inputMode="numeric" min={1} max={VENUE_MAX_TABLE} value={n}
                        onChange={(e) => setCount(Math.max(1, Math.min(VENUE_MAX_TABLE, Number(e.target.value) || 1)))}
                        className="h-10 w-20 rounded-xl border border-black/10 bg-white px-3 text-center text-[15px] tabular-nums" />
                </label>
            </div>
            <div className="mx-auto mt-4 grid max-w-[720px] grid-cols-2 gap-3 px-4 print:mt-0 print:max-w-none print:grid-cols-2 print:gap-4 print:px-0" data-testid="table-qr-grid">
                {Array.from({ length: n }, (_, i) => i + 1).map((t) => (
                    <div key={t} className="flex flex-col items-center rounded-2xl border border-black/[0.08] bg-white p-4 text-center print:break-inside-avoid print:rounded-none">
                        <p className="text-[12px] font-bold text-brand">{store.name}</p>
                        <p className="mt-0.5 text-[22px] font-black tabular-nums">{t}번 테이블</p>
                        <div className="mt-2"><QRCodeSVG value={`${origin}${tableQrPath(store.slug, t)}`} size={148} level="M" includeMargin /></div>
                        <p className="mt-1.5 text-[12px] font-semibold text-black/60">찍으면 랭큐 점수판이 열려요</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
