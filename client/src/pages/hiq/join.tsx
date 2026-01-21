
import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { LucideCheckCircle2, LucideXCircle, LucideLoader2 } from "lucide-react";
import { HiqMember } from "@shared/schema";
import { useStore } from "@/contexts/StoreContext";

export default function HiqJoin() {
    const [, params] = useRoute("/join/:code");
    const code = params?.code;
    const [, setLocation] = useLocation();
    const { store } = useStore();

    // Check login status
    const { data: me, isLoading: meLoading, error: meError } = useQuery<HiqMember>({
        queryKey: ["/api/hiq/me"],
        retry: false
    });

    // Check invite status
    const { data: invite, isLoading: inviteLoading } = useQuery<any>({
        queryKey: [`/api/hiq/invite/${code}`],
        enabled: !!code
    });

    const joinMutation = useMutation({
        mutationFn: async () => {
            await apiRequest(`/api/hiq/invite/${code}/join`, { method: "POST" });
        },
        onSuccess: () => {
            // Joined successfully
        }
    });

    if (meLoading || inviteLoading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center text-white">
                <LucideLoader2 className="w-10 h-10 animate-spin text-[#ffd700]" />
            </div>
        );
    }

    if (!me) {
        // Not logged in -> Redirect to login (or landing) with return url
        // For MVP, just show message
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center space-y-6">
                <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                    <LucideXCircle className="w-10 h-10 text-red-500" />
                </div>
                <h2 className="text-2xl font-black">로그인이 필요합니다</h2>
                <p className="text-white/60">
                    게임을 함께 하려면 먼저 로그인이 필요합니다.<br />
                    로그인 후 다시 QR코드를 스캔해주세요.
                </p>
                <Button
                    className="w-full h-14 text-lg font-bold bg-[#ffd700] text-black hover:bg-[#ffe033]"
                    onClick={() => setLocation("/login?redirect=" + encodeURIComponent(`/join/${code}`))}
                >
                    로그인 하러 가기
                </Button>
            </div>
        );
    }

    if (invite?.status !== 'pending') {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
                <LucideXCircle className="w-16 h-16 text-red-500 mb-4" />
                <h2 className="text-xl font-bold mb-2">유효하지 않은 초대</h2>
                <p className="text-white/50">이미 만료되었거나 완료된 초대입니다.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white p-6 flex flex-col items-center justify-center text-center">
            <div className="mb-10">
                <div className="w-24 h-24 mx-auto bg-[#0e4d2a] rounded-[2rem] flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                    <span className="text-4xl">🎱</span>
                </div>
                <h1 className="text-3xl font-black mb-2">게임 입장하기</h1>
                <p className="text-white/60">
                    <span className="text-[#ffd700] font-bold">{me.name}</span>님, <br />
                    방장의 게임에 참여하시겠습니까?
                </p>
            </div>

            <div className="w-full max-w-sm space-y-4">
                {joinMutation.isSuccess ? (
                    <div className="p-6 bg-green-500/10 border border-green-500/20 rounded-2xl animate-in zoom-in">
                        <LucideCheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
                        <h3 className="text-xl font-bold text-green-400">참여 완료!</h3>
                        <p className="text-sm text-white/50 mt-1">방장의 화면을 확인해주세요.</p>
                    </div>
                ) : (
                    <Button
                        size="lg"
                        className="w-full h-16 text-xl font-black bg-[#0e4d2a] hover:bg-[#0e4d2a]/80 text-white rounded-2xl"
                        onClick={() => joinMutation.mutate()}
                        disabled={joinMutation.isPending}
                    >
                        {joinMutation.isPending ? "입장 중..." : "네, 입장할게요!"}
                    </Button>
                )}

                {!joinMutation.isSuccess && (
                    <Button variant="ghost" className="text-white/30 text-sm">
                        취소
                    </Button>
                )}
            </div>
        </div>
    );
}
