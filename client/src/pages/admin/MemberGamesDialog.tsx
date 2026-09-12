/**
 * 어드민 · 회원 경기 기록 정리(2026-09-12).
 *
 * 왜 있나: 회원이 앱에서 지울 수 있는 건 '진행 중'인 경기뿐이다(끝난 경기는 랭킹 기록이라 참가자가 지우면 안 된다).
 * 그런데 잘못 눌러 만든 판을 억지로 끝낸 기록 — 1이닝 16점 같은 — 이 에버리지·하이런·RP 를 오염시키는 일이 생긴다.
 * 그때마다 DB 를 직접 건드리는 대신 여기서 지운다. 서버가 전적 행·RP·에버리지를 함께 되돌리고, 전후 값을 돌려준다.
 *
 * 되돌림의 한계는 결과 화면에 그대로 적는다 — RP 는 증감식이라 종료 당시 핸디가 지금과 다르면 딱 맞지 않는다.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface AdminGameRow {
    id: string;
    playedAt: string | null;
    gameType: "3c" | "4c" | "golf";
    gameMode: string;
    status: string;
    isRanked: boolean;
    opponents: string[];
    score: number;
    target: number;
    highRun: number;
    innings: number;
    isWinner: boolean;
}

interface DeleteResultMember {
    id: string; name: string; rpRolledBack: number;
    before: { rating: number; avg: number; games: number; wins: number; highRun: number };
    after: { rating: number; avg: number; games: number; wins: number; highRun: number };
}

interface DeleteResult {
    game: { id: string; gameType: string; isRanked: boolean; playedAt: string | null; players: string[] };
    members: DeleteResultMember[];
}

const TYPE_LABEL: Record<string, string> = { "3c": "3쿠션", "4c": "4구", golf: "골프" };
const MODE_LABEL: Record<string, string> = { match: "랭킹전", practice: "연습", tournament: "대진" };

function fmtDate(v: string | null): string {
    if (!v) return "-";
    const d = new Date(v);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 1이닝짜리 고득점처럼 눈에 띄게 이상한 판에 표를 달아 준다 — 지울 대상을 찾는 게 이 화면의 목적이라서. */
function isOdd(g: AdminGameRow): boolean {
    return g.status === "finished" && g.innings > 0 && g.innings <= 2 && g.score >= 5;
}

