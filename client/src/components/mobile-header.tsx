import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import Shuffle from "@/components/ui/shuffle-text";
import { useLocation } from "wouter";
import { ArrowLeft, Bell } from "lucide-react";

export default function MobileHeader({ showBack = false }: { showBack?: boolean }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <header className="sticky top-0 z-50 w-full bg-background/0 backdrop-blur-xl supports-[backdrop-filter]:bg-background/0">
      <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {showBack ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/')}
              className="w-10 h-10 p-0 text-white/40 hover:text-white hover:bg-white/5 rounded-2xl transition-all"
            >
              <ArrowLeft className="h-6 w-6" />
            </Button>
          ) : (
            <div className="flex items-center cursor-pointer" onClick={() => window.location.href = '/'}>
              <Shuffle
                text="POLLI"
                className="text-2xl font-black text-primary tracking-tighter"
                shuffleDirection="up"
                shuffleTimes={3}
                loop={true}
                loopDelay={5}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group">
            <button
              onClick={() => {
                const lotterySection = document.getElementById('polli-lottery-section');
                if (lotterySection) {
                  lotterySection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                  window.location.href = '/#polli-lottery-section';
                }
              }}
              className="w-8 h-8 rounded-full bg-secondary border border-border/50 hover:bg-secondary/80 flex items-center justify-center transition-colors text-primary"
            >
              <i className="fas fa-gift text-sm"></i>
            </button>
            {(user?.availableLotteryTickets || 0) > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-background">
                {user?.availableLotteryTickets}
              </span>
            )}
          </div>

          <div className="h-8 flex items-center gap-1.5 px-3 rounded-full bg-secondary text-secondary-foreground border border-border/50 text-xs font-semibold">
            <i className="fas fa-star text-[10px] text-purple-500"></i>
            <span>Lv.{user?.level || 1}</span>
          </div>

          <button
            className="w-8 h-8 rounded-full bg-secondary border border-border/50 hover:bg-secondary/80 flex items-center justify-center transition-colors text-primary"
            onClick={() => setLocation('/notifications')} // Notification page routing
          >
            <Bell className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto h-[2px] bg-secondary w-full">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{
            width: `${Math.min(100, ((user?.experience || 0) % 100))}%`
          }}
        ></div>
      </div>
    </header>
  );
}
