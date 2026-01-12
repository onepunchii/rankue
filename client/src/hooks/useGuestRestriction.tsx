import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import GuestRestrictionModal from '@/components/GuestRestrictionModal';

export function useGuestRestriction() {
  const { user } = useAuth();
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    feature: string;
    description: string;
  }>({
    isOpen: false,
    feature: '',
    description: '',
  });

  const canParticipate = () => true;
  const canCreateSurveys = () => !!user && !user.isGuest;
  const canUseLottery = () => !!user && (user.isVerified || !!(user.ageGroup && user.gender && user.region));
  const canUseAdvancedFeatures = () => !!user && !user.isGuest;

  const checkPermission = (
    action: 'participate' | 'create' | 'lottery' | 'advanced',
    callback?: () => void
  ) => {
    let hasPermission = false;
    let featureName = '';
    let description = '';

    switch (action) {
      case 'participate':
        hasPermission = canParticipate();
        featureName = '설문 참여';
        description = '설문에 참여하고 포인트를 적립할 수 있습니다.';
        break;
      case 'create':
        hasPermission = canCreateSurveys();
        featureName = '설문 생성';
        description = '나만의 설문을 생성하고 공유할 수 있습니다.';
        break;
      case 'lottery':
        hasPermission = canUseLottery();
        featureName = '로또 시스템';
        description = '로또 번호를 선택하고 추첨에 참여할 수 있습니다.';
        break;
      case 'advanced':
        hasPermission = canUseAdvancedFeatures();
        featureName = 'AI 기능';
        description = 'AI 뉴스 투표 생성 및 고급 기능을 사용할 수 있습니다.';
        break;
    }

    if (hasPermission) {
      callback?.();
    } else {
      setModalState({
        isOpen: true,
        feature: featureName,
        description,
      });
    }
  };

  const closeModal = () => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  };

  const Modal = () => (
    <GuestRestrictionModal
      isOpen={modalState.isOpen}
      onClose={closeModal}
      feature={modalState.feature}
      description={modalState.description}
    />
  );

  return {
    checkPermission,
    Modal,
  };
}