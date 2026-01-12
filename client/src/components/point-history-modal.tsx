import { useQuery } from "@tanstack/react-query";
import { X, TrendingUp, TrendingDown, Clock, Gift, Send, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface PointHistoryModalProps {
  onClose: () => void;
}

interface PointTransaction {
  id: number;
  userId: string;
  type: 'earn' | 'spend' | 'send' | 'receive';
  amount: number;
  description: string;
  rewardType?: string;
  relatedUserId?: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

export default function PointHistoryModal({ onClose }: PointHistoryModalProps) {
  const { data: transactions = [], isLoading } = useQuery<PointTransaction[]>({
    queryKey: ['/api/user/point-transactions'],
  });

  const getTransactionIcon = (type: string, amount: number) => {
    if (type === 'earn') return <TrendingUp className="h-5 w-5 text-green-500" />;
    if (type === 'spend') return <Gift className="h-5 w-5 text-red-500" />;
    if (type === 'send') return <ArrowUpRight className="h-5 w-5 text-blue-500" />;
    if (type === 'receive') return <ArrowDownLeft className="h-5 w-5 text-green-500" />;
    return <Clock className="h-5 w-5 text-gray-500" />;
  };

  const getTransactionColor = (type: string) => {
    if (type === 'earn' || type === 'receive') return 'text-green-600';
    if (type === 'spend' || type === 'send') return 'text-red-600';
    return 'text-gray-600';
  };

  const getTransactionTitle = (type: string) => {
    switch (type) {
      case 'earn':
        return '포인트 적립';
      case 'spend':
        return '포인트 사용';
      case 'send':
        return '포인트 전송';
      case 'receive':
        return '포인트 받음';
      default:
        return '포인트 거래';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="outline" className="text-green-600 border-green-600">완료</Badge>;
      case 'pending':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-600">대기</Badge>;
      case 'failed':
        return <Badge variant="outline" className="text-red-600 border-red-600">실패</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto glass-card-strong">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center">
            <Clock className="mr-2 h-5 w-5 text-pink-500" />
            포인트 사용 내역
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 mx-auto"></div>
            <p className="mt-2 text-gray-600 dark:text-gray-400">내역 불러오는 중...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">포인트 사용 내역이 없습니다.</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
              설문 참여나 리워드 구매로 포인트를 활용해보세요!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="border border-gray-200 dark:border-gray-600 rounded-xl p-4 glass-card-light"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className="mt-1">
                      {getTransactionIcon(transaction.type, transaction.amount)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="font-medium text-gray-800 dark:text-white">
                          {getTransactionTitle(transaction.type)}
                        </h4>
                        {getStatusBadge(transaction.status)}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {transaction.description}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        {format(new Date(transaction.createdAt), 'yyyy년 MM월 dd일 HH:mm')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-semibold ${getTransactionColor(transaction.type)}`}>
                      {transaction.amount > 0 ? '+' : ''}{transaction.amount}P
                    </div>
                    {transaction.rewardType && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {transaction.rewardType}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}