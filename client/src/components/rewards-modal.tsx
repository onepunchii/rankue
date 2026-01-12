import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Gift, ShoppingCart, Star, Coffee, Ticket, Heart, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface RewardsModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface RewardItem {
  id: number;
  name: string;
  description: string;
  category: string;
  pointCost: number;
  icon: string;
  color: string;
  isActive: boolean;
}

export default function RewardsModal({ onClose, onSuccess }: RewardsModalProps) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rewards = [], isLoading } = useQuery<RewardItem[]>({
    queryKey: ['/api/rewards'],
  });

  const purchaseRewardMutation = useMutation({
    mutationFn: async (rewardId: number) => {
      return apiRequest('/api/rewards/purchase', {
        method: 'POST',
        body: { rewardId },
      });
    },
    onSuccess: () => {
      toast({
        title: "리워드 구매 완료",
        description: "리워드를 성공적으로 구매했습니다!",
      });
      onSuccess();
    },
    onError: (error: any) => {
      let friendlyMessage = "리워드 구매에 실패했습니다.";
      let friendlyTitle = "구매 실패";

      if (error.message.includes("Insufficient points")) {
        friendlyTitle = "포인트 부족";
        friendlyMessage = "보유한 포인트가 부족합니다. 포인트를 확인해주세요.";
      } else if (error.message.includes("Reward not found")) {
        friendlyTitle = "리워드를 찾을 수 없음";
        friendlyMessage = "선택한 리워드를 찾을 수 없습니다.";
      }

      toast({
        title: friendlyTitle,
        description: friendlyMessage,
        variant: "destructive",
      });
    },
  });

  const getIconComponent = (iconName: string) => {
    switch (iconName) {
      case 'fas fa-coffee':
        return <Coffee className="h-6 w-6" />;
      case 'fas fa-gift':
        return <Gift className="h-6 w-6" />;
      case 'fas fa-dice':
        return <Ticket className="h-6 w-6" />;
      case 'fas fa-heart':
        return <Heart className="h-6 w-6" />;
      case 'fas fa-mobile-alt':
        return <Smartphone className="h-6 w-6" />;
      default:
        return <Gift className="h-6 w-6" />;
    }
  };

  const getCategoryName = (category: string) => {
    switch (category) {
      case 'voucher':
        return '쿠폰';
      case 'mobile':
        return '모바일';
      case 'lottery':
        return '로또';
      case 'charity':
        return '기부';
      default:
        return category;
    }
  };

  const categories = [
    { id: 'all', name: '전체', icon: Star },
    { id: 'voucher', name: '쿠폰', icon: Gift },
    { id: 'mobile', name: '모바일', icon: Smartphone },
    { id: 'lottery', name: '로또', icon: Ticket },
    { id: 'charity', name: '기부', icon: Heart },
  ];

  const filteredRewards = selectedCategory === 'all'
    ? rewards
    : rewards.filter(reward => reward.category === selectedCategory);

  const canAfford = (cost: number) => {
    return (user?.personalPoints || 0) >= cost;
  };

  const handlePurchase = (rewardId: number, cost: number) => {
    if (!canAfford(cost)) {
      toast({
        title: "포인트 부족",
        description: "포인트가 부족합니다. 설문 참여로 포인트를 획득해보세요!",
        variant: "destructive",
      });
      return;
    }

    purchaseRewardMutation.mutate(rewardId);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto glass-card-strong">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center">
            <ShoppingCart className="mr-2 h-5 w-5 text-pink-500" />
            리워드 상점
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* User Points Display */}
        <div className="bg-gradient-to-r from-pink-500 to-pink-600 text-white p-4 rounded-xl mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">내 포인트</p>
              <p className="text-2xl font-bold">{user?.personalPoints || 0}P</p>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-90">레벨 {user?.level || 1}</p>
              <p className="text-lg font-semibold">{user?.experience || 0} EXP</p>
            </div>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors ${selectedCategory === category.id
                  ? 'bg-pink-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
            >
              <category.icon className="h-4 w-4 mr-1" />
              {category.name}
            </button>
          ))}
        </div>

        {/* Rewards Grid */}
        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 mx-auto"></div>
            <p className="mt-2 text-gray-600 dark:text-gray-400">리워드 불러오는 중...</p>
          </div>
        ) : filteredRewards.length === 0 ? (
          <div className="text-center py-8">
            <Gift className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">선택한 카테고리에 리워드가 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRewards.map((reward) => (
              <div
                key={reward.id}
                className={`border rounded-xl p-4 transition-all ${canAfford(reward.pointCost)
                    ? 'border-gray-200 dark:border-gray-600 hover:border-pink-300 dark:hover:border-pink-500'
                    : 'border-gray-200 dark:border-gray-600 opacity-60'
                  }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: `${reward.color}20` }}
                  >
                    <div style={{ color: reward.color }}>
                      {getIconComponent(reward.icon)}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {getCategoryName(reward.category)}
                  </Badge>
                </div>

                <h3 className="font-semibold text-gray-800 dark:text-white mb-2">
                  {reward.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  {reward.description}
                </p>

                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-yellow-600">
                    {reward.pointCost}P
                  </span>
                  <Button
                    onClick={() => handlePurchase(reward.id, reward.pointCost)}
                    disabled={!canAfford(reward.pointCost) || purchaseRewardMutation.isPending}
                    className={`text-xs px-4 py-2 ${canAfford(reward.pointCost)
                        ? 'bg-pink-500 hover:bg-pink-600 text-white'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                  >
                    {purchaseRewardMutation.isPending ? '구매 중...' : '구매하기'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}