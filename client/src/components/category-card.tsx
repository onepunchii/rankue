import { useLocation } from "wouter";

interface CategoryCardProps {
  category: string;
  title: string;
  description: string;
  points: number;
  activeCount: number;
  icon: string;
  color: 'yellow' | 'green' | 'red' | 'blue' | 'purple' | 'emerald';
}

export default function CategoryCard({
  category,
  title,
  description,
  points,
  activeCount,
  icon,
  color,
}: CategoryCardProps) {
  const [, setLocation] = useLocation();

  // 카테고리별 색상 정의
  const getColorConfig = (color: string) => {
    switch (color) {
      case 'yellow': // Fun Poll
        return {
          iconGradient: 'linear-gradient(135deg, rgba(255, 193, 7, 0.9) 0%, rgba(255, 235, 59, 0.9) 100%)',
          badgeGradient: 'linear-gradient(135deg, rgba(255, 193, 7, 0.8) 0%, rgba(255, 235, 59, 0.8) 100%)'
        };
      case 'green': // Life Poll  
        return {
          iconGradient: 'linear-gradient(135deg, rgba(76, 175, 80, 0.9) 0%, rgba(129, 199, 132, 0.9) 100%)',
          badgeGradient: 'linear-gradient(135deg, rgba(76, 175, 80, 0.8) 0%, rgba(129, 199, 132, 0.8) 100%)'
        };
      case 'red': // Deep Poll
        return {
          iconGradient: 'linear-gradient(135deg, rgba(244, 67, 54, 0.9) 0%, rgba(239, 83, 80, 0.9) 100%)',
          badgeGradient: 'linear-gradient(135deg, rgba(244, 67, 54, 0.8) 0%, rgba(239, 83, 80, 0.8) 100%)'
        };
      case 'blue': // Location Poll
        return {
          iconGradient: 'linear-gradient(135deg, rgba(33, 150, 243, 0.9) 0%, rgba(100, 181, 246, 0.9) 100%)',
          badgeGradient: 'linear-gradient(135deg, rgba(33, 150, 243, 0.8) 0%, rgba(100, 181, 246, 0.8) 100%)'
        };
      case 'purple': // Business Poll
        return {
          iconGradient: 'linear-gradient(135deg, rgba(139, 92, 246, 0.9) 0%, rgba(236, 72, 153, 0.9) 100%)',
          badgeGradient: 'linear-gradient(135deg, rgba(139, 92, 246, 0.8) 0%, rgba(236, 72, 153, 0.8) 100%)'
        };
      case 'emerald': // Policy Poll
        return {
          iconGradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.9) 0%, rgba(52, 211, 153, 0.9) 100%)',
          badgeGradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.8) 0%, rgba(52, 211, 153, 0.8) 100%)'
        };
      default:
        return {
          iconGradient: 'linear-gradient(135deg, rgba(245, 73, 144, 0.9) 0%, rgba(245, 103, 164, 0.9) 100%)',
          badgeGradient: 'linear-gradient(135deg, rgba(245, 73, 144, 0.8) 0%, rgba(245, 103, 164, 0.8) 100%)'
        };
    }
  };

  const colorConfig = getColorConfig(color);

  // 기업 카테고리용 특별 스타일
  const isBusinessCategory = category === 'business';

  if (isBusinessCategory) {
    return (
      <div className="w-full relative">
        <style>{`
          @keyframes logoFlow {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .business-card-wrapper {
            position: relative;
            background: linear-gradient(135deg, rgba(245, 73, 144, 1), rgba(139, 92, 246, 1));
            border-radius: 16px;
            padding: 2px;
            cursor: pointer;
            transition: all 0.3s ease;
          }
          .business-card-wrapper:hover {
            transform: scale(1.02);
          }
          .business-card-inner {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 14px;
            padding: 16px;
            position: relative;
            z-index: 10;
          }
          .dark .business-card-inner {
            background: rgba(31, 41, 55, 0.95);
          }
          .business-card-blur1,
          .business-card-blur2 {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border-radius: 16px;
            background: inherit;
            z-index: -1;
          }
          .business-card-blur1 {
            filter: blur(4px);
          }
          .business-card-blur2 {
            filter: blur(12px);
          }
          .logo-stream-container {
            position: relative;
            width: 80px;
            height: 24px;
            overflow: hidden;
            margin-right: 8px;
          }
          .logo-stream-wrapper {
            display: flex;
            align-items: center;
            gap: 16px;
            animation: logoFlow 20s linear infinite;
            width: fit-content;
          }
          .logo-stream-duplicate {
            display: flex;
            align-items: center;
            gap: 16px;
          }
          .logo-item {
            flex-shrink: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.7;
            transition: opacity 0.3s ease;
          }
          .logo-item:hover {
            opacity: 1;
          }
        `}</style>
        
        <button
          onClick={() => setLocation(`/category/${category}`)}
          className="w-full business-card-wrapper"
        >
          <div className="business-card-blur1"></div>
          <div className="business-card-blur2"></div>
          <div className="business-card-inner">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg relative"
                  style={{ 
                    background: 'linear-gradient(135deg, rgba(245, 73, 144, 1), rgba(139, 92, 246, 1))',
                  }}
                >
                  <i className={`${icon} text-white text-lg relative z-10`}></i>
                </div>
                <div className="text-left flex-1">
                  <h4 className="font-semibold text-mobile-base text-gray-800 dark:text-white">{title}</h4>
                  <p className="text-mobile-sm text-gray-600 dark:text-gray-300">{description}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span 
                      className="text-mobile-xs text-white px-2 py-1 rounded-full font-medium"
                      style={{ 
                        background: 'linear-gradient(135deg, rgba(245, 73, 144, 1), rgba(139, 92, 246, 1))'
                      }}
                    >
                      +{points}P
                    </span>
                    <div className="flex items-center space-x-1">
                      <div 
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: 'linear-gradient(135deg, rgba(245, 73, 144, 1), rgba(139, 92, 246, 1))' }}
                      ></div>
                      <span className="text-mobile-xs text-gray-600 dark:text-gray-300 font-medium">
                        {activeCount}개 진행중
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* 대기업 로고 스트림 */}
              <div className="flex items-center">
                <div className="logo-stream-container">
                  <div className="logo-stream-wrapper">
                    <div className="logo-stream-duplicate">
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/89.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/90.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/92.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/94.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/95.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/96.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/97.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/98.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/99.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                    </div>
                    <div className="logo-stream-duplicate">
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/89.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/90.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/92.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/94.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/95.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/96.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/97.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/98.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                      <div className="logo-item" title="기업 로고">
                        <img src="/images/logos/99.png" alt="기업 로고" className="w-8 h-8 object-contain" />
                      </div>
                    </div>
                  </div>
                </div>
                <i className="fas fa-chevron-right text-gray-500 dark:text-gray-400 ml-2"></i>
              </div>
            </div>
          </div>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setLocation(`/category/${category}`)}
      className="w-full glass-card p-4 hover:bg-opacity-30 transition-all duration-300 transform hover:scale-105"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg"
            style={{ 
              background: colorConfig.iconGradient
            }}
          >
            <i className={`${icon} text-white text-lg`}></i>
          </div>
          <div className="text-left">
            <h4 className="font-semibold text-mobile-base text-gray-800 dark:text-white">{title}</h4>
            <p className="text-mobile-sm text-gray-600 dark:text-gray-300">{description}</p>
            <div className="flex items-center space-x-2 mt-1">
              <span 
                className="text-mobile-xs text-white px-2 py-1 rounded-full font-medium"
                style={{ 
                  background: colorConfig.badgeGradient
                }}
              >
                +{points}P
              </span>
              <div className="flex items-center space-x-1">
                <div 
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: colorConfig.iconGradient }}
                ></div>
                <span className="text-mobile-xs text-gray-600 dark:text-gray-300 font-medium">
                  {activeCount}개 진행중
                </span>
              </div>
            </div>
          </div>
        </div>
        <i className="fas fa-chevron-right text-gray-500 dark:text-gray-400"></i>
      </div>
    </button>
  );
}
