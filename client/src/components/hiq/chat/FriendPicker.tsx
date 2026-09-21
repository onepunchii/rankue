/**
 * 새 대화 — 친구(라이벌)를 골라 1:1·소그룹 방을 연다(2026-09-21 오너: "라이벌·친구를 초대해 채팅할 수 있게").
 * 친구로 등록된 사람만 고를 수 있다(서버도 같은 규칙) — 낯선 사람에게 방을 열 수 없어 도배·스토킹이 안 된다.
 * 두 종목의 친구를 한 목록으로(사람 사이의 대화는 종목이 없다).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LucideLoader2, LucideCheck } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Friend { id: string; name: string; profileImageUrl: string | null }

function normalize(rows: any[]): Friend[] {
    return (rows ?? [])
        .filter((r) => (r?.status ?? "accepted") === "accepted")
        .map((r) => ({ id: String(r.friend?.id ?? r.id), name: r.friend?.name ?? r.name ?? "", profileImageUrl: r.profile?.profileImageUrl ?? r.friend?.profileImageUrl ?? null }))
        .filter((f) => f.id && f.name);
}

export function FriendPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const { t } = useT();
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const [picked, setPicked] = useState<string[]>([]);
    const [q, setQ] = useState("");
    const bil = useQuery<any[]>({ queryKey: ["/api/hiq/friends", "BILLIARDS"], queryFn: () => apiRequest("/api/hiq/friends?sport=BILLIARDS"), enabled: open });
    const golf = useQuery<any[]>({ queryKey: ["/api/hiq/friends", "GOLF"], queryFn: () => apiRequest("/api/hiq/friends?sport=GOLF"), enabled: open });
    const friends = useMemo(() => {
        const byId = new Map<string, Friend>();
        for (const f of [...normalize(bil.data ?? []), ...normalize(golf.data ?? [])]) byId.set(f.id, f);
        const list = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
        return q ? list.filter((f) => f.name.includes(q)) : list;
    }, [bil.data, golf.data, q]);

    const create = useMutation({
        mutationFn: async () => apiRequest("/api/hiq/chat/dm", { method: "POST", body: { memberIds: picked } }) as Promise<{ key: string }>,
        onSuccess: (r) => { onOpenChange(false); setPicked([]); const [kind, id] = r.key.split(":"); setLocation(`/chat/${kind}/${id}`); },
        onError: (e: any) => toast({ title: e?.message || t("chat.dmFailed"), variant: "destructive" }),
    });

    return (
        <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setPicked([]); }}>
            <SheetContent side="bottom" className="bg-surface-0 text-ink-1 border-surface-line rounded-t-2xl p-0 max-h-[80dvh] flex flex-col">
                <SheetHeader className="px-5 pt-5 pb-2 text-left shrink-0">
                    <SheetTitle className="text-[17px] font-semibold text-ink-1">{t("chat.newChat")}</SheetTitle>
                    <SheetDescription className="text-[12.5px] text-ink-3">{t("chat.newChatDesc")}</SheetDescription>
                </SheetHeader>
                <div className="px-5 pb-2 shrink-0">
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("chat.searchFriend")} className="w-full h-10 px-3.5 rounded-xl bg-surface-2 text-[14px] text-ink-1 placeholder:text-ink-4 outline-none" />
                </div>
                <div className="flex-1 overflow-y-auto px-3 pb-3">
                    {bil.isPending || golf.isPending ? (
                        <div className="flex justify-center py-8 text-ink-3"><LucideLoader2 className="w-5 h-5 animate-spin" /></div>
                    ) : friends.length === 0 ? (
                        <div className="py-8 px-4 text-center space-y-2">
                            <p className="text-[13px] font-medium text-ink-3">{t("chat.noFriends")}</p>
                            <button type="button" onClick={() => { onOpenChange(false); setLocation("/friends"); }} className="text-[13px] font-semibold text-brand">{t("chat.goFriends")}</button>
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
                <div className="px-5 pb-5 pt-3 border-t border-surface-line shrink-0">
                    <button type="button" disabled={picked.length === 0 || create.isPending} onClick={() => create.mutate()} className="w-full h-12 rounded-xl bg-brand text-brand-fg text-[15px] font-semibold disabled:opacity-40">
                        {create.isPending ? <LucideLoader2 className="w-5 h-5 animate-spin inline" /> : picked.length > 1 ? t("chat.startGroup").replace("{n}", String(picked.length)) : t("chat.startChat")}
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
