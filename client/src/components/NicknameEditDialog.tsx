import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { generateMultipleNicknames } from "@/lib/nicknameGenerator";
import { updateGuestNickname } from "@/lib/guestId";
import { queryClient } from "@/lib/queryClient";

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
        // 일반 사용자 닉네임 업데이트 (추후 구현)
        toast({
          title: "준비중",
          description: "일반 사용자 닉네임 변경 기능은 준비중입니다.",
          variant: "default",
        });
        return;
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
      <DialogContent className="glass-card-strong border-0 shadow-xl bg-gradient-to-br from-white/90 to-pink-50/90 dark:from-gray-800/90 dark:to-gray-700/90 max-w-sm">
        <DialogHeader>
          <DialogTitle className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
            닉네임 변경
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              새 닉네임
            </label>
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="새 닉네임을 입력하세요"
              className="glass-card border-pink-200 focus:border-pink-400"
              maxLength={20}
            />
            <div className="text-xs text-gray-500 mt-1">
              {nickname.length}/20자
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                추천 닉네임
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGenerateSuggestions}
                className="text-pink-600 hover:text-pink-700 hover:bg-pink-50 dark:hover:bg-pink-900/20"
              >
                <i className="fas fa-refresh mr-1 text-xs"></i>
                새로고침
              </Button>
            </div>
            <div className="space-y-2">
              {suggestions.length === 0 ? (
                <Button
                  variant="outline"
                  onClick={handleGenerateSuggestions}
                  className="w-full glass-card border-pink-200 text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-900/20"
                >
                  <i className="fas fa-magic mr-2"></i>
                  추천 닉네임 생성
                </Button>
              ) : (
                suggestions.map((suggestion, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    onClick={() => setNickname(suggestion)}
                    className="w-full glass-card border-pink-200 text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-900/20 text-left justify-start"
                  >
                    {suggestion}
                  </Button>
                ))
              )}
            </div>
          </div>

          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="flex-1 glass-card border-gray-300"
            >
              취소
            </Button>
            <Button
              onClick={handleUpdateNickname}
              disabled={isUpdating || !nickname.trim()}
              className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white"
            >
              {isUpdating ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  변경 중...
                </>
              ) : (
                <>
                  <i className="fas fa-check mr-2"></i>
                  변경
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}