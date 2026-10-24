/**
 * '랭큐 굿즈 곧 나와요'(2026-10-24 오너: "이 그림 우리 굿즈로 · 나중에 굿즈샵 실물 판매" → "추천대로 순서대로").
 * 큐 케이스 맨 아래 — 마스코트 흉상(운동화 위에서 자른 것) + 품목 고르기 + '출시 알림 받기'. 실물을 무엇부터 만들지 세는 자리다.
 * 품목 shared/goodsShop · 저장 GET /goods-shop/me · POST /goods-shop/interest. 비회원은 단추가 가입 안내를 연다.
 * 가죽 뚜껑의 패치(cue-case.tsx)를 누르면 여기로 내려온다(id cc-goods).
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { GOODS_SHOP_ITEMS, SHOP_WAITING_SHOWN_FROM, cleanShopItems, type GoodsShopLocale } from "@shared/goodsShop";

const KEY = ["/api/hiq/goods-shop/me"] as const;
export const GOODS_TEASER_ID = "cc-goods";
export const MASCOT_BUST_SRC = "/billiards/goods/mascot-bust.webp";

export function GoodsTeaser({ l, signedIn, onGuest }: { l: GoodsShopLocale; signedIn: boolean; onGuest: () => void }) {
    const { t } = useT();
    const qc = useQueryClient();
    const q = useQuery<{ items: string[]; total: number }>({ queryKey: KEY, enabled: signedIn, staleTime: 60_000, retry: false });
    const saved = useMemo(() => cleanShopItems(q.data?.items ?? []) ?? [], [q.data]);
    const [pick, setPick] = useState<string[]>([]);
    useEffect(() => { setPick(saved); }, [saved]);
    const dirty = pick.join(",") !== saved.join(",");
    const save = useMutation({
        mutationFn: (items: string[]) => apiRequest("/api/hiq/goods-shop/interest", { method: "POST", body: { items } }),
        onSuccess: (r: any) => { qc.setQueryData(KEY, { items: cleanShopItems(r?.items) ?? [], total: Number(r?.total ?? 0) }); },
    });
    const toggle = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : GOODS_SHOP_ITEMS.map((x) => x.id).filter((x) => x === id || p.includes(x))));
    const onNotify = () => {
        if (!signedIn) return onGuest();
        if (!pick.length || save.isPending) return;
        save.mutate(pick);
    };
    const total = q.data?.total ?? 0;
    return (
        <section id={GOODS_TEASER_ID} className="cc-goods mt-8 overflow-hidden rounded-[24px]" aria-label={t("shop.title")} data-testid="cue-case-goods">
            <div className="flex items-end gap-1 pl-4 pt-4">
                <div className="min-w-0 flex-1 pb-4">
                    <p className="text-[11px] font-bold tracking-[0.22em] text-[color:var(--cc-gold)]">RANKUE GOODS</p>
                    <h2 className="mt-1 text-[18px] font-bold leading-snug tracking-tight text-white break-keep">{t("shop.title")}</h2>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-white/60 break-keep">{t("shop.desc")}</p>
                    {total >= SHOP_WAITING_SHOWN_FROM && <p className="rk-num mt-1.5 text-[12px] font-semibold text-[color:var(--cc-gold)]/90">{t("shop.waiting").replace("{n}", String(total))}</p>}
                </div>
                <img src={MASCOT_BUST_SRC} alt="" width={140} height={126} decoding="async" loading="lazy" draggable={false} className="-mr-1 w-[140px] shrink-0 select-none" />
            </div>
            <div className="px-4 pb-4">
                <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={t("shop.title")}>
                    {GOODS_SHOP_ITEMS.map((x) => {
                        const on = pick.includes(x.id);
                        return (
                            <button key={x.id} type="button" aria-pressed={on} onClick={() => toggle(x.id)} data-testid={`shop-item-${x.id}`}
                                className={cn("h-10 truncate rounded-full border px-2 text-[12.5px] font-semibold transition-colors", on ? "border-[color:var(--cc-gold)] bg-[rgba(232,196,106,0.15)] text-[color:var(--cc-gold)]" : "border-white/12 text-white/75 active:bg-white/10")}>
                                {x.name[l]}
                            </button>
                        );
                    })}
                </div>
                {saved.length > 0 && !dirty ? (
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-[rgba(232,196,106,0.1)] px-3.5 py-2.5" data-testid="shop-saved">
                        <p className="text-[12.5px] font-semibold leading-snug text-[color:var(--cc-gold)] break-keep">{t("shop.saved")}</p>
                        <button type="button" onClick={() => save.mutate([])} disabled={save.isPending} className="shrink-0 text-[12px] font-semibold text-white/55 underline underline-offset-2 disabled:opacity-50">{t("shop.cancel")}</button>
                    </div>
                ) : (
                    <button type="button" onClick={onNotify} disabled={(signedIn && !pick.length) || save.isPending} data-testid="shop-notify"
                        className="mt-3 h-12 w-full rounded-full bg-[color:var(--cc-gold)] text-[14px] font-semibold text-[#2d1a08] active:opacity-90 disabled:opacity-50">
                        {signedIn && !pick.length ? t("shop.pickOne") : saved.length ? t("shop.update") : t("shop.notify")}
                    </button>
                )}
                {save.isError && <p className="mt-2 text-center text-[12px] text-red-300">{t("shop.failed")}</p>}
            </div>
        </section>
    );
}
