import { useLocation } from "wouter";
import { useState, useEffect } from "react";

export default function BottomNav() {
  const [location, setLocation] = useLocation();
  const [showTooltip, setShowTooltip] = useState(true);

  // localStorage에서 툴팁 표시 여부 확인
  useEffect(() => {
    const tooltipDismissed = localStorage.getItem('persona-tooltip-dismissed');
    if (tooltipDismissed === 'true') {
      setShowTooltip(false);
    }
  }, []);

  const dismissTooltip = () => {
    setShowTooltip(false);
    localStorage.setItem('persona-tooltip-dismissed', 'true');
  };

  const navItems = [
    { path: "/", icon: "fas fa-home", label: "홈" },
    { path: "/surveys", icon: "fas fa-poll", label: "설문" },
    { path: "/persona", icon: "fas fa-user-circle", label: "페르소나" },
    { path: "/results", icon: "fas fa-chart-bar", label: "결과" },
    { path: "/profile", icon: "fas fa-cog", label: "내정보" },
  ];

  return (
    <nav className="fixed bottom-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      <div
        className="pointer-events-auto flex items-center justify-around w-full max-w-md rounded-[24px] shadow-2xl backdrop-blur-xl bg-black/40 border border-white/10 px-2 py-3"
      >
        {navItems.map((item) => {
          const isActive = location === item.path ||
            (item.path === "/surveys" && location.startsWith("/surveys")) ||
            (item.path === "/category" && location.startsWith("/category/"));

          return (
            <div key={item.path} className="relative group">
              {/* 페르소나 말풍선 - Styled for new theme */}
              {item.path === "/persona" && showTooltip && (
                <div className="absolute -top-14 left-1/2 transform -translate-x-1/2 whitespace-nowrap animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="bg-primary text-primary-foreground text-xs font-bold px-3 py-2 rounded-xl shadow-xl flex items-center gap-2">
                    <span>🎯 나의 성향 분석</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        dismissTooltip();
                      }}
                      className="text-primary-foreground/70 hover:text-white"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                  {/* 말풍선 꼬리 */}
                  <div className="absolute left-1/2 transform -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-primary rotate-45 rounded-sm"></div>
                </div>
              )}

              <button
                onClick={() => setLocation(item.path)}
                className={`
                  relative flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-all duration-300 ease-spring
                  ${isActive
                    ? 'bg-primary/20 text-primary shadow-sm scale-110'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}
                `}
              >
                <i className={`${item.icon} text-lg mb-0.5 transition-transform ${isActive ? 'scale-105' : ''}`}></i>

                {/* Active Indicator Dot */}
                {isActive && (
                  <span className="absolute -bottom-1 w-1 h-1 bg-primary rounded-full animate-in fade-in zoom-in duration-300"></span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
