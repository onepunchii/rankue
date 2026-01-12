import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Lock, Sparkles, ShieldCheck, ArrowRight, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';

interface GuestRestrictionModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature?: string;
  description?: string;
}

export default function GuestRestrictionModal({
  isOpen,
  onClose,
  feature = "AI 설문 생성",
  description = "AI 설문 생성은 회원만 사용할 수 있습니다. 회원가입하고 다양한 기능을 이용해보세요!"
}: GuestRestrictionModalProps) {
  const [, setLocation] = useLocation();

  const handleUpgrade = () => {
    onClose();
    setLocation('/signup');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md mx-auto bg-transparent border-0 shadow-none p-0 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="glass-card-strong border border-white/10 bg-black/80 backdrop-blur-3xl overflow-hidden relative"
        >
          {/* Background Decorative Blobs */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-600/30 blur-[60px] rounded-full text-purple-600"></div>
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-600/20 blur-[60px] rounded-full text-purple-600"></div>

          <div className="p-8 relative z-10">
            <DialogHeader className="text-left mb-8">
              <div className="w-14 h-14 bg-purple-600 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(147,51,234,0.3)] animate-pulse">
                <Lock className="w-6 h-6 text-white" />
              </div>

              <DialogTitle className="text-2xl font-black text-white italic tracking-tighter mb-3 uppercase">
                회원가입이 필요합니다
              </DialogTitle>

              <div className="text-white/60 text-sm font-medium leading-relaxed">
                <p>{description}</p>
              </div>
            </DialogHeader>

            <div className="space-y-3 mb-8">
              {[
                { icon: Sparkles, text: 'AI 기반 스마트 설문 생성', color: 'text-purple-400' },
                { icon: ShieldCheck, text: '안전한 익명 투표 및 데이터 보안', color: 'text-emerald-400' },
                { icon: ArrowRight, text: '실시간 분석 리포트 무제한 제공', color: 'text-blue-400' },
              ].map((item, index) => (
                <div key={index} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                  <span className="text-xs font-bold text-white/70 uppercase tracking-tight">
                    {item.text}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <Button
                onClick={handleUpgrade}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-purple-500/20 group transition-all"
              >
                회원가입하고 시작하기
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                variant="ghost"
                onClick={onClose}
                className="w-full text-white/40 hover:text-white hover:bg-white/5 h-12 rounded-xl font-black uppercase tracking-widest text-[10px]"
              >
                나중에 하기
              </Button>
            </div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}