/**
 * 채팅 + → "매장" 고르기(2026-09-23). 크루 베이스캠프 선택과 같은 통합 검색(GET /crews/store-search?q=)을 쓴다 —
 * 파트너 매장 + 디렉토리 1,195곳. 2자 이상부터, 300ms 디바운스(한 글자마다 서버를 두드리지 않게).
 * 파트너 줄은 slug 가 없어 id 를 slug 자리에 넘긴다 — 서버 카드 라우트는 slug 또는 id 둘 다로 public-stores 를 찾는다(계약).
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LucideLoader2, LucideMapPin, LucideSearch } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { useT } from "@/lib/i18n";

export interface StorePick { code?: string; slug?: string; name: string }
type Hit = { type: "partner"; id: string; slug?: string; name: string; address: string } | { type: "listing"; code: string; name: string; address: string | null; region: string | null };

export function StorePicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (pick: StorePick) => void }) {
    const { t } = useT();
    const [q, setQ] = useState("");
    const [debounced, setDebounced] = useState("");
    useEffect(() => { const id = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(id); }, [q]);
    useEffect(() => { if (!open) { setQ(""); setDebounced(""); } }, [open]);
    const ready = debounced.length >= 2;
    const search = useQuery<Hit[]>({
        queryKey: ["/api/hiq/crews/store-search", { q: debounced }],
        queryFn: () => apiRequest(`/api/hiq/crews/store-search?q=${encodeURIComponent(debounced)}`),
        enabled: open && ready,
        staleTime: 60_000,
    });
    const pick = (h: Hit) => {
        onPick(h.type === "listing" ? { code: h.code, name: h.name } : { slug: h.slug || h.id, name: h.name });
        onOpenChange(false);
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            {/* 검색칸에 키보드가 뜨면 시트가 밀리지 않게 높이를 고정하고 안쪽만 스크롤한다 */}
            <SheetContent side="bottom" hideClose className="bg-surface-0 text-ink-1 border-surface-line rounded-t-2xl p-0 h-[82dvh] flex flex-col">
                <SheetHeader className="px-5 pt-5 pb-2 text-left shrink-0">
                    <SheetTitle className="text-[17px] font-semibold text-ink-1">{t("chat.attach.store.title")}</SheetTitle>
                    <SheetDescription className="text-[12.5px] text-ink-3">{t("chat.attach.store.desc")}</SheetDescription>
                </SheetHeader>
                <div className="px-4 py-2 shrink-0">
                    <label className="flex items-center gap-2 h-10 px-3.5 rounded-xl bg-surface-2">
                        <LucideSearch className="w-4 h-4 text-ink-4 shrink-0" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("chat.attach.store.searchPlaceholder")} autoComplete="off" className="flex-1 min-w-0 bg-transparent text-[14px] text-ink-1 placeholder:text-ink-4 outline-none" />
                    </label>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                    {!ready ? (
                        <p className="py-10 px-4 text-center text-[13px] font-medium text-ink-3">{t("chat.attach.store.hint")}</p>
                    ) : search.isPending ? (
                        <div className="flex justify-center py-8 text-ink-3"><LucideLoader2 className="w-5 h-5 animate-spin" /></div>
                    ) : search.isError ? (
                        <p className="py-8 px-4 text-center text-[13px] font-medium text-ink-3">{t("chat.attach.loadFailed")}</p>
                    ) : (search.data ?? []).length === 0 ? (
                        <p className="py-10 px-4 text-center text-[13px] font-medium text-ink-3">{t("chat.attach.store.empty")}</p>
                    ) : (
                        <ul>
                            {(search.data ?? []).map((h) => (
                                <li key={h.type === "listing" ? `l:${h.code}` : `p:${h.id}`}>
                                    <button type="button" onClick={() => pick(h)} className="w-full px-2 py-2.5 flex items-center gap-3 rounded-xl active:bg-surface-2 text-left">
                                        <span className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center shrink-0"><LucideMapPin className="w-4 h-4 text-ink-3" /></span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5 min-w-0">
                                                <span className="text-[14px] font-medium text-ink-1 truncate">{h.name}</span>
                                                {h.type === "partner" && <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-brand/10 text-brand text-[10.5px] font-semibold">{t("chat.attach.store.partner")}</span>}
                                            </span>
                                            <span className="block text-[12px] font-medium text-ink-3 truncate">{h.address || (h.type === "listing" ? h.region : "") || ""}</span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
