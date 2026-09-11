import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LucideChevronRight, LucideFlag, LucideUsers } from "lucide-react";

interface ActiveMatch {
    id: string;
    status: "waiting" | "playing";
    courseName: string | null;
    currentHole: number;
    isHost: boolean;
    pinCode?: string;
    playerCount: number;
}

/**
 * 홈 맨 위의 '진행 중 라운드'. 예전엔 앱을 닫거나 뒤로 가기 한 번이면 진행 중 경기로 돌아올 길이 없어서,
 * 9/9 이후 만든 방 4개가 전부 대기·진행 중인 채 버려져 있었다(2026-09-11 리뷰).
 */
export function ActiveRoundCard() {
    const [, setLocation] = useLocation();
    const { data } = useQuery<ActiveMatch | null>({
        queryKey: ["/api/hiq/golf/match/active"],
        refetchOnWindowFocus: true,
    });
    if (!data) return null;

    const waiting = data.status === "waiting";
    const open = () => {
        if (waiting && data.isHost) setLocation(`/golf/game/new?lobby=${data.id}`);
        else setLocation(`/golf/game/${data.id}`);
    };

    return (
        <button
            onClick={open}
            className="mb-4 w-full rounded-2xl bg-[#64DD17]/[0.08] border border-[#64DD17]/30 px-5 py-4 flex items-center gap-4 text-left hover:border-[#64DD17]/60 transition-colors"
        >
            <span className="shrink-0 w-11 h-11 rounded-xl bg-[#64DD17]/15 text-[#64DD17] flex items-center justify-center">
                {waiting ? <LucideUsers className="w-5 h-5" /> : <LucideFlag className="w-5 h-5" />}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold text-[#64DD17]">
                    {waiting ? "동반자를 기다리는 중" : "진행 중 라운드"}
                </span>
                <span className="block text-[15px] font-black text-white truncate">
                    {data.courseName || "골프장 미정"}
                </span>
                <span className="block text-[11px] font-bold text-white/50 mt-0.5">
                    {waiting
                        ? `${data.playerCount}명 입장${data.pinCode ? ` · 핀 ${data.pinCode}` : ""}`
                        : `${Math.min(18, Math.max(1, data.currentHole))}번 홀 · ${data.playerCount}명`}
                </span>
            </span>
            <span className="shrink-0 h-9 px-4 rounded-full bg-[#64DD17] text-[#051907] text-[12px] font-black flex items-center gap-1">
                이어하기<LucideChevronRight className="w-4 h-4" />
            </span>
        </button>
    );
}
