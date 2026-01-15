import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { BalanceGameCard } from "@/components/BalanceGameCard";
import type { BalanceGame } from "@shared/schema";

export default function BalanceGameReview() {
    const { toast } = useToast();
    const [generateUrl, setGenerateUrl] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);

    // Fetch Pending Games
    const { data: pendingGames = [], refetch } = useQuery<BalanceGame[]>({
        queryKey: ['/api/balance-games', 'PENDING'],
        queryFn: async () => {
            const res = await fetch('/api/balance-games?status=PENDING');
            if (!res.ok) throw new Error("Failed to fetch pending games");
            const json = await res.json();
            return Array.isArray(json.data) ? json.data : [];
        },
        retry: false
    });

    const handleGenerate = async () => {
        if (!generateUrl) {
            toast({ title: "URL Required", variant: "destructive" });
            return;
        }
        setIsGenerating(true);
        try {
            const res = await apiRequest("/api/balance-games/generate", {
                method: "POST",
                body: { url: generateUrl }
            });
            if (res.success) {
                toast({ title: "Generated!", description: `Game: ${res.game.title}` });
                refetch();
                setGenerateUrl("");
            }
        } catch (e) {
            console.error(e);
            toast({ title: "Generation Failed", description: "Check console / valid URL", variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    }

    const handleStatus = async (id: number, status: 'ACTIVE' | 'REJECTED') => {
        try {
            await apiRequest(`/api/balance-games/${id}/status`, {
                method: "PATCH",
                body: { status }
            });
            toast({ title: `Marked as ${status}` });
            refetch();
        } catch (e) {
            toast({ title: "Update Failed", variant: "destructive" });
        }
    }

    return (
        <div className="p-8 space-y-8 min-h-screen bg-[#0F0F1A] text-white">
            <h1 className="text-3xl font-bold">⚖️ Balance Game Manager</h1>

            {/* Generator */}
            <Card className="p-4 bg-white/5 border-white/10">
                <CardHeader><CardTitle className="text-white">AI Generator</CardTitle></CardHeader>
                <CardContent className="flex gap-4">
                    <Input
                        placeholder="News Article URL..."
                        value={generateUrl}
                        onChange={(e) => setGenerateUrl(e.target.value)}
                        className="bg-black/20 border-white/10 text-white"
                    />
                    <Button onClick={handleGenerate} disabled={isGenerating}>
                        {isGenerating ? <i className="fas fa-spinner fa-spin mr-2" /> : <i className="fas fa-magic mr-2" />}
                        Generate
                    </Button>
                </CardContent>
            </Card>

            <h2 className="text-xl font-bold">Pending Approval ({pendingGames.length})</h2>

            {/* Review Queue */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {pendingGames.map(game => (
                    <div key={game.id} className="relative flex flex-col gap-4 p-4 rounded-3xl border border-white/10 bg-black/20">
                        {/* Preview Card */}
                        <div className="w-full relative pointer-events-none">
                            <BalanceGameCard
                                game={game}
                                onVote={async () => { }}
                            />
                        </div>

                        {/* Info */}
                        <div className="text-sm text-gray-400 truncate px-2">
                            Source: <a href={game.sourceNewsUrl || '#'} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{game.sourceNewsUrl}</a>
                        </div>

                        {/* Controls */}
                        <div className="flex gap-2 mt-auto">
                            <Button
                                className="flex-1 bg-green-500/80 hover:bg-green-600 text-white font-bold"
                                onClick={() => handleStatus(game.id, 'ACTIVE')}
                            >
                                <i className="fas fa-check mr-2" /> Approve
                            </Button>
                            <Button
                                className="flex-1 bg-red-500/80 hover:bg-red-600 text-white font-bold"
                                onClick={() => handleStatus(game.id, 'REJECTED')}
                            >
                                <i className="fas fa-times mr-2" /> Reject
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
            {pendingGames.length === 0 && (
                <div className="text-center py-20 text-gray-500 border border-dashed border-white/10 rounded-2xl">
                    No pending games to review.
                </div>
            )}
        </div>
    )
}
