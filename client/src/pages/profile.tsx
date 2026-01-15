import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Camera, Pencil } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LotterySectionRedesigned from "@/components/lottery-section-redesigned";
import PersonalityAnalysisCard from "@/components/personality-analysis-card";

import { NicknameEditDialog } from "@/components/NicknameEditDialog";
import NotificationSettingsModal from "@/components/notification-settings-modal";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { motion } from "framer-motion";

import type { Survey } from "@shared/schema";

// 게스트 프로필 컴포넌트
function GuestProfile() {
  const { login } = useAuth();
  const [isBusinessInfoExpanded, setIsBusinessInfoExpanded] = useState(false);

  return (
    <div className="min-h-screen bg-black transition-colors relative overflow-hidden">
      {/* Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[120px] rounded-full animate-pulse"></div>
        <div className="absolute bottom-[20%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full"></div>
      </div>
      <MobileHeader />

      <main className="max-w-md mx-auto pb-32">
        <section className="px-4 py-6">
          <Card className="glass-card-strong border-0 shadow-lg bg-gradient-to-br from-white/90 to-pink-50/90 dark:from-gray-800/80 dark:to-gray-700/80">
            <CardContent className="p-6 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-pink-100 to-rose-200 dark:from-pink-900/30 dark:to-rose-800/30 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                <i className="fas fa-user-circle text-3xl text-pink-600"></i>
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                로그인이 필요합니다
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                로그인하면 더 많은 기능을 이용할 수 있습니다
              </p>

              <div className="space-y-4">
                <Button
                  onClick={() => login('google')}
                  className="w-full bg-white text-black hover:bg-gray-100 py-7 rounded-2xl shadow-lg transition-all duration-300 font-black uppercase tracking-widest text-xs"
                >
                  <i className="fab fa-google mr-2 text-red-500"></i>
                  Google로 계속하시겠습니까?
                </Button>

                <Button
                  onClick={() => login('kakao')}
                  className="w-full bg-[#FEE500] text-[#3c1e1e] hover:bg-[#FEE500]/90 py-7 rounded-2xl shadow-lg transition-all duration-300 font-black uppercase tracking-widest text-xs"
                >
                  <i className="fas fa-comment mr-2"></i>
                  카카오로 계속하시겠습니까?
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="px-4 mb-10">
          <div className="flex items-center space-x-2 mb-6 px-4">
            <i className="fas fa-gift text-sm text-purple-400"></i>
            <h2 className="text-base font-black text-white/70 uppercase tracking-widest">회원 혜택</h2>
          </div>

          <div className="grid grid-cols-2 gap-4 px-2">
            {[
              { icon: 'poll', title: '설문 참여', desc: '의견 공유하고 보상 획득' },
              { icon: 'coins', title: '포인트 적립', desc: '실시간 활동 보상' },
              { icon: 'trophy', title: '로또 참여', desc: '주간 상금 당첨 기회' },
              { icon: 'plus', title: '설문 생성', desc: '직접 이슈 제기하기' }
            ].map((benefit, i) => (
              <Card key={i} className="glass-card border-white/5 bg-white/[0.02] hover:bg-white/5 transition-all group overflow-hidden">
                <CardContent className="p-5 relative">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-purple-600/5 -mr-8 -mt-8 rounded-full blur-xl group-hover:bg-purple-600/10 transition-colors"></div>
                  <div className="w-10 h-10 bg-purple-600/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <i className={`fas fa-${benefit.icon} text-sm text-purple-400`}></i>
                  </div>
                  <div className="text-base font-black text-white mb-2 uppercase tracking-tight">{benefit.title}</div>
                  <div className="text-sm font-bold text-white/40 uppercase tracking-tighter">{benefit.desc}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Business Info Footer */}
        <footer className="px-6 pb-12 text-center">
          <button
            onClick={() => setIsBusinessInfoExpanded(!isBusinessInfoExpanded)}
            className="flex items-center justify-center space-x-2 w-full py-4 border-t border-white/5 group"
          >
            <span className="text-xs font-bold text-white/40 group-hover:text-white/60 transition-colors">(주)제이 에이치 스퀘어 사업자 정보</span>
            <i className={`fas fa-chevron-${isBusinessInfoExpanded ? 'up' : 'down'} text-[10px] text-white/20 transition-transform`}></i>
          </button>

          {isBusinessInfoExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-2 py-4 text-left px-4 glass-card border-white/5 mb-8"
            >
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black text-white/20 uppercase tracking-tighter">Company Name</span>
                <span className="text-[12px] font-bold text-white/60">제이 에이치 스퀘어</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black text-white/20 uppercase tracking-tighter">CEO</span>
                <span className="text-[12px] font-bold text-white/60">정현경</span>
              </div>
              <div className="flex flex-col space-y-1">
                <span className="text-[11px] font-black text-white/20 uppercase tracking-tighter">Address</span>
                <span className="text-[12px] font-bold text-white/60 leading-relaxed">서울특별시 강남구 선릉로90길 66 202호</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black text-white/20 uppercase tracking-tighter">Business License</span>
                <span className="text-[12px] font-bold text-white/60">218-18-70325</span>
              </div>
            </motion.div>
          )}

          <div className="text-[10px] font-black text-white/10 uppercase tracking-[4px] mt-4">
            POLLI PLATFORM © 2024
          </div>
        </footer>
      </main>

      <BottomNav />
    </div>
  );
}

