import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";

interface FriendReferral {
  id: number;
  referrerId: string;
  referredId: string | null;
  referralCode: string;
  isUsed: boolean;
  rewardsClaimed: boolean;
  createdAt: string;
}

interface ReferralCodeResponse {
  referralCode: string;
}

interface FriendReferralCardProps {
  userId: string;
}

export default function FriendReferralCard({ userId }: FriendReferralCardProps) {
  const [inputCode, setInputCode] = useState("");
  const [showUseCode, setShowUseCode] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const canUseLottery = user?.isVerified || (user?.ageGroup && user?.gender && user?.region);

  // Get user's referral code
  const { data: myReferralCode, isLoading: isLoadingCode } = useQuery<ReferralCodeResponse>({
    queryKey: ["/api/referral/code"],
    enabled: !!canUseLottery,
  });

  // Get user's referrals
  const { data: myReferrals = [], isLoading: isLoadingReferrals } = useQuery<FriendReferral[]>({
    queryKey: ["/api/referral/my-referrals"],
    enabled: !!canUseLottery,
  });

  // Use referral code mutation
  const useCodeMutation = useMutation({
    mutationFn: async (code: string) => {
      return await apiRequest("/api/referral/use", {
        method: "POST",
        body: JSON.stringify({ code }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (data) => {
      toast({
        title: "친구 추천 성공!",
        description: "로또 티켓 5장을 받았습니다! 친구도 3장을 받았어요.",
        className: "bg-green-50 border-green-200 text-green-800",
      });
      setInputCode("");
      setShowUseCode(false);
      queryClient.invalidateQueries({ queryKey: ["/api/referral/my-referrals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lottery/tickets"] });
    },
    onError: (error: any) => {
      toast({
        title: "추천 코드 사용 실패",
        description: error.message || "유효하지 않거나 이미 사용된 코드입니다.",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: "복사 완료!",
        description: "친구 추천 코드가 클립보드에 복사되었습니다.",
        className: "bg-blue-50 border-blue-200 text-blue-800",
      });
    });
  };

  const shareReferralCode = () => {
    const shareText = `Polli 설문 플랫폼에 함께 참여해요! 
내 추천 코드: ${myReferralCode?.referralCode}
당신은 로또 5장, 저는 3장을 받을 수 있어요! 🎟️`;

    if (navigator.share) {
      navigator.share({
        title: "Polli 친구 추천",
        text: shareText,
      });
    } else {
      copyToClipboard(shareText);
    }
  };

  const successfulReferrals = myReferrals.filter((r: FriendReferral) => r.isUsed);

  // 게스트 모드이거나 프로필이 완료되지 않은 경우 카드를 숨김
  if (!canUseLottery) {
    return null;
  }

  if (isLoadingCode || isLoadingReferrals) {
    return (
      <Card className="glass-card-strong border-0 shadow-lg bg-gradient-to-br from-white/80 to-pink-50/80 dark:from-gray-800/80 dark:to-gray-700/80">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-0 shadow-xl overflow-hidden relative group bg-black/40">
      {/* Background simplifed - subtle purple glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none"></div>

      <CardHeader className="pb-2 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <i className="fas fa-gift text-purple-400 text-lg"></i>
            </div>
            <div>
              <CardTitle className="text-base font-bold text-white uppercase tracking-wider">
                친구 초대 혜택
              </CardTitle>
              <p className="text-[10px] font-medium text-white/40 mt-0.5">
                함께하면 행운이 두 배
              </p>
            </div>
          </div>
          <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px] px-2 py-0.5 font-medium">
            <i className="fas fa-ticket-alt mr-1"></i>
            최대 5장
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-4 relative z-10">
        {/* My Referral Code */}
        <div className="rounded-2xl bg-white/5 border border-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest flex items-center">
              <i className="fas fa-fingerprint text-purple-400 mr-2"></i>
              내 추천 코드
            </h3>
            <span className="text-[10px] font-medium text-white/50 bg-white/5 px-2 py-1 rounded">
              친구 가입 시 로또 3장
            </span>
          </div>

          <div className="flex items-center space-x-2 mb-4">
            <div className="flex-1 bg-black/20 p-4 rounded-xl border border-white/5 flex items-center justify-center group/code transition-colors hover:bg-black/30">
              <span className="font-mono text-xl font-bold text-white tracking-[0.2em]">
                {myReferralCode?.referralCode || "LOADING"}
              </span>
            </div>
            <Button
              size="icon"
              onClick={() => copyToClipboard(myReferralCode?.referralCode || "")}
              className="bg-white text-black hover:bg-gray-200 border-0 h-14 w-14 rounded-xl transition-all shadow-lg active:scale-95"
            >
              <i className="fas fa-copy"></i>
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={shareReferralCode}
              className="bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/5 h-10 text-xs font-medium"
            >
              <i className="fas fa-share-alt mr-2"></i>
              공유하기
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowUseCode(!showUseCode)}
              className={`border border-white/5 h-10 text-xs font-medium transition-all ${showUseCode ? 'bg-purple-500 text-white border-purple-500' : 'bg-white/5 text-purple-400 hover:bg-purple-500/10'}`}
            >
              <i className="fas fa-keyboard mr-2"></i>
              코드 입력
            </Button>
          </div>
        </div>

        {/* Use Referral Code Input Section */}
        {showUseCode && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-1"
          >
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest">
                친구 코드 입력
              </h3>
            </div>

            <div className="flex space-x-2">
              <Input
                placeholder="코드 입력"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-purple-500 transition-colors text-center font-mono uppercase tracking-widest h-12"
                maxLength={8}
              />
              <Button
                onClick={() => useCodeMutation.mutate(inputCode)}
                disabled={!inputCode || useCodeMutation.isPending}
                className="bg-purple-500 hover:bg-purple-600 text-white border-0 shadow-lg font-bold h-12 px-6"
              >
                {useCodeMutation.isPending ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : (
                  "확인"
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {/* Current Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 p-4 rounded-xl border border-white/5 text-center">
            <div className="text-2xl font-black text-white mb-1">
              {successfulReferrals.length}
            </div>
            <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
              초대 성공
            </div>
          </div>
          <div className="bg-white/5 p-4 rounded-xl border border-white/5 text-center">
            <div className="text-2xl font-black text-purple-400 mb-1">
              {successfulReferrals.length * 3}
            </div>
            <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
              받은 티켓
            </div>
          </div>
        </div>

        {/* Recent List */}
        {successfulReferrals.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-white/5">
            <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2 px-1">
              최근 활동
            </h4>
            {successfulReferrals.slice(0, 3).map((referral: FriendReferral) => (
              <div key={referral.id} className="flex items-center justify-between py-3 px-4 bg-white/[0.02] rounded-lg border border-white/5">
                <div className="flex items-center space-x-3">
                  <div className="w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
                  <span className="text-xs font-medium text-white/60">
                    {new Date(referral.createdAt).toLocaleDateString('ko-KR')}
                  </span>
                </div>
                <span className="text-xs font-bold text-purple-400">
                  +3 Tickets
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}