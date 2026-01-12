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
  emailNotifications: boolean;
  pushNotifications: boolean;
  newSurveyNotifications: boolean;
  surveyReminderNotifications: boolean;
  lotteryResultNotifications: boolean;
  levelUpNotifications: boolean;
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
    emailNotifications: true,
    pushNotifications: true,
    newSurveyNotifications: true,
    surveyReminderNotifications: true,
    lotteryResultNotifications: true,
    levelUpNotifications: true,
    weeklyDigestNotifications: false,
    marketingNotifications: false,
    soundEnabled: true,
    vibrationEnabled: true,
  };

  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);

  // 알림 설정 조회
  const { data: userSettings } = useQuery<NotificationSettings>({
    queryKey: ["/api/user/notification-settings"],
    enabled: open,
    select: (data: any) => data || defaultSettings,
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
      <DialogContent className="max-w-md mx-auto max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>알림 설정</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* 전체 알림 설정 */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              전체 알림
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="email-notifications" className="text-sm">이메일 알림</Label>
                <Switch
                  id="email-notifications"
                  checked={settings.emailNotifications}
                  onCheckedChange={(checked) => handleSettingChange('emailNotifications', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="push-notifications" className="text-sm">푸시 알림</Label>
                <Switch
                  id="push-notifications"
                  checked={settings.pushNotifications}
                  onCheckedChange={(checked) => handleSettingChange('pushNotifications', checked)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* 설문 관련 알림 */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              설문 알림
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="new-survey" className="text-sm">새 설문 알림</Label>
                  <p className="text-xs text-gray-500">관심 카테고리의 새로운 설문이 생성될 때</p>
                </div>
                <Switch
                  id="new-survey"
                  checked={settings.newSurveyNotifications}
                  onCheckedChange={(checked) => handleSettingChange('newSurveyNotifications', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="survey-reminder" className="text-sm">설문 마감 알림</Label>
                  <p className="text-xs text-gray-500">참여하지 않은 설문 마감 1시간 전</p>
                </div>
                <Switch
                  id="survey-reminder"
                  checked={settings.surveyReminderNotifications}
                  onCheckedChange={(checked) => handleSettingChange('surveyReminderNotifications', checked)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* 로또 및 레벨 알림 */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              이벤트 알림
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="lottery-result" className="text-sm">로또 당첨 알림</Label>
                  <p className="text-xs text-gray-500">로또 당첨 시 즉시 알림</p>
                </div>
                <Switch
                  id="lottery-result"
                  checked={settings.lotteryResultNotifications}
                  onCheckedChange={(checked) => handleSettingChange('lotteryResultNotifications', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="level-up" className="text-sm">레벨업 알림</Label>
                  <p className="text-xs text-gray-500">새로운 레벨 달성 시</p>
                </div>
                <Switch
                  id="level-up"
                  checked={settings.levelUpNotifications}
                  onCheckedChange={(checked) => handleSettingChange('levelUpNotifications', checked)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* 기타 알림 */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              기타 설정
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="weekly-digest" className="text-sm">주간 요약 알림</Label>
                  <p className="text-xs text-gray-500">매주 참여 통계 요약</p>
                </div>
                <Switch
                  id="weekly-digest"
                  checked={settings.weeklyDigestNotifications}
                  onCheckedChange={(checked) => handleSettingChange('weeklyDigestNotifications', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="marketing" className="text-sm">마케팅 알림</Label>
                  <p className="text-xs text-gray-500">새로운 기능 및 이벤트 소식</p>
                </div>
                <Switch
                  id="marketing"
                  checked={settings.marketingNotifications}
                  onCheckedChange={(checked) => handleSettingChange('marketingNotifications', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="sound" className="text-sm">알림 소리</Label>
                <Switch
                  id="sound"
                  checked={settings.soundEnabled}
                  onCheckedChange={(checked) => handleSettingChange('soundEnabled', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="vibration" className="text-sm">진동</Label>
                <Switch
                  id="vibration"
                  checked={settings.vibrationEnabled}
                  onCheckedChange={(checked) => handleSettingChange('vibrationEnabled', checked)}
                />
              </div>
            </div>
          </div>

          {/* 테스트 및 저장 버튼 */}
          <div className="space-y-3 pt-4">
            <Button
              onClick={handleTestNotification}
              variant="outline"
              className="w-full border-pink-200 text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-900/20"
            >
              알림 테스트
            </Button>

            <Button
              onClick={handleSave}
              disabled={updateSettingsMutation.isPending}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
            >
              {updateSettingsMutation.isPending ? "저장 중..." : "설정 저장"}
            </Button>
          </div>

          {/* 안내 메시지 */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-sm font-medium text-blue-800 dark:text-blue-200">
              알림 설정 안내
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-300 mt-1">
              알림은 앱이 백그라운드에서 실행 중일 때도 수신됩니다. 
              중요한 알림을 놓치지 않으려면 푸시 알림을 활성화해 주세요.
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}