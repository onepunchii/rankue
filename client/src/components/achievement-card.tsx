interface AchievementCardProps {
  icon: string;
  title: string;
  description: string;
  unlocked: boolean;
  category: 'voting' | 'streak' | 'special';
}

export default function AchievementCard({ icon, title, description, unlocked, category }: AchievementCardProps) {
  const getCategoryColor = () => {
    switch (category) {
      case 'voting': return 'from-blue-500 to-purple-600';
      case 'streak': return 'from-green-500 to-teal-600';
      case 'special': return 'from-yellow-500 to-orange-600';
      default: return 'from-gray-400 to-gray-600';
    }
  };

  return (
    <div className={`relative p-4 rounded-xl border transition-all duration-200 ${
      unlocked 
        ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-lg' 
        : 'bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800 opacity-60'
    }`}>
      <div className="flex items-center space-x-3">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getCategoryColor()} flex items-center justify-center ${
          unlocked ? '' : 'grayscale'
        }`}>
          <i className={`${icon} text-white text-lg`}></i>
        </div>
        <div className="flex-1">
          <h3 className={`font-semibold ${
            unlocked ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
          }`}>
            {title}
          </h3>
          <p className={`text-sm ${
            unlocked ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'
          }`}>
            {description}
          </p>
        </div>
        {unlocked && (
          <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
            <i className="fas fa-check text-white text-xs"></i>
          </div>
        )}
      </div>
    </div>
  );
}