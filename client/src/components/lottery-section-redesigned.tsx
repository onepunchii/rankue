import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface LotteryTicket {
  id: number;
  userId: string;
  numbers: number[];
  drawDate: string;
  isWinner: boolean;
  prizeAmount: number;
  isManualSelection: boolean;
  createdAt: string;
}

interface LotteryDraw {
  id: number;
  drawDate: string;
  winningNumbers: number[];
  totalParticipants: number;
  totalPrizePool: number;
  winnersCount: number;
  createdAt: string;
}

interface LotterySectionProps {
  userId: string;
}

export default function LotterySectionRedesigned({ userId }: LotterySectionProps) {
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [showNumberSelection, setShowNumberSelection] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tickets = [], isLoading: ticketsLoading } = useQuery({
    queryKey: ['/api/lottery/tickets'],
  });

  const { data: todayDraw } = useQuery({
    queryKey: ['/api/lottery/today-draw'],
  });

  const createManualTicketMutation = useMutation({
    mutationFn: async (numbers: number[]) => {
      return apiRequest('/api/lottery/manual-ticket', {
        method: 'POST',
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
      queryClient.invalidateQueries({ queryKey: ['/api/lottery/tickets'] });
    },
    onError: (error: any) => {
      toast({
        title: "프로필 인증이 필요해요",
        description: error.message || "프로필 인증을 완료하시면 사용가능합니다.",
        variant: "destructive",
      });
    },
  });

  const toggleNumber = (number: number) => {
    if (selectedNumbers.includes(number)) {
      setSelectedNumbers(selectedNumbers.filter(n => n !== number));
    } else if (selectedNumbers.length < 5) {
      setSelectedNumbers([...selectedNumbers, number].sort((a, b) => a - b));
    }
  };

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

  const getTicketStatus = (ticket: LotteryTicket, draw?: LotteryDraw) => {
    if (!draw) return "추첨 대기중";
    if (ticket.isWinner) return `당첨! ${ticket.prizeAmount.toLocaleString()}P`;
    return "미당첨";
  };

  const getTicketBadgeColor = (ticket: LotteryTicket, draw?: LotteryDraw) => {
    if (!draw) return "bg-yellow-100 text-yellow-800";
    if (ticket.isWinner) return "bg-green-100 text-green-800";
    return "bg-gray-100 text-gray-800";
  };

  const winningTickets = tickets.filter((ticket: LotteryTicket) => ticket.isWinner);
  const totalPrize = winningTickets.reduce((sum: number, ticket: LotteryTicket) => sum + (ticket.prizeAmount || 0), 0);

  if (ticketsLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="grid grid-cols-3 gap-3">
            <div className="h-16 bg-white/30 rounded-xl"></div>
            <div className="h-16 bg-white/30 rounded-xl"></div>
            <div className="h-16 bg-white/30 rounded-xl"></div>
          </div>
          <div className="mt-4 h-32 bg-white/30 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-4 text-center rounded-xl shadow-md">
          <div className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">{tickets.length}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">보유 티켓</div>
        </div>
        <div className="glass-card p-4 text-center rounded-xl shadow-md">
          <div className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">{winningTickets.length}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">당첨 횟수</div>
        </div>
        <div className="glass-card p-4 text-center rounded-xl shadow-md">
          <div className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">{totalPrize.toLocaleString()}P</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">총 포인트</div>
        </div>
      </div>

      {/* 수동 번호 선택 버튼 */}
      <div className="text-center">
        <Button
          onClick={() => setShowNumberSelection(!showNumberSelection)}
          className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-medium shadow-lg transition-all duration-200"
        >
          {showNumberSelection ? '번호 선택 취소' : '수동 번호 선택'}
        </Button>
      </div>

      {/* 수동 번호 선택 인터페이스 */}
      {showNumberSelection && (
        <div className="glass-card-light rounded-xl p-6 shadow-lg">
          <h4 className="font-bold bg-gradient-to-r from-pink-700 to-purple-700 bg-clip-text text-transparent mb-4 text-center">번호를 선택하세요 (5개)</h4>
          
          <div className="mb-4">
            <div className="text-center mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">선택된 번호: {selectedNumbers.length}/5</span>
            </div>
            <div className="flex justify-center gap-2 mb-4">
              {selectedNumbers.map((num, index) => (
                <div
                  key={index}
                  className="w-10 h-10 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-md"
                >
                  {num}
                </div>
              ))}
              {Array.from({ length: 5 - selectedNumbers.length }, (_, index) => (
                <div
                  key={`empty-${index}`}
                  className="w-10 h-10 border-2 border-dashed border-pink-300 rounded-full flex items-center justify-center"
                >
                  <span className="text-pink-400 text-xs">?</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-8 gap-2 mb-6">
            {Array.from({ length: 40 }, (_, i) => i + 1).map((number) => (
              <button
                key={number}
                onClick={() => toggleNumber(number)}
                className={`
                  w-10 h-10 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm
                  ${selectedNumbers.includes(number)
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-md scale-105'
                    : 'glass-card text-gray-700 dark:text-gray-300 hover:bg-pink-100 dark:hover:bg-pink-900/20 hover:scale-105'
                  }
                `}
              >
                {number}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleCreateManualTicket}
              disabled={selectedNumbers.length !== 5 || createManualTicketMutation.isPending}
              className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white rounded-xl font-medium shadow-lg"
            >
              {createManualTicketMutation.isPending ? '생성 중...' : '티켓 생성'}
            </Button>
            <Button
              onClick={() => setSelectedNumbers([])}
              variant="outline"
              className="flex-1 border-2 border-pink-200 dark:border-pink-700 text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-xl font-medium"
            >
              초기화
            </Button>
          </div>
        </div>
      )}

      {/* 오늘의 추첨 결과 */}
      {todayDraw && (
        <div className="glass-card-light rounded-xl p-6 shadow-lg">
          <h4 className="font-bold bg-gradient-to-r from-pink-700 to-purple-700 bg-clip-text text-transparent mb-4 text-center">오늘의 당첨 번호</h4>
          <div className="flex justify-center gap-3 mb-4">
            {todayDraw.winningNumbers.map((num: number, index: number) => (
              <div
                key={index}
                className="w-12 h-12 bg-gradient-to-br from-pink-500 to-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-lg"
              >
                {num}
              </div>
            ))}
          </div>
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            참가자: {todayDraw.totalParticipants}명 | 당첨자: {todayDraw.winnersCount}명
          </div>
        </div>
      )}

      {/* 티켓 목록 */}
      <div className="glass-card-light rounded-xl p-6 shadow-lg">
        <h4 className="font-bold bg-gradient-to-r from-pink-700 to-purple-700 bg-clip-text text-transparent mb-4">내 로또 티켓</h4>
        {tickets.length > 0 ? (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {tickets.slice(0, 10).map((ticket: LotteryTicket) => (
              <div key={ticket.id} className="flex items-center justify-between p-4 glass-card rounded-xl shadow-md">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {ticket.numbers.map((num, index) => (
                      <div
                        key={index}
                        className="w-8 h-8 bg-gradient-to-br from-pink-500 to-purple-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm"
                      >
                        {num}
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {new Date(ticket.drawDate).toLocaleDateString('ko-KR')} 추첨
                    {ticket.isManualSelection && ' • 수동선택'}
                  </div>
                </div>
                <div className="flex items-center">
                  <Badge className={`${getTicketBadgeColor(ticket, todayDraw)} rounded-md px-2 py-0.5 text-xs font-medium`}>
                    {getTicketStatus(ticket, todayDraw)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-gradient-to-br from-pink-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-ticket-alt text-xl" style={{ color: 'rgba(245, 73, 144, 1)' }}></i>
            </div>
            <p className="text-gray-600 dark:text-gray-300 font-medium">아직 로또 티켓이 없습니다</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">설문에 참여해서 레벨업하면 티켓을 받을 수 있어요!</p>
          </div>
        )}
      </div>

      {/* 로또 안내 */}
      <div className="glass-card-light rounded-xl p-6 shadow-lg">
        <h4 className="font-bold bg-gradient-to-r from-pink-700 to-purple-700 bg-clip-text text-transparent mb-3 text-center">시스템 안내</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(245, 73, 144, 1)' }}></div>
            <span>레벨업 시마다 티켓 1장 지급</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(245, 103, 164, 1)' }}></div>
            <span>매월 최대 100장까지 (레벨 100)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(245, 133, 184, 1)' }}></div>
            <span>매일 00:00 자동 추첨</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(245, 163, 204, 1)' }}></div>
            <span>5개 맞춤: 50,000P</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(245, 73, 144, 1)' }}></div>
            <span>4개 맞춤: 5,000P</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(245, 103, 164, 1)' }}></div>
            <span>3개 맞춤: 500P</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(245, 103, 164, 1)' }}></div>
            <span>수동 번호 선택 가능</span>
          </div>
        </div>
      </div>
    </div>
  );
}