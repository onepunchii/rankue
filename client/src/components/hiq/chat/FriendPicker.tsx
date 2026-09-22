/**
 * 새 대화 — 친구(라이벌)를 골라 1:1·소그룹 방을 연다(2026-09-21 오너: "라이벌·친구를 초대해 채팅할 수 있게").
 * 친구로 등록된 사람만 고를 수 있다(서버도 같은 규칙) — 낯선 사람에게 방을 열 수 없어 도배·스토킹이 안 된다.
 * **지금 종목의 친구만** 보인다(오너: "골프 채팅과 당구 채팅은 구별되게") — 방도 그 종목으로 열린다.
 *
 * Radix Sheet 를 안 쓴다: 검색칸에 포커스가 가 키보드가 뜨면 index.css 의 다이얼로그 키보드 회피가
 * 시트를 화면 왼쪽 절반으로 밀어 반쪽만 보였다. 여기서는 전체 화면 층으로 그리고 키보드 높이만큼 아래를 비운다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LucideLoader2, LucideCheck, LucideX, LucideSearch } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Friend { id: string; name: string; profileImageUrl: string | null }

function normalize(rows: any[]): Friend[] {
    return (rows ?? [])
        .filter((r) => (r?.status ?? "accepted") === "accepted")
        .map((r) => ({ id: String(r.friend?.id ?? r.id), name: r.friend?.name ?? r.name ?? "", profileImageUrl: r.profileImageUrl ?? r.profile?.profileImageUrl ?? r.friend?.profileImageUrl ?? null }))
        .filter((f) => f.id && f.name);
}

export function FriendPicker({ open, onOpenChange, sport }: { open: boolean; onOpenChange: (o: boolean) => void; sport: "BILLIARDS" | "GOLF" }) {
    const { t } = useT();
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const [picked, setPicked] = useState<string[]>([]);
    const [q, setQ] = useState("");
    const friendsQ = useQuery<any[]>({ queryKey: ["/api/hiq/friends", sport], queryFn: () => apiRequest(`/api/hiq/friends?sport=${sport}`), enabled: open });
    const friends = useMemo(() => {
        const list = normalize(friendsQ.data ?? []).sort((a, b) => a.name.localeCompare(b.name));
        return q ? list.filter((f) => f.name.includes(q)) : list;
    }, [friendsQ.data, q]);

    const close = () => { onOpenChange(false); setPicked([]); setQ(""); };
    const panelRef = useRef<HTMLDivElement>(null);

    // 열려 있는 동안 뒤 화면이 같이 스크롤되지 않게, 뒤로가기(ESC)로 닫힌다.
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        // 층이 열리면 포커스를 안으로 옮긴다 — 안 옮기면 키보드·스크린리더의 포커스가 가려진 뒤 화면에 남는다.
        // (검색칸에 바로 포커스를 주지는 않는다: 열자마자 키보드가 올라와 목록을 가린다.)
        panelRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
        window.addEventListener("keydown", onKey);
        return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const create = useMutation({
        mutationFn: async () => apiRequest("/api/hiq/chat/dm", { method: "POST", body: { memberIds: picked, sport } }) as Promise<{ key: string }>,
        onSuccess: (r) => { close(); const [kind, id] = r.key.split(":"); setLocation(`/chat/${kind}/${id}`); },
        onError: (e: any) => toast({ title: e?.message || t("chat.dmFailed"), variant: "destructive" }),
    });

    if (!open) return null;
    const golf = sport === "GOLF";

    return (
        <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("chat.newChat")} className="fixed inset-0 z-[60] flex flex-col bg-surface-0 text-ink-1 outline-none" style={{ paddingBottom: "var(--keyboard-height, 0px)" }}>
            <header className="shrink-0 h-14 px-2 flex items-center gap-1 border-b border-surface-line">
                <button type="button" onClick={close} aria-label={t("chat.close")} className="w-10 h-10 rounded-full flex items-center justify-center text-ink-2 active:bg-surface-2">
                    <LucideX className="w-5 h-5" />
                </button>
                <div className="min-w-0 flex-1">
                    <h2 className="text-[16px] font-semibold truncate">{t("chat.newChat")}</h2>
                    <p className="text-[11.5px] font-medium text-ink-3 truncate">{golf ? t("chat.golfFriends") : t("chat.billiardsFriends")} · {t("chat.newChatDesc")}</p>
                </div>
                {picked.length > 0 && <span className="mr-3 text-[12.5px] font-semibold text-brand rk-num">{t("chat.peopleN").replace("{n}", String(picked.length))}</span>}
            </header>
            <div className="px-4 py-2.5 shrink-0">
                <label className="flex items-center gap-2 h-10 px-3.5 rounded-xl bg-surface-2">
                    <LucideSearch className="w-4 h-4 text-ink-4 shrink-0" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("chat.searchFriend")} className="flex-1 min-w-0 bg-transparent text-[14px] text-ink-1 placeholder:text-ink-4 outline-none" />
                </label>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
                {friendsQ.isPending ? (
                    <div className="flex justify-center py-8 text-ink-3"><LucideLoader2 className="w-5 h-5 animate-spin" /></div>
                ) : friends.length === 0 ? (
                    <div className="py-10 px-4 text-center space-y-2">
                        <p className="text-[13px] font-medium text-ink-3">{q ? t("chat.noSearchResult") : golf ? t("chat.noGolfFriends") : t("chat.noFriends")}</p>
                        {!q && <button type="button" onClick={() => { close(); setLocation("/friends"); }} className="text-[13px] font-semibold text-brand">{t("chat.goFriends")}</button>}
                    </div>
                ) : (
                    <ul>
                        {friends.map((f) => {
                            const on = picked.includes(f.id);
                            return (
                                <li key={f.id}>
                                    <button type="button" onClick={() => setPicked((p) => (on ? p.filter((x) => x !== f.id) : [...p, f.id]))} className="w-full px-2 py-2.5 flex items-center gap-3 rounded-xl active:bg-surface-2">
                                        <span className="w-10 h-10 rounded-full bg-surface-3 overflow-hidden flex items-center justify-center text-[14px] font-semibold text-ink-2">
                                            {f.profileImageUrl ? <img src={f.profileImageUrl} alt="" className="w-full h-full object-cover" /> : f.name.charAt(0)}
                                        </span>
                                        <span className="flex-1 text-left text-[14px] font-medium text-ink-1 truncate">{f.name}</span>
                                        <span className={cn("w-6 h-6 rounded-full border flex items-center justify-center", on ? "bg-brand border-brand text-brand-fg" : "border-surface-line-strong")}>{on && <LucideCheck className="w-4 h-4" />}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
            <div className="px-4 pt-3 border-t border-surface-line shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <button type="button" disabled={picked.length === 0 || create.isPending} onClick={() => create.mutate()} className="w-full h-12 rounded-xl bg-brand text-brand-fg text-[15px] font-semibold disabled:opacity-40">
                    {create.isPending ? <LucideLoader2 className="w-5 h-5 animate-spin inline" /> : picked.length > 1 ? t("chat.startGroup").replace("{n}", String(picked.length)) : t("chat.startChat")}
                </button>
            </div>
        </div>
    );
}
