/**
 * NotificationSchedulerService
 * 
 * "재미"에서 "의미"로 이어지는 폴리테인먼트 컨셉의 알림 스케줄을 관리합니다.
 * 요일별, 시간별 타겟팅된 메시지를 생성하고 스케줄링 로직을 담당합니다.
 */

export interface NotificationPayload {
    title: string;
    body: string;
    data?: Record<string, any>;
}

export interface UserContext {
    id: string;
    name: string;
    favoriteIdol?: string; // 최애 연예인 이름 (예: "뉴진스")
}

export class NotificationSchedulerService {
    /**
     * [알림 스케줄 전략]
     * 월요일 09:00: 주간 여론조사 (정치 참여 유도)
     * 화~금 18:30: 연예인 투표 (팬덤 활동 자극)
     * 수요일 12:30: 밸런스 게임 (재미/참여 유도)
     * 토요일 14:00: 주말 보상 (리워드 소멸 예고)
     * 일요일 20:00: 주간 결과 예고 (재접속 유도)
     */

    /**
     * 지정된 시간에 맞는 알림 내용을 결정합니다.
     * @param now 조회 기준 시간
     * @param user 유저 컨텍스트 (이름, 최애 등)
     */
    public determineNotificationContent(now: Date, user: UserContext): NotificationPayload | null {
        const day = now.getDay(); // 0(일) ~ 6(토)
        const hour = now.getHours();
        const minute = now.getMinutes();

        // 1. 월요일 09:00 (주간 여론조사)
        if (day === 1 && hour === 9 && minute === 0) {
            return {
                title: "📢 이번 주 대한민국 이슈는?",
                body: `${user.name}님, 1분 만에 여론을 보여주세요! 오늘의 정책 투표가 업로드되었습니다.`,
                data: { url: "/category/politics", type: "politics" }
            };
        }

        // 2. 화~금 18:30 (연예인 투표)
        if (day >= 2 && day <= 5 && hour === 18 && minute === 30) {
            const idol = user.favoriteIdol || "내 최애";
            return {
                title: "큰일 났어요! 😱",
                body: `${idol}님이 2위와 표 차이가 얼마 안 나요! 지금 바로 응원 투표를 완료하세요.`,
                data: { url: "/celebrity-ranking", type: "fandom" }
            };
        }

        // 3. 수요일 12:30 (밸런스 게임) - 중복 체크 (화~금에 포함되나 수요일만 우선순위)
        if (day === 3 && hour === 12 && minute === 30) {
            return {
                title: "점심 드셨나요? 🍜",
                body: "평생 라면 vs 평생 치킨, 당신의 선택은? 지금 바로 밸런스 게임 참여하기!",
                data: { url: "/", type: "balance_game" }
            };
        }

        // 4. 토요일 14:00 (주말 보상)
        if (day === 6 && hour === 14 && minute === 0) {
            return {
                title: "이번 주 모은 투표권 🎫",
                body: "보유하신 투표권이 소멸되기 전, 전광판 광고 선물에 지금 바로 응모하세요!",
                data: { url: "/rewards", type: "reward" }
            };
        }

        // 5. 일요일 20:00 (주간 결과 예고)
        if (day === 0 && hour === 20 && minute === 0) {
            return {
                title: "내일 아침 9시 결과 발표! 🕘",
                body: "지난주 대한민국 최대 관심사의 결과가 내일 발표됩니다. 아직 참여 안 하셨나요?",
                data: { url: "/results", type: "result" }
            };
        }

        return null;
    }

    /**
     * 관리자 도구 등에서 특정 시간대의 메시지를 미리보기할 때 사용합니다.
     */
    public getSchedulePreview(user: UserContext): string[] {
        return [
            "월 09:00 - 주간 여론조사: 📢 이번 주 대한민국 이슈는? ...",
            `화~금 18:30 - 팬덤 활동: 큰일 났어요! 😱 ${user.favoriteIdol || '최애'}님이...`,
            "수 12:30 - 밸런스 게임: 점심 드셨나요? 🍜 평생 라면 vs ...",
            "토 14:00 - 주말 보상: 이번 주 모은 투표권 🎫 소멸 전 ...",
            "일 20:00 - 결과 예고: 내일 아침 9시 결과 발표! 🕘 ..."
        ];
    }

    /**
     * 알림을 실제로 전송하는 로직 (Firebase, Web Push 등 구현부)
     */
    public async scheduleAllNotifications(): Promise<void> {
        // 1. 활성 유저 목록 조회
        // 2. 유저별 최애(favoriteIdol) 컨텍스트 구성
        // 3. 현재 시간 기준 determineNotificationContent 호출
        // 4. 발송 대상일 경우 푸시 서버(FCM 등)로 페이로드 전송

        /* 
        const payload = this.determineNotificationContent(new Date(), user);
        if (payload) {
           await pushProvider.send(user.pushToken, payload);
           console.log(`[Push] Sent to ${user.id}: ${payload.title}`);
        }
        */

        console.log("[NotificationScheduler] Checking schedule for all users...");
    }
}

export const notificationScheduler = new NotificationSchedulerService();
