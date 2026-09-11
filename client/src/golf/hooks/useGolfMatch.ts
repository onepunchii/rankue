import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * 홈의 '핀 번호 입력' 시트. 실패하면 **서버가 말한 이유**를 보여 준다 — 예전엔 없는 방이든, 꽉 찬 방이든,
 * 여러 번 틀려 잠긴 것이든 늘 '핀 번호를 다시 확인해주세요' 였다.
 */
export function useGolfMatch(_member: any) {
    const [pinEntry, setPinEntry] = useState<string[]>([]);
    const [isJoinOpen, setIsJoinOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    const joinMatch = useMutation({
        mutationFn: async (pin: string) => apiRequest("/api/hiq/golf/match/join", { method: "POST", body: { pin } }),
        onSuccess: (data: any) => {
            toast({ title: "입장했어요", description: data?.status === "waiting" ? "방장이 시작하면 바로 넘어가요." : "진행 중인 라운드에 들어왔어요." });
            setIsJoinOpen(false);
            setPinEntry([]);
            setError(null);
            setLocation(`/golf/game/${data.id}`);
        },
        onError: (e: any) => {
            setError(e?.message || "입장하지 못했어요. 다시 해 주세요.");
            setPinEntry([]);
        },
    });

    const submitIfFull = (digits: string[]) => {
        if (digits.length === 4 && !joinMatch.isPending) joinMatch.mutate(digits.join(""));
    };

    const handleKeypadPress = (num: number) => {
        if (joinMatch.isPending || pinEntry.length >= 4) return;
        setError(null);
        const next = [...pinEntry, String(num)];
        setPinEntry(next);
        submitIfFull(next);
    };

    const handleDelete = () => { setError(null); setPinEntry((prev) => prev.slice(0, -1)); };

    /** 붙여넣기·키보드 입력. 숫자만 골라 4자리까지. */
    const handleSetDigits = (text: string) => {
        if (joinMatch.isPending) return;
        const digits = text.replace(/\D/g, "").slice(0, 4).split("");
        setError(null);
        setPinEntry(digits);
        submitIfFull(digits);
    };

    return {
        isJoinOpen,
        setIsJoinOpen: (open: boolean) => { setIsJoinOpen(open); if (!open) { setPinEntry([]); setError(null); } },
        pinEntry,
        setPinEntry,
        handleKeypadPress,
        handleDelete,
        handleSetDigits,
        error,
        isLoading: joinMatch.isPending,
    };
}
