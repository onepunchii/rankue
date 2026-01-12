import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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

export default function LotterySection({ userId }: LotterySectionProps) {
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
    if (ticket.isWinner) return `당첨! ${ticket.prizeAmount.toLocaleString()}원`;
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
        <div className="animate-pulse bg-gray-200 h-20 rounded-lg"></div>
        <div className="animate-pulse bg-gray-200 h-32 rounded-lg"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 로또 현황 카드 */}
      <Card className="shadow-soft">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800">로또 현황</h3>
            <Button
              onClick={() => setShowNumberSelection(!showNumberSelection)}
              size="sm"
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              로또 하러가기
            </Button>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">{tickets.length}</div>
              <div className="text-xs text-gray-500">보유 티켓</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">{winningTickets.length}</div>
              <div className="text-xs text-gray-500">당첨 횟수</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-yellow-600">{totalPrize.toLocaleString()}원</div>
              <div className="text-xs text-gray-500">총 상금</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 번호 선택 인터페이스 */}
      {showNumberSelection && (
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <h4 className="font-bold text-gray-800 mb-4">로또 번호 선택 (1-40 중 5개)</h4>
            
            <div className="mb-4">
              <div className="text-sm text-gray-600 mb-2">
                선택된 번호: {selectedNumbers.length}/5
              </div>
              <div className="flex flex-wrap gap-1">
                {selectedNumbers.map(num => (
                  <Badge key={num} className="bg-blue-500 text-white">
                    {num}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-8 gap-2 mb-4">
              {Array.from({ length: 40 }, (_, i) => i + 1).map(number => (
                <button
                  key={number}
                  onClick={() => toggleNumber(number)}
                  className={`
                    w-8 h-8 rounded text-sm font-medium transition-colors
                    ${selectedNumbers.includes(number)
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }
                  `}
                >
                  {number}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleCreateManualTicket}
                disabled={selectedNumbers.length !== 5 || createManualTicketMutation.isPending}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white"
              >
                {createManualTicketMutation.isPending ? '생성 중...' : '티켓 생성'}
              </Button>
              <Button
                onClick={() => setSelectedNumbers([])}
                variant="outline"
                className="flex-1"
              >
                초기화
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 오늘의 추첨 결과 */}
      {todayDraw && (
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <h4 className="font-bold text-gray-800 mb-3">오늘의 당첨 번호</h4>
            <div className="flex items-center gap-2 mb-2">
              {todayDraw.winningNumbers.map((num: number, index: number) => (
                <div
                  key={index}
                  className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center text-sm font-bold"
                >
                  {num}
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-500">
              참가자: {todayDraw.totalParticipants}명 | 당첨자: {todayDraw.winnersCount}명
            </div>
          </CardContent>
        </Card>
      )}

      {/* 티켓 목록 */}
      <Card className="shadow-soft">
        <CardContent className="p-4">
          <h4 className="font-bold text-gray-800 mb-3">내 로또 티켓</h4>
          {tickets.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {tickets.slice(0, 10).map((ticket: LotteryTicket) => (
                <div key={ticket.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-1 mb-1">
                      {ticket.numbers.map((num, index) => (
                        <div
                          key={index}
                          className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold"
                        >
                          {num}
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(ticket.drawDate).toLocaleDateString('ko-KR')} 추첨
                      {ticket.isManualSelection && ' • 수동선택'}
                    </div>
                  </div>
                  <Badge className={getTicketBadgeColor(ticket, todayDraw)}>
                    {getTicketStatus(ticket, todayDraw)}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-ticket-alt text-gray-400"></i>
              </div>
              <p className="text-sm text-gray-500">아직 로또 티켓이 없습니다</p>
              <p className="text-xs text-gray-400 mt-1">설문에 참여해서 레벨업하면 티켓을 받을 수 있어요!</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 로또 안내 */}
      <Card className="shadow-soft">
        <CardContent className="p-4">
          <h4 className="font-bold text-gray-800 mb-2">로또 시스템 안내</h4>
          <div className="text-sm text-gray-600 space-y-1">
            <div>• 레벨업 시마다 로또 티켓 1장 지급</div>
            <div>• 매월 최대 100장까지 받을 수 있음 (레벨 100 달성 시)</div>
            <div>• 매일 00:00에 자동 추첨</div>
            <div>• 5개 맞춤: 50,000원, 4개 맞춤: 5,000원</div>
            <div>• 수동 번호 선택 가능</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}