export default function MemberGamesDialog({ member, onClose }: { member: { id: string; name: string } | null; onClose: () => void }) {
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [result, setResult] = useState<DeleteResult | null>(null);
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data: games = [], isLoading } = useQuery<AdminGameRow[]>({
        queryKey: [`/api/hiq/admin/members/${member?.id}/games`],
        enabled: !!member,
    });

    const del = useMutation({
        mutationFn: async (id: string) => apiRequest(`/api/hiq/admin/games/${id}`, { method: "DELETE" }) as Promise<DeleteResult>,
        onSuccess: (r) => {
            setResult(r);
            setConfirmId(null);
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/admin/members/${member?.id}/games`] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/admin/members"] });
            toast({ title: "기록을 지웠습니다", description: "RP·에버리지도 함께 되돌렸습니다." });
        },
        onError: (e: any) => toast({ title: "지우지 못했습니다", description: e?.message ?? "잠시 후 다시 시도해 주세요", variant: "destructive" }),
    });

    return (
        <Dialog open={!!member} onOpenChange={(v) => { if (!v) { setResult(null); setConfirmId(null); onClose(); } }}>
            <DialogContent className="max-w-4xl w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto">
                <h2 className="text-lg font-black text-[rgba(0,0,0,0.87)]">{member?.name} 님의 경기 기록</h2>
                <p className="text-xs text-black/50 -mt-2">
                    끝난 경기를 지우면 전적·RP·에버리지가 함께 되돌아갑니다. 되돌린 값은 아래에 보여드립니다.
                </p>

                {result && (
                    <div className="rounded-2xl border border-brand/30 bg-brand/[0.06] p-4 text-sm">
                        <p className="font-black text-[rgba(0,0,0,0.87)] mb-2">지웠습니다 · {TYPE_LABEL[result.game.gameType] ?? result.game.gameType} {fmtDate(result.game.playedAt)}</p>
                        <div className="space-y-2">
                            {result.members.map((m) => (
                                <div key={m.id} className="flex flex-wrap gap-x-4 gap-y-1 items-baseline">
                                    <span className="font-bold">{m.name}</span>
                                    <span className="text-black/60">RP <b className="font-mono">{m.before.rating}</b> → <b className="font-mono text-brand">{m.after.rating}</b></span>
                                    <span className="text-black/60">에버 <b className="font-mono">{m.before.avg.toFixed(3)}</b> → <b className="font-mono text-brand">{m.after.avg.toFixed(3)}</b></span>
                                    <span className="text-black/60">하이런 <b className="font-mono">{m.before.highRun}</b> → <b className="font-mono text-brand">{m.after.highRun}</b></span>
                                    <span className="text-black/60">{m.before.games}전 {m.before.wins}승 → {m.after.games}전 {m.after.wins}승</span>
                                </div>
                            ))}
                        </div>
                        {result.game.isRanked && (
                            <p className="text-[11px] text-black/45 mt-2">
                                RP 는 증감식이라 종료 당시 핸디가 지금과 다르면 딱 맞지 않을 수 있습니다.
                            </p>
                        )}
                    </div>
                )}

                <div className="rounded-2xl overflow-hidden border border-black/10 overflow-x-auto">
                    <table className="w-full text-left bg-white text-sm whitespace-nowrap">
                        <thead>
                            <tr className="border-b border-black/10 bg-black/[0.02]">
                                <th className="p-3 font-black text-black/55">일시</th>
                                <th className="p-3 font-black text-black/55">종목</th>
                                <th className="p-3 font-black text-black/55">상대</th>
                                <th className="p-3 font-black text-black/55 text-right">점수</th>
                                <th className="p-3 font-black text-black/55 text-right">이닝</th>
                                <th className="p-3 font-black text-black/55 text-right">하이런</th>
                                <th className="p-3 font-black text-black/55 text-center">상태</th>
                                <th className="p-3 font-black text-black/55 text-right">정리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {games.map((g) => (
                                <tr key={g.id} className={`border-b border-black/[0.06] ${isOdd(g) ? "bg-amber-50" : ""}`}>
                                    <td className="p-3 text-black/60 font-mono text-xs">{fmtDate(g.playedAt)}</td>
                                    <td className="p-3 text-black/70">
                                        {TYPE_LABEL[g.gameType] ?? g.gameType}
                                        <span className="text-black/35"> · {MODE_LABEL[g.gameMode] ?? g.gameMode}</span>
                                        {!g.isRanked && <span className="text-black/35"> · 무랭크</span>}
                                    </td>
                                    <td className="p-3 text-black/70">{g.opponents.join(", ")}</td>
                                    <td className="p-3 text-right font-mono font-bold">{g.score}<span className="text-black/35">/{g.target}</span></td>
                                    <td className="p-3 text-right font-mono">{g.innings}</td>
                                    <td className="p-3 text-right font-mono">{g.highRun}</td>
                                    <td className="p-3 text-center text-xs">
                                        {g.status === "finished"
                                            ? <span className={g.isWinner ? "text-brand font-bold" : "text-black/50"}>{g.isWinner ? "승" : "패"}</span>
                                            : <span className="text-amber-600 font-bold">진행 중</span>}
                                    </td>
                                    <td className="p-3 text-right">
                                        {confirmId === g.id ? (
                                            <span className="inline-flex gap-2">
                                                <button
                                                    onClick={() => del.mutate(g.id)}
                                                    disabled={del.isPending}
                                                    className="h-8 px-3 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-50"
                                                >{del.isPending ? "지우는 중..." : "지운다"}</button>
                                                <button onClick={() => setConfirmId(null)} className="h-8 px-3 rounded-lg border border-black/15 text-xs font-bold">취소</button>
                                            </span>
                                        ) : (
                                            <button
                                                onClick={() => { setResult(null); setConfirmId(g.id); }}
                                                className="h-8 px-3 rounded-lg border border-black/15 text-xs font-bold text-black/60 hover:border-red-300 hover:text-red-600"
                                            >삭제</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {!isLoading && games.length === 0 && (
                                <tr><td colSpan={8} className="p-8 text-center text-black/45">경기 기록이 없습니다.</td></tr>
                            )}
                            {isLoading && (
                                <tr><td colSpan={8} className="p-8 text-center text-black/45">불러오는 중...</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <p className="text-[11px] text-black/40">노란 줄은 이닝이 1~2인데 점수가 높은 판입니다 — 잘못 만든 기록일 수 있습니다.</p>
            </DialogContent>
        </Dialog>
    );
}
