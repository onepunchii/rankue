import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface NotificationSettings {
  pushNotifications: boolean;
  newSurveyNotifications: boolean;
  lotteryResultNotifications: boolean;
  weeklyDigestNotifications: boolean;
  marketingNotifications: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

interface NotificationSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function NotificationSettingsModal({ open, onOpenChange }: NotificationSettingsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 기본 알림 설정값
  const defaultSettings: NotificationSettings = {
    pushNotifications: true,
    newSurveyNotifications: true,
    lotteryResultNotifications: true,
    weeklyDigestNotifications: true,
    marketingNotifications: false,
    soundEnabled: true,
    vibrationEnabled: true,
  } as any;

  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);

  // 알림 설정 조회
  const { data: userSettings } = useQuery<NotificationSettings>({
    queryKey: ["/api/user/notification-settings"],
    enabled: open,
    select: (data: any) => data ? { ...defaultSettings, ...data } : defaultSettings,
  });

  // 알림 설정 저장
  const updateSettingsMutation = useMutation({
    mutationFn: (newSettings: NotificationSettings) =>
      apiRequest("/api/user/notification-settings", {
        method: "PUT",
        body: JSON.stringify(newSettings),
      }),
    onSuccess: () => {
      toast({
        title: "알림 설정 저장됨",
        description: "알림 설정이 성공적으로 저장되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/notification-settings"] });
    },
    onError: () => {
      toast({
        title: "저장 실패",
        description: "알림 설정 저장 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  // 사용자 설정이 로드되면 상태 업데이트
  useEffect(() => {
    if (userSettings) {
      setSettings(userSettings);
    }
  }, [userSettings]);

  const handleSettingChange = (key: keyof NotificationSettings, value: boolean) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = () => {
    updateSettingsMutation.mutate(settings);
  };

  const handleTestNotification = () => {
    toast({
      title: "테스트 알림",
      description: "알림이 정상적으로 작동합니다! 🎉",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs sm:max-w-sm mx-auto max-h-[85vh] overflow-y-auto bg-black/95 backdrop-blur-xl border border-white/10 shadow-2xl p-0 rounded-3xl gap-0">
        <DialogHeader className="px-6 py-5 border-b border-white/5 bg-white/[0.02]">
          <DialogTitle className="text-base font-black text-white uppercase tracking-widest text-center">
            알림 설정
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-8">
          {/* 기본 알림 설정 */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest pl-1">
              기본 알림
            </h3>

            <div className="space-y-1">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5">
                <Label htmlFor="push-notifications" className="text-xs font-bold text-white/80">푸시 알림</Label>
                <Switch
                  id="push-notifications"
                  checked={settings.pushNotifications}
                  onCheckedChange={(checked) => handleSettingChange('pushNotifications', checked)}
                  className="data-[state=checked]:bg-purple-600"
                />
              </div>
            </div>
          </div>

          {/* 나의 알림 (Custom Schedule) */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest pl-1">
              나의 알림
            </h3>

            <div className="space-y-1">
              {[
                { id: 'new-survey', label: '새 설문 알림', key: 'newSurveyNotifications' },
                { id: 'lottery-result', label: '로또 결과 알림', key: 'lotteryResultNotifications' },
              ].map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 h-14">
                  <div className="text-xs font-bold text-white/90">{item.label}</div>
                  <Switch
                    id={item.id}
                    checked={settings[item.key as keyof NotificationSettings] as boolean}
                    onCheckedChange={(checked) => handleSettingChange(item.key as keyof NotificationSettings, checked)}
                    className="data-[state=checked]:bg-purple-600 scale-90"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 마케팅 및 기타 */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest pl-1">
              기타 설정
            </h3>
            <div className="space-y-1">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 h-14">
                <Label htmlFor="weekly-digest" className="text-xs font-bold text-white/90">주간 요약</Label>
                <Switch
                  id="weekly-digest"
                  checked={settings.weeklyDigestNotifications}
                  onCheckedChange={(checked) => handleSettingChange('weeklyDigestNotifications', checked)}
                  className="data-[state=checked]:bg-purple-600 scale-90"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 h-14">
                <Label htmlFor="marketing" className="text-xs font-bold text-white/90">마케팅 정보</Label>
                <Switch
                  id="marketing"
                  checked={settings.marketingNotifications}
                  onCheckedChange={(checked) => handleSettingChange('marketingNotifications', checked)}
                  className="data-[state=checked]:bg-purple-600 scale-90"
                />
              </div>
            </div>
          </div>

          {/* 테스트 및 저장 버튼 */}
          <div className="space-y-3 pt-2">
            <Button
              onClick={handleSave}
              disabled={updateSettingsMutation.isPending}
              className="w-full h-12 bg-white text-black hover:bg-gray-200 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg"
            >
              {updateSettingsMutation.isPending ? "저장 중..." : "설정 저장"}
            </Button>

            <Button
              onClick={handleTestNotification}
              variant="ghost"
              className="w-full h-10 text-white/40 hover:text-white hover:bg-white/5 text-[10px] font-bold uppercase tracking-widest"
            >
              알림 테스트 발송
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}