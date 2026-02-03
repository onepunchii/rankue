import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function useGolfMatch(member: any) {
    const [pinEntry, setPinEntry] = useState<string[]>([]);
    const [isJoinOpen, setIsJoinOpen] = useState(false);
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    const joinMatch = useMutation({
        mutationFn: async (pin: string) => {
            const res = await apiRequest("/api/hiq/golf/match/join", {
                method: "POST",
                body: {
                    pin,
                    memberId: member?.id,
                    name: member?.name
                }
            });
            return res.json();
        },
        onSuccess: (data) => {
            toast({ title: "입장 성공!", description: "대기실로 이동합니다.. 🚀" });
            setIsJoinOpen(false);
            setLocation(`/golf/game/${data.id}`);
        },
        onError: (e: any) => {
            toast({ variant: "destructive", title: "입장 실패", description: "핀 번호를 다시 확인해주세요." });
            setPinEntry([]);
        }
    });

    const handleKeypadPress = (num: number) => {
        if (pinEntry.length < 4) {
            const newPin = [...pinEntry, num.toString()];
            setPinEntry(newPin);
            if (newPin.length === 4) {
                joinMatch.mutate(newPin.join(''));
            }
        }
    };

    const handleDelete = () => setPinEntry(prev => prev.slice(0, -1));

    return {
        isJoinOpen,
        setIsJoinOpen,
        pinEntry,
        setPinEntry,
        handleKeypadPress,
        handleDelete,
        isLoading: joinMatch.isPending
    };
}
