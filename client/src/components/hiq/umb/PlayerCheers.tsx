/**
 * 선수 응원글(2026-09-13 오너 제안 11번). 선수 페이지 맨 아래.
 *
 * 실존 인물에 대한 공개 글이라 커뮤니티 댓글의 안전장치를 **그대로** 쓴다 — 쓰기는 약관 동의 시트(gate)를 먼저 거치고,
 * 서버가 욕설·내기 필터·연락처 마스킹·60초 쿨다운을 건다. 남의 글에는 신고·차단 메뉴(UgcActionMenu, targetType player_cheer),
 * 내 글은 삭제. 차단한 사람의 글은 서버가 목록에서 뺀다.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { useTermsGate } from "@/components/hiq/TermsConsent";
import { UgcActionMenu } from "@/components/hiq/community/UgcActionMenu";
import { List, Section } from "./ui";
import type { UmbCategory } from "./types";

interface Cheer { id: string; content: string; createdAt: string; authorId: string; authorName: string; mine: boolean }

const CHEER_MAX = 200;

function timeAgo(iso: string, t: (k: string) => string): string {
    const ms = Date.now() - Date.parse(iso);
    if (!Number.isFinite(ms) || ms < 60_000) return t("umb.cheerNow");
    const m = Math.floor(ms / 60_000);
    if (m < 60) return t("umb.cheerMinAgo").replace("{n}", String(m));
    const h = Math.floor(m / 60);
    if (h < 24) return t("umb.cheerHourAgo").replace("{n}", String(h));
    return t("umb.cheerDayAgo").replace("{n}", String(Math.floor(h / 24)));
}

export function PlayerCheers({ category, playerUmbId }: { category: UmbCategory; playerUmbId: string }) {
    const { t } = useT();
    const { member } = useAuth();
    const { toast } = useToast();
    const { gate } = useTermsGate();
    const qc = useQueryClient();
    const key = [`/api/hiq/umb/players/${category}/${playerUmbId}/cheers`];
    const { data } = useQuery<{ rows: Cheer[]; total: number }>({ queryKey: key, staleTime: 30_000 });
    const [text, setText] = useState("");

    const post = useMutation({
        mutationFn: async () => apiRequest(`/api/hiq/umb/players/${category}/${playerUmbId}/cheers`, { method: "POST", body: { content: text.trim() } }),
        onSuccess: () => { setText(""); void qc.invalidateQueries({ queryKey: key }); },
        onError: (e: any) => toast({ title: e?.message || t("umb.cheerFailed"), variant: "destructive" }),
    });
    const remove = useMutation({
        mutationFn: async (id: string) => apiRequest(`/api/hiq/umb/players/${category}/${playerUmbId}/cheers/${id}`, { method: "DELETE" }),
        onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    });

    const rows = data?.rows ?? [];
    const canSend = text.trim().length > 0 && text.length <= CHEER_MAX && !post.isPending;

    return (
        <Section emoji="💬" title={t("umb.cheersTitle")} meta={(data?.total ?? 0) > 0 ? t("umb.cheersCount").replace("{n}", String(data!.total)) : undefined}>
            {member ? (
                <div className="rounded-2xl bg-black/[0.03] p-3 mb-3">
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value.slice(0, CHEER_MAX))}
                        placeholder={t("umb.cheerPlaceholder")}
                        rows={2}
                        className="w-full bg-transparent text-[13.5px] text-ink-1 placeholder:text-black/35 outline-none resize-none px-1 py-0.5"
                    />
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                        <span className="text-[11px] font-medium text-black/35 tabular-nums px-1">{text.length}/{CHEER_MAX}</span>
                        <button
                            type="button" disabled={!canSend}
                            onClick={() => gate(() => post.mutate())}   // 첫 글이면 약관 동의부터 — 커뮤니티 글쓰기와 같은 규칙
                            className="h-9 px-4 rounded-full bg-brand text-brand-fg text-[12.5px] font-bold disabled:opacity-40 transition-opacity"
                        >{post.isPending ? t("umb.cheerSending") : t("umb.cheerSend")}</button>
                    </div>
                </div>
            ) : (
                <p className="text-[12px] font-medium text-black/45 mb-3 px-0.5">🔒 {t("umb.cheerLogin")}</p>
            )}

            {rows.length === 0 ? (
                <div className="rounded-2xl bg-black/[0.03] py-6 px-4 text-center">
                    <div className="text-[24px] leading-none">📣</div>
                    <p className="text-[12.5px] font-medium text-black/45 mt-2">{t("umb.cheersEmpty")}</p>
                </div>
            ) : (
                <List>
                    {rows.map((c) => (
                        <div key={c.id} className="flex gap-3 px-3 py-3">
                            {/* 이름 첫 글자 아바타 — 글마다 얼굴이 하나씩 생겨 목록이 덜 밋밋하다 */}
                            <span className="w-8 h-8 rounded-full bg-brand/12 text-brand text-[13px] font-bold flex items-center justify-center shrink-0 select-none">
                                {(c.authorName || "?").trim().charAt(0).toUpperCase()}
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="min-w-0 flex items-baseline gap-1.5">
                                        <span className="text-[12.5px] font-bold text-ink-1 truncate">{c.authorName}</span>
                                        <span className="text-[11px] font-medium text-black/40 shrink-0">{timeAgo(c.createdAt, t)}</span>
                                    </span>
                                    {c.mine ? (
                                        <button type="button" onClick={() => remove.mutate(c.id)} className="text-[11.5px] font-semibold text-black/40 hover:text-red-500 shrink-0">{t("umb.cheerDelete")}</button>
                                    ) : member ? (
                                        <UgcActionMenu targetType="player_cheer" targetId={c.id} authorId={c.authorId} authorName={c.authorName} onBlocked={() => void qc.invalidateQueries({ queryKey: key })} />
                                    ) : null}
                                </div>
                                <p className="text-[13.5px] text-ink-1 mt-1 whitespace-pre-wrap break-words leading-snug">{c.content}</p>
                            </div>
                        </div>
                    ))}
                </List>
            )}
        </Section>
    );
}
