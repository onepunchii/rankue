import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { queryKeys } from "@/lib/queryKeys";
import { LotteryTicket, LotteryDraw } from "@shared/schema";

// UI에서 사용하는 확장된 티켓 타입
export interface ExtendedLotteryTicket extends LotteryTicket {
    isManualSelection?: boolean;
    drawDate?: string;
}

export interface ExtendedLotteryDraw extends LotteryDraw {
    winnersCount?: number;
}

export function useLottery() {
    const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
    const [showNumberSelection, setShowNumberSelection] = useState(false);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // 티켓 목록 조회
    const { data: tickets = [], isLoading: ticketsLoading } = useQuery<ExtendedLotteryTicket[]>({
        queryKey: [queryKeys.LOTTERY_TICKETS],
    });

    // 오늘의 추첨 결과 조회
    const { data: todayDraw } = useQuery<LotteryDraw>({
        queryKey: [queryKeys.LOTTERY_TODAY_DRAW],
    });

    // 수동 티켓 생성 뮤테이션
    const createManualTicketMutation = useMutation({
        mutationFn: async (numbers: number[]) => {
            return apiRequest(queryKeys.LOTTERY_MANUAL_TICKET, {
                method: "POST",
                body: { numbers },
            });
        },
        onSuccess: () => {
            toast({
                title: "로또 티켓 생성 완료",
                description: "로또 번호가 성공적으로 선택되었습니다!",
            });
            setSelectedNumbers([]);
            setShowNumberSelection(false);
            queryClient.invalidateQueries({ queryKey: [queryKeys.LOTTERY_TICKETS] });
        },
        onError: (error: any) => {
            toast({
                title: "생성 실패",
                description: error.message || "티켓 생성 중 오류가 발생했습니다.",
                variant: "destructive",
            });
        },
    });

    // 번호 토글 로직
    const toggleNumber = (number: number) => {
        if (selectedNumbers.includes(number)) {
            setSelectedNumbers(prev => prev.filter(n => n !== number));
        } else if (selectedNumbers.length < 5) {
            setSelectedNumbers(prev => [...prev, number].sort((a, b) => a - b));
        }
    };

    // 수동 티켓 생성 핸들러
    const handleCreateManualTicket = () => {
        if (selectedNumbers.length !== 5) {
            toast({
                title: "번호 선택 오류",
                description: "정확히 5개의 번호를 선택해주세요.",
                variant: "destructive",
            });
            return;
        }
        createManualTicketMutation.mutate(selectedNumbers);
    };

    // 헬퍼 함수: 티켓 상태 텍스트
    const getTicketStatus = (ticket: ExtendedLotteryTicket, draw?: LotteryDraw) => {
        if (!draw) return "추첨 대기중";
        if (ticket.isWinner) return `당첨! ${ticket.prizeAmount?.toLocaleString() || 0}P`;
        return "미당첨";
    };

    // 헬퍼 함수: 티켓 상태 배지 색상
    const getTicketBadgeColor = (ticket: ExtendedLotteryTicket, draw?: LotteryDraw) => {
        if (!draw) return "bg-yellow-100 text-yellow-800";
        if (ticket.isWinner) return "bg-green-100 text-green-800";
        return "bg-gray-100 text-gray-800";
    };

    // 통계 계산
    const winningTickets = tickets.filter(ticket => ticket.isWinner);
    const totalPrize = winningTickets.reduce((sum, ticket) => sum + (ticket.prizeAmount || 0), 0);

    return {
        // Data
        tickets,
        todayDraw,
        ticketsLoading,
        winningTickets,
        totalPrize,

        // State
        selectedNumbers,
        setSelectedNumbers,
        showNumberSelection,
        setShowNumberSelection,

        // Actions
        toggleNumber,
        handleCreateManualTicket,
        createManualTicketMutation,

        // Helpers
        getTicketStatus,
        getTicketBadgeColor,
    };
}
