import PartyLogo from "./PartyLogo";

interface ProposerWithPartyProps {
  proposer: string;
  className?: string;
}

// 발의자 문자열에서 정당 정보를 추출하는 함수
function extractPartyFromProposer(proposer: string): { name: string; party: string | null } {
  // "이름(정당)" 형태에서 정당 추출
  const match = proposer.match(/^(.+?)\((.+?)\)$/);
  if (match) {
    return { name: match[1].trim(), party: match[2].trim() };
  }
  
  // 공통 정당명들로 직접 매칭 시도
  const parties = ['더불어민주당', '국민의힘', '조국혁신당', '진보당', '개혁신당', '기본소득당', '사회민주당', '무소속'];
  for (const party of parties) {
    if (proposer.includes(party)) {
      const name = proposer.replace(party, '').trim();
      return { name, party };
    }
  }
  
  return { name: proposer, party: null };
}

export default function ProposerWithParty({ proposer, className = '' }: ProposerWithPartyProps) {
  const { name, party } = extractPartyFromProposer(proposer);
  
  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <span className="text-sm text-gray-600 dark:text-gray-400">
        발의자: {name}
      </span>
      {party && (
        <div className="flex items-center space-x-1">
          <PartyLogo party={party} size="sm" />
          <span className="text-xs text-gray-500">({party})</span>
        </div>
      )}
    </div>
  );
}