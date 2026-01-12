interface PartyLogoProps {
  party: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const PARTY_LOGOS: Record<string, string | null> = {
  '기본소득당': '/images/logos/bon.svg',
  '개혁신당': '/images/logos/dog.svg',
  '진보당': '/images/logos/jin.svg',
  '조국혁신당': '/images/logos/jo.svg',
  '국민의힘': '/images/logos/kuk.svg',
  '더불어민주당': '/images/logos/minju.svg',
  '사회민주당': '/images/logos/sa.svg',
  '무소속': null // 무소속은 텍스트로 표시
};

const SIZE_CLASSES = {
  sm: 'w-7 h-7',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-20 h-20'
};

export default function PartyLogo({ party, size = 'md', className = '' }: PartyLogoProps) {
  const logoPath = PARTY_LOGOS[party];
  const sizeClass = SIZE_CLASSES[size];

  if (!logoPath) {
    // 무소속이나 알 수 없는 정당은 텍스트로 표시
    return (
      <span className={`inline-flex items-center justify-center ${sizeClass} text-[10px] font-medium bg-gray-100 text-gray-600 rounded-lg ${className}`}>
        {party === '무소속' ? '무' : party.charAt(0)}
      </span>
    );
  }

  return (
    <img
      src={logoPath}
      alt={`${party} 로고`}
      className={`${sizeClass} object-contain ${className}`}
      onError={(e) => {
        // 로고 로딩 실패 시 텍스트로 폴백
        e.currentTarget.style.display = 'none';
        const fallback = document.createElement('span');
        fallback.className = `inline-flex items-center justify-center ${sizeClass} text-xs font-medium bg-gray-100 text-gray-600 rounded-lg ${className}`;
        fallback.textContent = party.charAt(0);
        e.currentTarget.parentNode?.insertBefore(fallback, e.currentTarget);
      }}
    />
  );
}