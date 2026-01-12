interface RewardBadgeProps {
  rewardType: 'experience' | 'points' | 'prize' | 'sponsored';
  rewardAmount?: number;
  rewardDescription?: string;
  sponsorName?: string;
  prizePoolTotal?: number;
  winnerCount?: number;
  size?: 'sm' | 'md' | 'lg';
}

export default function RewardBadge({ 
  rewardType, 
  rewardAmount = 0, 
  rewardDescription, 
  sponsorName,
  prizePoolTotal = 0,
  winnerCount = 1,
  size = 'md' 
}: RewardBadgeProps) {
  const getRewardDisplay = () => {
    switch (rewardType) {
      case 'experience':
        return {
          icon: 'fas fa-star',
          text: `+${rewardAmount} EXP`,
          color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
          description: '경험치 획득'
        };
      case 'points':
        return {
          icon: 'fas fa-coins',
          text: `+${rewardAmount}P`,
          color: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400',
          description: '포인트 획득'
        };
      case 'prize':
        return {
          icon: 'fas fa-gift',
          text: `${winnerCount}명 추첨`,
          color: 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400',
          description: rewardDescription || `총 ${prizePoolTotal?.toLocaleString()}원 상품`
        };
      case 'sponsored':
        return {
          icon: 'fas fa-building',
          text: '후원 설문',
          color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
          description: sponsorName ? `${sponsorName} 후원` : '기업 후원 설문'
        };
      default:
        return {
          icon: 'fas fa-star',
          text: '+10 EXP',
          color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
          description: '경험치 획득'
        };
    }
  };

  const reward = getRewardDisplay();
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base'
  };

  return (
    <div className="space-y-1">
      <div className={`inline-flex items-center space-x-1 rounded-full font-semibold ${reward.color} ${sizeClasses[size]}`}>
        <i className={`${reward.icon} ${size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-lg' : 'text-sm'}`}></i>
        <span>{reward.text}</span>
      </div>
      {(size === 'md' || size === 'lg') && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {reward.description}
        </div>
      )}
    </div>
  );
}