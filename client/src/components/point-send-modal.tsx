import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PointSendModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function PointSendModal({ onClose, onSuccess }: PointSendModalProps) {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const sendPointsMutation = useMutation({
    mutationFn: async ({ email, amount }: { email: string; amount: number }) => {
      return apiRequest('/api/points/send', {
        method: 'POST',
        body: { email, amount },
      });
    },
    onSuccess: () => {
      toast({
        title: "포인트 전송 완료",
        description: "친구에게 포인트를 성공적으로 전송했습니다!",
      });
      onSuccess();
    },
    onError: (error: any) => {
      let friendlyMessage = "포인트 전송에 실패했습니다.";
      let friendlyTitle = "전송 실패";
      
      if (error.message.includes("Recipient not found")) {
        friendlyTitle = "사용자를 찾을 수 없음";
        friendlyMessage = "입력한 이메일 주소의 사용자를 찾을 수 없습니다.";
      } else if (error.message.includes("Insufficient points")) {
        friendlyTitle = "포인트 부족";
        friendlyMessage = "보유한 포인트가 부족합니다. 포인트를 확인해주세요.";
      } else if (error.message.includes("Cannot send points to yourself")) {
        friendlyTitle = "본인 전송 불가";
        friendlyMessage = "본인에게는 포인트를 전송할 수 없습니다.";
      }
      
      toast({
        title: friendlyTitle,
        description: friendlyMessage,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !amount) {
      toast({
        title: "입력 오류",
        description: "이메일과 포인트를 모두 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    
    const numAmount = parseInt(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({
        title: "포인트 오류",
        description: "유효한 포인트를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    
    sendPointsMutation.mutate({ email, amount: numAmount });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md glass-card-strong">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center">
            <Send className="mr-2 h-5 w-5 text-pink-500" />
            친구에게 포인트 전송
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="recipient-email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              받는 사람 이메일
            </Label>
            <Input
              id="recipient-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
              className="mt-1"
              required
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              포인트를 받을 친구의 이메일을 입력해주세요.
            </p>
          </div>

          <div>
            <Label htmlFor="point-amount" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              전송할 포인트
            </Label>
            <Input
              id="point-amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
              min="1"
              max="10000"
              className="mt-1"
              required
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              최소 1포인트, 최대 10,000포인트까지 전송 가능합니다.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={sendPointsMutation.isPending}
              className="flex-1 bg-pink-500 hover:bg-pink-600"
            >
              {sendPointsMutation.isPending ? "전송 중..." : "포인트 전송"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}