export default function Profile() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  // useAuth 훅 사용
  const { user: authUser, logout, login, loading: isAuthLoading } = useAuth();

  // States for point wallet
  const [transferAmount, setTransferAmount] = useState("");
  const [receiverEmail, setReceiverEmail] = useState("");
  const [isWalletOpen, setIsWalletOpen] = useState(false);

  // State for notification settings modal
  const [isNotificationSettingsOpen, setIsNotificationSettingsOpen] = useState(false);

  // States for collapsible sections
  const [isPrivacyExpanded, setIsPrivacyExpanded] = useState(false);
  const [isHelpExpanded, setIsHelpExpanded] = useState(false);
  const [isBusinessInfoExpanded, setIsBusinessInfoExpanded] = useState(false);

  // 참여 정보 가져오기
  const { data: participations = [] } = useQuery<any[]>({
    queryKey: [queryKeys.AUTH_USER_PARTICIPATIONS],
    queryFn: () => apiRequest(queryKeys.AUTH_USER_PARTICIPATIONS),
    enabled: !!authUser && !authUser.isGuest
  });

  // State for avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);

  const convertToWebP = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas context failed')); return; }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Conversion failed'));
        }, 'image/webp', 0.8);
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleAvatarClick = () => {
    if (!isAvatarUploading) fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value to allow re-selection of same file if it fails
    if (fileInputRef.current) fileInputRef.current.value = '';

    setIsAvatarUploading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    try {
      const webpBlob = await convertToWebP(file);
      const formData = new FormData();
      formData.append('avatar', webpBlob, 'avatar.webp');

      await apiRequest(queryKeys.USER_AVATAR, {
        method: "POST",
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      await queryClient.invalidateQueries({ queryKey: [queryKeys.AUTH_PROFILE] });
      await queryClient.invalidateQueries({ queryKey: [queryKeys.AUTH_USER] });

      toast({ title: "프로필 이미지 변경 완료" });
    } catch (e: any) {
      console.error("Avatar upload error:", e);
      let errorMsg = "이미지 변경 실패";
      if (e.name === 'AbortError') errorMsg = "업로드 시간 초과";
      toast({ title: errorMsg, description: "잠시 후 다시 시도해주세요.", variant: "destructive" });
    } finally {
      setIsAvatarUploading(false);
      clearTimeout(timeoutId);
    }
  };

  // 참여 완료한 설문 ID 목록 생성
  const participatedSurveyIds = Array.isArray(participations) ? participations
    .filter((p: any) => p.completedAt)
    .map((p: any) => p.surveyId) : [];

  // 생성한 설문 가져오기
  const { data: createdSurveys = [] } = useQuery<Survey[]>({
    queryKey: [queryKeys.AUTH_USER_CREATED_SURVEYS],
    queryFn: () => apiRequest(queryKeys.AUTH_USER_CREATED_SURVEYS),
    enabled: !!authUser && !authUser.isGuest
  });

  // 로또 티켓 가져오기
  const { data: lotteryTickets = [] } = useQuery<any[]>({
    queryKey: [queryKeys.LOTTERY_TICKETS],
    queryFn: () => apiRequest(queryKeys.LOTTERY_TICKETS),
    enabled: !!authUser && !authUser.isGuest
  });

  // 포인트 거래 내역 가져오기
  const { data: pointTransactions = [] } = useQuery<any[]>({
    queryKey: [queryKeys.AUTH_USER_POINTS_TRANSACTIONS],
    queryFn: () => apiRequest(queryKeys.AUTH_USER_POINTS_TRANSACTIONS),
    enabled: !!authUser && !authUser.isGuest
  });

  // 보상 아이템 가져오기
  const { data: rewardItems = [] } = useQuery<any[]>({
    queryKey: [queryKeys.REWARD_ITEMS],
    queryFn: () => apiRequest(queryKeys.REWARD_ITEMS),
    enabled: !!authUser && !authUser.isGuest
  });

  // 통계 계산
  const totalTickets = Array.isArray(lotteryTickets) ? lotteryTickets.length : 0;
  const totalPrize = Array.isArray(pointTransactions) ? pointTransactions
    .filter((t: any) => t.type === 'lottery_win')
    .reduce((sum: number, t: any) => sum + (t.amount || 0), 0) : 0;
  const totalParticipations = Array.isArray(participations) ? participations.length : 0;
  const completedParticipations = Array.isArray(participations) ? participations.filter((p: any) => p.completedAt).length : 0;

  // 게스트 사용자는 프로필 페이지에 접근 가능하지만 기능 제한
  useEffect(() => {
    if (!authUser && !isAuthLoading) {
      setLocation('/');
      return;
    }
  }, [authUser, isAuthLoading, setLocation]);

  // Point transfer mutation
  const transferPointsMutation = useMutation({
    mutationFn: async ({ receiverEmail, amount }: { receiverEmail: string; amount: number }) => {
      return await apiRequest(queryKeys.POINTS_TRANSFER, {
        method: 'POST',
        body: { receiverEmail, amount }
      });
    },
    onSuccess: () => {
      toast({
        title: "포인트 송금 완료",
        description: "친구에게 포인트를 성공적으로 보냈습니다!",
      });
      setTransferAmount("");
      setReceiverEmail("");
      queryClient.invalidateQueries({ queryKey: [queryKeys.AUTH_USER] });
      queryClient.invalidateQueries({ queryKey: [queryKeys.AUTH_USER_POINTS_TRANSACTIONS] });
    },
    onError: (error: any) => {
      toast({
        title: "송금 실패",
        description: error.message || "포인트 송금에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  // Reward purchase mutation
  const purchaseRewardMutation = useMutation({
    mutationFn: async (rewardId: number) => {
      return await apiRequest(queryKeys.REWARDS_PURCHASE, {
        method: 'POST',
        body: { rewardId }
      });
    },
    onSuccess: () => {
      toast({
        title: "리워드 구매 완료",
        description: "리워드를 성공적으로 구매했습니다!",
      });
      queryClient.invalidateQueries({ queryKey: [queryKeys.AUTH_USER] });
      queryClient.invalidateQueries({ queryKey: [queryKeys.AUTH_USER_POINTS_TRANSACTIONS] });
    },
    onError: (error: any) => {
      toast({
        title: "구매 실패",
        description: error.message || "리워드 구매에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const handlePointTransfer = () => {
    const amount = parseInt(transferAmount);
    if (!amount || amount <= 0) {
      toast({
        title: "잘못된 금액",
        description: "올바른 포인트 금액을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    if (!receiverEmail) {
      toast({
        title: "이메일 필요",
        description: "받는 사람의 이메일을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    if (amount > (authUser?.personalPoints || 0)) {
      toast({
        title: "포인트 부족",
        description: "보유 포인트가 부족합니다.",
        variant: "destructive",
      });
      return;
    }
    transferPointsMutation.mutate({ receiverEmail, amount });
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      // 에러가 있어도 강제로 게스트 상태로 변경
      window.location.href = "/";
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-black">
        <MobileHeader />
        <div className="max-w-md mx-auto p-4 flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Loading Profile...</p>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const winningTickets = Array.isArray(lotteryTickets) ? lotteryTickets.filter((ticket: any) => ticket.isWinner) : [];

  return (
    <div className="min-h-screen bg-black transition-colors relative overflow-hidden">
      {/* Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[120px] rounded-full animate-pulse"></div>
        <div className="absolute bottom-[20%] left-[-20%] w-[60%] h-[60%] bg-blue-600/10 blur-[150px] rounded-full"></div>
        <div className="absolute top-[30%] left-[10%] w-[30%] h-[30%] bg-pink-600/5 blur-[100px] rounded-full"></div>
      </div>
      <MobileHeader />

      <main className="max-w-md mx-auto pb-32">
        {/* Profile Header */}
        <section className="px-4 py-6">
          <Card className="glass-card-strong border-0 shadow-2xl bg-white/[0.05]">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4 mb-6">
                <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
                  <Avatar className="w-20 h-20 shadow-2xl border-2 border-white/10 ring-4 ring-purple-600/20 transition-all group-hover:ring-purple-500/50">
                    <AvatarFallback className={`
                      ${authUser?.gender === '남성'
                        ? 'bg-blue-600/20 text-blue-400'
                        : authUser?.gender === '여성'
                          ? 'bg-pink-600/20 text-pink-400'
                          : 'bg-purple-600/20 text-purple-400'
                      } 
                      border border-white/10 shadow-inner text-2xl font-black
                    `}>
                      <AvatarImage src={authUser?.profileImageUrl || undefined} className="object-cover" />
                      {authUser?.gender === '남성' ? (
                        <i className="fas fa-user-tie text-xl text-blue-400"></i>
                      ) : authUser?.gender === '여성' ? (
                        <i className="fas fa-female text-xl text-pink-400"></i>
                      ) : authUser?.nickname ? (
                        <i className="fas fa-user-circle text-xl text-purple-400"></i>
                      ) : (
                        <span className="text-xl font-bold text-purple-400">
                          {authUser?.nickname?.[0]?.toUpperCase() || authUser?.fullName?.[0]?.toUpperCase() || authUser?.email?.[0]?.toUpperCase() || 'G'}
                        </span>
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`absolute inset-0 bg-black/60 rounded-full flex items-center justify-center transition-opacity duration-200 ${isAvatarUploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {isAvatarUploading ? (
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    ) : (
                      <Camera className="w-6 h-6 text-white" />
                    )}
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    hidden
                    accept="image/*"
                    onChange={handleFileChange}
                    onClick={(e) => (e.target as any).value = null} // Allow selecting same file again
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                      {authUser?.nickname || authUser?.fullName || (authUser?.email ? authUser.email.split('@')[0] : '게스트 사용자')}
                      {!authUser?.isGuest && (
                        <NicknameEditDialog currentNickname={authUser?.nickname || ''} isGuest={false}>
                          <button className="p-1.5 hover:bg-white/10 rounded-full transition-colors group">
                            <Pencil className="w-3.5 h-3.5 text-white/40 group-hover:text-purple-400 transition-colors" />
                          </button>
                        </NicknameEditDialog>
                      )}
                    </h1>
                  </div>
                  <p className="text-sm text-gray-400">
                    {(authUser?.nickname || authUser?.fullName || authUser?.email) ? '프로필 인증 완료' : authUser?.isGuest ? '게스트 모드' : '인증된 사용자'}
                  </p>
                  <div className="flex items-center space-x-3 mt-3">
                    <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-purple-600/20 border border-purple-500/20 rounded-lg">
                      <i className="fas fa-star text-xs text-purple-400"></i>
                      <span className="text-xs font-black text-purple-400 uppercase tracking-tight">
                        Lv.{authUser?.level || 1}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-white/5 border border-white/5 rounded-lg">
                      <i className="fas fa-trophy text-xs text-white/40"></i>
                      <span className="text-xs font-black text-white/60 uppercase tracking-tight">
                        {authUser?.nickname ? authUser.nickname.split(' ')[1] || '투표인' : '신참 투표인'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-8 glass-card-strong p-5 border border-white/5 shadow-2xl">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-black text-white/40 uppercase tracking-widest">
                    성장 레벨 진행도
                  </span>
                  <span className="text-xs font-black text-purple-400 italic">
                    {authUser?.experience || 0} / {((authUser?.level || 1) * 100)} EXP
                  </span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/5 shadow-inner">
                  <div
                    className="bg-gradient-to-r from-purple-600 to-blue-500 h-full rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(147,51,234,0.5)]"
                    style={{
                      width: `${Math.min(100, ((authUser?.experience || 0) % 100))}%`
                    }}
                  ></div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="glass-card-light p-4 border border-white/5 text-center">
                  <div className="text-base font-black text-white italic mb-1">{totalParticipations}</div>
                  <div className="text-[10px] font-black text-white/20 uppercase tracking-widest">총 투표수</div>
                </div>
                <div className="glass-card-light p-4 border border-white/5 text-center">
                  <div className="text-base font-black text-white italic mb-1">0</div>
                  <div className="text-[10px] font-black text-white/20 uppercase tracking-widest">연속 투표</div>
                </div>
                <div className="glass-card-light p-4 border border-white/5 text-center">
                  <div className="text-base font-black text-white italic mb-1">{completedParticipations}</div>
                  <div className="text-[10px] font-black text-white/20 uppercase tracking-widest">완료 설문</div>
                </div>
                <div className="glass-card-light p-4 border border-white/5 text-center">
                  <div className="text-base font-black text-white italic mb-1">{authUser?.experience || 0}</div>
                  <div className="text-[10px] font-black text-white/20 uppercase tracking-widest">총 경험치</div>
                </div>
                <div className="glass-card-light p-4 border border-white/5 text-center">
                  <div className="text-base font-black text-purple-400 italic mb-1">{authUser?.personalPoints || 0}</div>
                  <div className="text-[10px] font-black text-purple-400/30 uppercase tracking-widest">포인트</div>
                </div>
                <div className="glass-card-light p-4 border border-white/5 text-center">
                  <div className="text-base font-black text-white italic mb-1">{authUser?.level || 1}</div>
                  <div className="text-[10px] font-black text-white/20 uppercase tracking-widest">현재 레벨</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>



        {/* Recent Activity */}
        <section className="px-4 mb-10">
          <div className="flex items-center space-x-2 mb-6 px-4">
            <i className="fas fa-clock text-sm text-purple-400"></i>
            <h2 className="text-sm font-black text-white/50 uppercase tracking-widest">최근 활동 내역</h2>
          </div>
          <Card className="glass-card-strong border-0 shadow-2xl bg-white/[0.02]">
            <CardContent className="p-5">
              {Array.isArray(participations) && participations.slice(0, 5).length > 0 ? (
                <div className="space-y-4">
                  {participations.slice(0, 5).map((participation: any, index: number) => (
                    <div key={index} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                      <div className="flex-1">
                        <div className="text-xs font-black text-white/20 uppercase tracking-widest mb-1">
                          SURVEY PARTICIPATION
                        </div>
                        <div className="text-sm font-black text-white">
                          설문 참여 완료
                        </div>
                        <div className="text-xs font-bold text-white/40 mt-2">
                          {(participation.completedAt) ? new Date(participation.completedAt).toLocaleDateString('ko-KR') : '날짜 없음'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-black text-purple-400 italic">
                          +{participation.pointsEarned || 0}P
                        </div>
                        <div className="text-[10px] font-black bg-purple-600/10 text-purple-400 px-2.5 py-1 rounded-full border border-purple-500/20 uppercase mt-2">
                          {participation.completedAt ? 'COMPLETED' : 'IN PROGRESS'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/5">
                    <i className="fas fa-history text-xl text-white/20"></i>
                  </div>
                  <p className="text-xs font-black text-white/20 uppercase tracking-widest">No activity found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="px-4 mb-10">
          <div className="flex items-center space-x-2 mb-6 px-4">
            <i className="fas fa-wallet text-sm text-purple-400"></i>
            <h2 className="text-sm font-black text-white/50 uppercase tracking-widest">포인트 지갑</h2>
          </div>

          <Card className="glass-card-strong border-0 shadow-2xl bg-white/[0.05] mb-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
            <CardContent className="p-8 relative z-10">
              <div className="text-center mb-8">
                <div className="w-20 h-20 bg-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(147,51,234,0.3)] animate-pulse">
                  <i className="fas fa-coins text-white text-3xl"></i>
                </div>
                <div className="text-4xl font-black text-white mb-2 italic tracking-tighter">
                  {(authUser?.personalPoints || 0).toLocaleString()}
                </div>
                <div className="text-xs font-black text-white/40 uppercase tracking-widest">CURRENT BALANCE</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="bg-purple-600 hover:bg-purple-700 text-white border-0 shadow-lg py-7 rounded-2xl font-black uppercase tracking-widest text-xs transition-all hover:scale-[1.02]">
                      <i className="fas fa-paper-plane mr-2"></i>
                      친구 송금
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="glass-card-strong border-white/10 shadow-2xl bg-black/90 backdrop-blur-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-white font-black uppercase tracking-widest text-base">
                        포인트 전송
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 pt-4">
                      <div>
                        <label className="text-xs font-black text-white/40 uppercase tracking-widest mb-3 block">
                          받는 사람 계정
                        </label>
                        <Input
                          type="email"
                          placeholder="EMAIL OR PHONE"
                          value={receiverEmail}
                          onChange={(e) => setReceiverEmail(e.target.value)}
                          className="h-14 bg-white/5 border-white/10 rounded-xl text-white font-bold focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-black text-white/40 uppercase tracking-widest mb-3 block">
                          전송할 포인트
                        </label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          className="h-14 bg-white/5 border-white/10 rounded-xl text-white font-black text-xl italic focus:ring-purple-500"
                        />
                        <div className="text-xs font-black text-purple-400 mt-2 uppercase">
                          보유: {(authUser?.personalPoints || 0).toLocaleString()}P
                        </div>
                      </div>
                      <Button
                        onClick={handlePointTransfer}
                        disabled={transferPointsMutation.isPending}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white h-16 rounded-2xl font-black uppercase tracking-widest"
                      >
                        {transferPointsMutation.isPending ? 'PROCESSING...' : 'SEND POINTS'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10 py-7 rounded-2xl font-black uppercase tracking-widest text-xs transition-all hover:scale-[1.02]">
                      <i className="fas fa-gift mr-2"></i>
                      리워드 상점
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="glass-card-strong border-white/10 shadow-2xl bg-black/90 backdrop-blur-2xl max-w-sm">
                    <DialogHeader>
                      <DialogTitle className="text-white font-black uppercase tracking-widest text-base">
                        리워드 샵
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {(rewardItems as any[]).length > 0 ? (
                        (rewardItems as any[]).map((item: any) => (
                          <Card key={item.id} className="glass-card border-white/5 bg-white/[0.02] p-4 hover:bg-white/5 transition-all group">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="text-sm font-black text-white uppercase mb-1">{item.name}</div>
                                <div className="text-[10px] font-bold text-white/30 uppercase tracking-tighter mb-2">{item.description}</div>
                                <div className="text-sm font-black text-purple-400 italic">
                                  {item.cost.toLocaleString()}P
                                </div>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => purchaseRewardMutation.mutate(item.id)}
                                disabled={purchaseRewardMutation.isPending || (authUser?.personalPoints || 0) < item.cost}
                                className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-xs uppercase h-11 px-5"
                              >
                                구매
                              </Button>
                            </div>
                          </Card>
                        ))
                      ) : (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/5">
                            <i className="fas fa-gift text-xl text-white/20"></i>
                          </div>
                          <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">COMING SOON</p>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card-light border-0 shadow-xl bg-white/[0.02]">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-black text-white/40 uppercase tracking-widest">
                  최근 포인트 내역
                </h3>
                <Button variant="ghost" size="sm" className="text-purple-400 hover:text-purple-300 hover:bg-purple-400/5 px-3">
                  <span className="text-xs font-black uppercase tracking-widest italic">VIEW ALL</span>
                  <i className="fas fa-chevron-right ml-2 text-xs"></i>
                </Button>
              </div>

              {pointTransactions.length > 0 ? (
                <div className="space-y-4">
                  {pointTransactions.slice(0, 5).map((transaction: any, index: number) => (
                    <div key={index} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 pb-4">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-white/5 border border-white/5 rounded-xl flex items-center justify-center group-hover:bg-purple-600/10 transition-colors">
                          <i className={`fas ${transaction.type === 'earned' ? 'fa-plus' : transaction.type === 'sent' ? 'fa-paper-plane' : 'fa-shopping-cart'} text-xs text-purple-400`}></i>
                        </div>
                        <div>
                          <div className="text-xs font-black text-white mb-1 uppercase tracking-tight">{transaction.description}</div>
                          <div className="text-[10px] font-bold text-white/30 uppercase tracking-tighter">
                            {new Date(transaction.createdAt).toLocaleDateString('ko-KR')}
                          </div>
                        </div>
                      </div>
                      <div className={`text-base font-black italic ${transaction.type === 'earned' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {transaction.type === 'earned' ? '+' : '-'}{transaction.amount.toLocaleString()}P
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10">
                  <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/5">
                    <i className="fas fa-history text-lg text-white/20"></i>
                  </div>
                  <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">NO TRANSACTIONS</p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>





        {/* Settings */}
        <section className="px-4 mb-6">
          <div className="flex items-center space-x-2 mb-6 px-4">
            <i className="fas fa-cog text-sm text-purple-400"></i>
            <h2 className="text-sm font-black text-white/50 uppercase tracking-widest">앱 설정</h2>
          </div>

          <div className="space-y-3">
            <Card className="glass-card border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all group">
              <CardContent className="p-0">
                <button
                  className="w-full flex items-center justify-between p-4"
                  onClick={() => setLocation('/profile-edit')}
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                      <i className="fas fa-user-edit text-white"></i>
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">프로필 수정</div>
                      <div className="text-[10px] text-white/40 font-medium">개인정보 및 프로필 변경</div>
                    </div>
                  </div>
                  <i className="fas fa-chevron-right text-white/20 group-hover:text-purple-400 transition-colors"></i>
                </button>
              </CardContent>
            </Card>

            <Card className="glass-card border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all group">
              <CardContent className="p-0">
                <button
                  onClick={() => setIsNotificationSettingsOpen(true)}
                  className="w-full flex items-center justify-between p-4"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center group-hover:bg-pink-500/20 transition-colors">
                      <i className="fas fa-bell text-white"></i>
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-white group-hover:text-pink-300 transition-colors">알림 설정</div>
                      <div className="text-[10px] text-white/40 font-medium">푸시 알림 및 소식 받기</div>
                    </div>
                  </div>
                  <i className="fas fa-chevron-right text-white/20 group-hover:text-pink-400 transition-colors"></i>
                </button>
              </CardContent>
            </Card>

            <Card className="glass-card border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all group">
              <CardContent className="p-0">
                <button
                  onClick={() => setIsPrivacyExpanded(!isPrivacyExpanded)}
                  className="w-full flex items-center justify-between p-4"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                      <i className="fas fa-shield-alt text-white"></i>
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors">개인정보 보호</div>
                      <div className="text-[10px] text-white/40 font-medium">보안 및 프라이버시 관리</div>
                    </div>
                  </div>
                  <i className={`fas fa-chevron-${isPrivacyExpanded ? 'up' : 'right'} text-white/20 group-hover:text-blue-400 transition-colors`}></i>
                </button>

                {isPrivacyExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="px-4 pb-4 border-t border-white/5 bg-black/20"
                  >
                    <div className="space-y-3 pt-4">
                      {/* Privacy Items Content */}
                      <div className="flex items-center justify-between p-3 glass-card bg-white/5 rounded-lg border border-white/5">
                        <div className="flex items-center space-x-3">
                          <i className="fas fa-lock text-green-400 text-xs"></i>
                          <div>
                            <div className="font-bold text-white text-xs">데이터 암호화</div>
                            <div className="text-[10px] text-white/40">안전한 데이터 보호</div>
                          </div>
                        </div>
                        <i className="fas fa-check-circle text-green-500 text-sm"></i>
                      </div>

                      <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                        <div className="flex items-start space-x-2">
                          <i className="fas fa-shield-check text-green-400 mt-0.5 text-xs"></i>
                          <div className="text-[10px] text-green-300 leading-relaxed">
                            Polli는 사용자의 개인정보를 최우선으로 보호하며, GDPR 기준을 준수합니다.
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>

            <Card className="glass-card border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all group">
              <CardContent className="p-0">
                <button
                  onClick={() => setIsHelpExpanded(!isHelpExpanded)}
                  className="w-full flex items-center justify-between p-4"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                      <i className="fas fa-question-circle text-white"></i>
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-white group-hover:text-orange-300 transition-colors">도움말</div>
                      <div className="text-[10px] text-white/40 font-medium">사용 가이드 및 문의</div>
                    </div>
                  </div>
                  <i className={`fas fa-chevron-${isHelpExpanded ? 'up' : 'right'} text-white/20 group-hover:text-orange-400 transition-colors`}></i>
                </button>

                {isHelpExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="px-4 pb-4 border-t border-white/5 bg-black/20"
                  >
                    <div className="space-y-3 pt-4">
                      {/* Help Items Content */}
                      <div className="p-3 glass-card bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 transition-colors cursor-pointer">
                        <div className="flex items-center space-x-3 mb-1">
                          <i className="fas fa-book text-purple-400 text-xs"></i>
                          <div className="font-bold text-white text-xs">사용 가이드 보기</div>
                        </div>
                        <div className="text-[10px] text-white/40 pl-6">
                          Polli의 모든 기능을 100% 활용하는 방법
                        </div>
                      </div>

                      <div className="p-3 glass-card bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 transition-colors cursor-pointer">
                        <div className="flex items-center space-x-3 mb-1">
                          <i className="fas fa-envelope text-purple-400 text-xs"></i>
                          <div className="font-bold text-white text-xs">문의하기</div>
                        </div>
                        <div className="text-[10px] text-white/40 pl-6">
                          궁금한 점이나 건의사항을 보내주세요
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>





        {/* Logout or Simple Login for Guests */}
        <section className="px-6 mb-12">
          {authUser?.isGuest ? (
            <div className="space-y-3">
              <div className="text-center mb-4">
                <p className="text-xs font-black text-white/40 uppercase tracking-widest">
                  계정을 연동하고 데이터를 저장하세요
                </p>
              </div>
              <Button
                onClick={() => login('google')}
                className="w-full bg-white text-black hover:bg-gray-100 py-6 rounded-2xl shadow-lg transition-all duration-300 font-black uppercase tracking-widest text-xs group"
              >
                <i className="fab fa-google mr-2 text-red-500 group-hover:scale-110 transition-transform"></i>
                Google로 계속하기
              </Button>
              <Button
                onClick={() => login('kakao')}
                className="w-full bg-[#FEE500] text-[#3c1e1e] hover:bg-[#FEE500]/90 py-6 rounded-2xl shadow-lg transition-all duration-300 font-black uppercase tracking-widest text-xs group"
              >
                <i className="fas fa-comment mr-2 group-hover:scale-110 transition-transform"></i>
                카카오로 계속하기
              </Button>
            </div>
          ) : (
            <>
              <Button
                onClick={handleLogout}
                className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 py-6 rounded-2xl transition-all duration-300 font-black text-xs group backdrop-blur-sm shadow-lg flex items-center justify-center cursor-pointer"
              >
                <i className="fas fa-sign-out-alt mr-2 group-hover:scale-110 transition-transform"></i>
                로그아웃
              </Button>
              <p className="text-center text-[10px] text-white/20 mt-4 uppercase tracking-widest font-bold">
                언제든지 다시 로그인하실 수 있습니다
              </p>
            </>
          )}
        </section>

        {/* Business Info Footer */}
        <footer className="px-6 pb-24 text-center">
          <button
            onClick={() => setIsBusinessInfoExpanded(!isBusinessInfoExpanded)}
            className="flex items-center justify-center space-x-2 w-full py-4 border-t border-white/5 group"
          >
            <span className="text-xs font-bold text-white/40 group-hover:text-white/60 transition-colors">(주)제이 에이치 스퀘어 사업자 정보</span>
            <i className={`fas fa-chevron-${isBusinessInfoExpanded ? 'up' : 'down'} text-[10px] text-white/20 transition-transform`}></i>
          </button>

          {isBusinessInfoExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-2 py-4 text-left px-4 glass-card border-white/5 mb-8"
            >
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black text-white/20 uppercase tracking-tighter">Company Name</span>
                <span className="text-[12px] font-bold text-white/60">제이 에이치 스퀘어</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black text-white/20 uppercase tracking-tighter">CEO</span>
                <span className="text-[12px] font-bold text-white/60">정현경</span>
              </div>
              <div className="flex flex-col space-y-1">
                <span className="text-[11px] font-black text-white/20 uppercase tracking-tighter">Address</span>
                <span className="text-[12px] font-bold text-white/60 leading-relaxed">서울특별시 강남구 선릉로90길 66 202호</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black text-white/20 uppercase tracking-tighter">Business License</span>
                <span className="text-[12px] font-bold text-white/60">218-18-70325</span>
              </div>
            </motion.div>
          )}

          <div className="text-[10px] font-black text-white/10 uppercase tracking-[4px] mt-4">
            POLLI PLATFORM © 2024
          </div>
        </footer>
      </main>

      <BottomNav />

      {/* Notification Settings Modal */}
      <NotificationSettingsModal
        open={isNotificationSettingsOpen}
        onOpenChange={setIsNotificationSettingsOpen}
      />
    </div>
  );
}
