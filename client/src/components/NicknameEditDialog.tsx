import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { generateMultipleNicknames } from "@/lib/nicknameGenerator";
import { updateGuestNickname } from "@/lib/guestId";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface NicknameEditDialogProps {
  currentNickname: string;
  isGuest: boolean;
  children: React.ReactNode;
}

export function NicknameEditDialog({ currentNickname, isGuest, children }: NicknameEditDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [nickname, setNickname] = useState(currentNickname);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const handleGenerateSuggestions = () => {
    const newSuggestions = generateMultipleNicknames(5);
    setSuggestions(newSuggestions);
  };

  const handleUpdateNickname = async () => {
    if (!nickname.trim()) {
      toast({
        title: "오류",
        description: "닉네임을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (nickname.length > 20) {
      toast({
        title: "오류",
        description: "닉네임은 20자 이내로 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsUpdating(true);

    try {
      if (isGuest) {
        // 게스트 사용자 닉네임 업데이트
        const response = await fetch('/api/guest/update-nickname', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ nickname: nickname.trim() }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || '닉네임 변경에 실패했습니다.');
        }

        // localStorage 업데이트
        updateGuestNickname(nickname.trim());
      } else {
        // Authenticated user update
        await apiRequest("/api/user/profile", {
          method: "PATCH",
          body: { nickname: nickname.trim() }
        });
      }

      // 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });

      toast({
        title: "성공",
        description: "닉네임이 변경되었습니다.",
        variant: "default",
      });

      setIsOpen(false);
    } catch (error) {
      console.error('닉네임 업데이트 오류:', error);
      toast({
        title: "오류",
        description: error instanceof Error ? error.message : '닉네임 변경에 실패했습니다.',
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="bg-zinc-950/95 backdrop-blur-xl border border-white/10 text-white w-[85%] rounded-[32px] max-w-[320px] p-6 shadow-2xl gap-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-center text-lg font-bold text-white">
            닉네임 변경
          </DialogTitle>
          <p className="text-center text-[11px] text-white/40 font-medium">
            나만의 멋진 닉네임을 설정해보세요
          </p>
        </DialogHeader>

        <div className="space-y-5">
          {/* Input Section */}
          <div className="space-y-2">
            <div className="relative">
              <Input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="닉네임 입력"
                className="bg-black/40 border-white/10 text-center text-white font-bold text-base h-12 rounded-2xl focus-visible:ring-purple-500/50 placeholder:text-white/20"
                maxLength={20}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/20 font-medium">
                {nickname.length}/20
              </div>
            </div>
          </div>

          {/* Suggestions Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <label className="text-xs font-bold text-white/50">
                추천 닉네임
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGenerateSuggestions}
                className="h-6 px-2 text-[10px] text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-full"
              >
                <i className="fas fa-sync-alt mr-1.5"></i>
                새로고침
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 justify-center bg-white/5 p-3 rounded-2xl border border-white/5 min-h-[80px] items-center">
              {suggestions.length === 0 ? (
                <button
                  onClick={handleGenerateSuggestions}
                  className="text-[11px] text-white/30 flex flex-col items-center gap-1 hover:text-white/50 transition-colors py-2"
                >
                  <i className="fas fa-magic text-sm mb-1 opacity-50"></i>
                  <span>터치하여 추천받기</span>
                </button>
              ) : (
                suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => setNickname(suggestion)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-purple-500/20 hover:border-purple-500/30 border border-white/10 rounded-xl text-[11px] text-white/80 transition-all active:scale-95"
                  >
                    {suggestion}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="bg-white/5 border-white/5 hover:bg-white/10 text-white/60 hover:text-white h-12 rounded-2xl text-sm font-bold active:scale-95 transition-transform"
            >
              취소
            </Button>
            <Button
              onClick={handleUpdateNickname}
              disabled={isUpdating || !nickname.trim()}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border-0 shadow-lg shadow-purple-900/30 h-12 rounded-2xl text-sm font-bold active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUpdating ? (
                <i className="fas fa-spinner fa-spin"></i>
              ) : (
                "변경하기"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}