import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const DATA_DIR = path.resolve(__dirname, '../data');
const OUTPUT_FILE = path.resolve(__dirname, '../client/src/golf/data/crawledMembershipData.ts');

const GOLF_FILE = path.join(DATA_DIR, 'golf_data_final.json');
const CONDO_FILE = path.join(DATA_DIR, 'condo_data_cleaned.json');
const FITNESS_FILE = path.join(DATA_DIR, 'fitness_data_cleaned.json');

// Interface Definitions
const INTERFACES = `
export type MembershipCategory = 'Golf' | 'Condo' | 'Fitness';

// --- [1. 공통 상위 타입] ---
export interface BaseMembership {
  id: string;
  name: string;
  category: 'Golf' | 'Condo' | 'Fitness';

  // 💰 가격 정보
  price: {
    current: number;
    display: string;
    initial?: number;
    discount?: number;
    highYear?: number;   // 연간최고가 (추가)
    lowYear?: number;    // 연간최저가 (추가)
    allTimeHigh?: number; // 역대최고가 (추가)
  };

  // 💸 거래 비용
  fees: {
    transfer: number;
    tax: number;
    commission: number;
    acquisitionTaxRate: number;
  };

  // ℹ️ 기본 정보
  info: {
    expiredDate?: string;
    vendor?: string;
    homepage?: string;
    phone?: string;
    Address?: string;
    operatingHours?: string; // 추가
    closedDays?: string; // 추가
  };

  // 🏷️ 태그 및 URL
  tags: string[];
  detailUrl: string;
}

// --- [2. 골프 전용 확장] ---
export interface GolfMembership extends BaseMembership {
  category: 'Golf';
  golfSpec: {
    type: string;        // 회원권종류
    holeCount?: string;
    memberCount?: string;
    openDate?: string;

    // 소개 및 특징 (추가)
    desc?: string;       // 골프장 소개
    features?: string;   // 특징 (개인/법인 전환 여부 등)

    // ⛳ 그린피 혜택 (기존 호환용)
    greenFee: {
      member: number;
      family?: number;
      nonMember?: number;
      weekendMember?: number;
      weekendNonMember?: number;
    };

    // 📋 상세 요금표 (추가)
    feeTable?: {
      division: string;      // 구분 (주중, 토요일, 일요일)
      nonMember: number;     // 비회원
      member: number;        // 정회원
      familyMember?: number; // 가족회원
      designated1?: number;  // 지정인1
      designated2?: number;  // 지정인2
      weekdayMember?: number; // 주중정회원
      weekdayFamilyMember?: number; // 주중가족회원
    }[];

    // 기타 비용 (추가)
    caddyFee?: number;
    cartFee?: number;
    feeRemarks?: string;     // 요금 특이사항

    // 👥 회원 구성
    privilege: {
      booking?: number;
      familyCount?: number;
      designatedCount?: number;
      cardCount?: number;
      summary?: string;
      usageLimit?: string;
    };
  };
}

// --- [3. 콘도 전용 확장] ---
export interface CondoMembership extends BaseMembership {
  category: 'Condo';
  condoSpec: {
    roomType: string;
    availableTypes?: string; // 회원권 종류
    qualification?: string;  // 입회 자격
    ownership: 'Membership' | 'Ownership';
    usage: {
      daysPerYear: number;
      chainResorts?: string[];
      weekendDays?: number;
    };
    benefits: {
      waterParkDiscount?: number;
      saunaDiscount?: number;
      skiDiscount?: number;
      summary?: string;
    };
    facilities?: string; // 부대 시설
    remarks?: string;    // 특이 사항
  };
}

// --- [4. 휘트니스 전용 확장] ---
export interface FitnessMembership extends BaseMembership {
  category: 'Fitness';
  fitnessSpec: {
    facility: {
      hasGym: boolean;
      hasPool: boolean;
      hasSauna: boolean;
      hasGolfRange: boolean;
    };
    facilityInfo?: string; // 시설 안내 (추가)
    annualFee: {
      personal: number;
      couple?: number;
      corporate?: number;
    };
    deposit?: number;
    familyBenefits?: string;
    complimentary?: string;
  };
}

// --- [5. 최종 통합 타입] ---
export type MembershipItem = GolfMembership | CondoMembership | FitnessMembership;
`;

// Helper: Parse money string "3,200" -> 32000000
function parseMoney(str) {
  if (!str) return 0;
  // Remove commas
  const clean = String(str).replace(/,/g, '').trim();
  const num = parseFloat(clean);
  // If unit is 만원 (10000), multiply.
  // Assuming input "3,200" is 3200 manwon (32 million)
  if (isNaN(num)) return 0;
  return num * 10000;
}

// Helper: Parse raw number string e.g., "128,000" -> 128000
function parseRawNumber(str) {
  if (!str) return 0;
  if (typeof str === 'number') return str;
  const clean = String(str).replace(/,/g, '').trim();
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function loadJson(file) {
  try {
    const data = fs.readFileSync(file, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
    return [];
  }
}

function processGolf(item) {
  const currentPrice = parseMoney(item['회원권시세']?.['현재시세']);
  const highYear = parseMoney(item['회원권시세']?.['연간최고가']);
  const lowYear = parseMoney(item['회원권시세']?.['연간최저가']);

  const feeTable = (item['요금표'] || []).map(row => ({
    division: row['구분'] || '',
    nonMember: parseRawNumber(row['비회원']),
    member: parseRawNumber(row['정회원']),
    familyMember: parseRawNumber(row['가족회원']),
    designated1: parseRawNumber(row['지정인1']),
    designated2: parseRawNumber(row['지정인2']),
    weekdayMember: parseRawNumber(row['주중정회원']),
    weekdayFamilyMember: parseRawNumber(row['주중가족회원']),
  }));

  // Find fee info to populate greenFee (legacy)
  const weekdayRow = feeTable.find(r => r.division === '주중') || {};
  const weekendRow = feeTable.find(r => r.division === '토요일') || {};

  return {
    id: String(item.id),
    name: item['수집명'],
    category: 'Golf',
    price: {
      current: currentPrice,
      display: item['회원권시세']?.['현재시세'] || '',
      highYear: highYear,
      lowYear: lowYear,
      initial: 0,
      allTimeHigh: highYear // Approximation if missing
    },
    fees: {
      transfer: 550000,
      tax: 0,
      commission: 300000,
      acquisitionTaxRate: 0.022
    },
    info: {
      vendor: item['골프장명'],
      homepage: item['기본정보']?.['홈페이지'],
      Address: item['기본정보']?.['주소'],
      phone: ''
    },
    tags: [],
    detailUrl: '',
    golfSpec: {
      type: item['기본정보']?.['회원권종류'] || '',
      holeCount: item['기본정보']?.['홀수'] || '',
      memberCount: item['기본정보']?.['회원수'] || '',
      openDate: item['기본정보']?.['개장일'] || '',
      desc: item['기본정보']?.['소개'] || '',
      features: item['기본정보']?.['특징'] || '',
      greenFee: {
        member: weekdayRow.member || 0,
        family: weekdayRow.familyMember || 0,
        nonMember: weekdayRow.nonMember || 0,
        weekendMember: weekendRow.member || 0,
        weekendNonMember: weekendRow.nonMember || 0
      },
      feeTable: feeTable,
      caddyFee: parseRawNumber(item['기타비용']?.['캐디피']),
      cartFee: parseRawNumber(item['기타비용']?.['카트피']),
      feeRemarks: item['요금_특이사항'] || '',
      privilege: {
        summary: item['기본정보']?.['회원권종류'], // Placeholder
        usageLimit: ''
      }
    }
  };
}

function processCondo(item) {
  return {
    id: String(item.id),
    name: item.name,
    category: 'Condo',
    price: {
      current: item.price?.current || 0,
      display: item.price?.display || '',
      highYear: item.price?.high || 0,
      lowYear: item.price?.low || 0,
      allTimeHigh: item.price?.all_time_high || 0,
      initial: 0
    },
    fees: {
      transfer: 330000,
      tax: 0,
      commission: 0,
      acquisitionTaxRate: 0.022
    },
    info: {
      vendor: item.info?.company,
      homepage: item.info?.website,
      Address: item.info?.address,
      phone: ''
    },
    tags: [item.region ? `#${item.region}` : ''].filter(Boolean),
    detailUrl: '',
    condoSpec: {
      roomType: item.name.split(' ').pop() || '',
      availableTypes: item.details?.['회원권종류'] || '',
      qualification: item.details?.['입회자격'] || '',
      ownership: 'Membership', // Default
      usage: {
        daysPerYear: 30, // Default
        chainResorts: [],
        weekendDays: 10
      },
      benefits: {
        summary: item.details?.['회원특전'] || ''
      },
      facilities: item.details?.['부대시설'] || '',
      remarks: item.details?.['특이사항'] || ''
    }
  };
}

function processFitness(item) {
  const fees = item.fees || [];
  const annualFeeObj = fees.find(f => f && f['구분'] && f['구분'].includes('연회비')) || {};
  const transferFeeObj = fees.find(f => f && f['구분'] && f['구분'].includes('개서료')) || {};

  let transferFeeValue = 550000;
  // transferFeeObj format: { "구분": "개서료", "개인": "...", "부부": "..." }
  // We'll prioritize 'personal' then 'couple' fee as default
  if (transferFeeObj['개인']) {
    transferFeeValue = parseRawNumber(transferFeeObj['개인']);
  } else if (transferFeeObj['부부']) {
    transferFeeValue = parseRawNumber(transferFeeObj['부부']);
  }

  // Determine type (Personal/Couple) from name
  let type = 'personal';
  if (item.name.includes('부부')) type = 'couple';
  if (item.name.includes('법인')) type = 'corporate';

  let specificTransferFee = transferFeeValue;
  if (type === 'couple' && transferFeeObj['부부']) specificTransferFee = parseRawNumber(transferFeeObj['부부']);
  if (type === 'corporate' && transferFeeObj['법인']) specificTransferFee = parseRawNumber(transferFeeObj['법인']);

  return {
    id: String(item.id),
    name: item.name,
    category: 'Fitness',
    price: {
      current: item.price?.current || 0,
      display: item.price?.display || '',
      highYear: item.price?.high || 0,
      lowYear: item.price?.low || 0,
      allTimeHigh: item.price?.all_time_high || 0,
      initial: 0
    },
    fees: {
      transfer: specificTransferFee,
      tax: 0,
      commission: 500000, // Default
      acquisitionTaxRate: 0.022
    },
    info: {
      vendor: item.info?.['호텔명'],
      homepage: item.info?.['웹사이트'],
      Address: item.info?.['주소'],
      phone: item.info?.['전화'],
      operatingHours: item.info?.['운영시간'], // 추가
      closedDays: item.info?.['정기휴장일'] // 추가
    },
    tags: [item.region ? `#${item.region}` : ''].filter(Boolean),
    detailUrl: '',
    fitnessSpec: {
      facility: {
        hasGym: true,
        hasPool: (item.details?.['시설안내'] || '').includes('수영장'),
        hasSauna: (item.details?.['시설안내'] || '').includes('사우나'),
        hasGolfRange: (item.details?.['시설안내'] || '').includes('골프')
      },
      facilityInfo: item.details?.['시설안내'] || '', // 추가
      annualFee: {
        personal: parseRawNumber(annualFeeObj['개인']),
        couple: parseRawNumber(annualFeeObj['부부']),
        corporate: parseRawNumber(annualFeeObj['법인'])
      },
      familyBenefits: item.details?.['입회자격'] || '',
      complimentary: item.details?.['회원특전'] || ''
    }
  };
}


function main() {
  console.log('Starting data generation...');
  console.log('Reading from:', DATA_DIR);

  const golfData = loadJson(GOLF_FILE);
  console.log(`Loaded ${golfData.length} Golf items`);
  const condoData = loadJson(CONDO_FILE);
  console.log(`Loaded ${condoData.length} Condo items`);
  const fitnessData = loadJson(FITNESS_FILE);
  console.log(`Loaded ${fitnessData.length} Fitness items`);

  const processedGolf = golfData.map(processGolf);
  const processedCondo = condoData.map(processCondo);
  const processedFitness = fitnessData.map(processFitness);

  const allMemberships = [...processedGolf, ...processedCondo, ...processedFitness];

  console.log(`Total processed items: ${allMemberships.length}`);

  const fileContent = `// 🤖 Auto-generated by Rangkue Bot
// Date: ${new Date().toISOString()}

${INTERFACES}

// --- [6. 샘플 데이터] ---
export const CRAWLED_MEMBERSHIPS: MembershipItem[] = ${JSON.stringify(allMemberships, null, 2)};
`;

  fs.writeFileSync(OUTPUT_FILE, fileContent, 'utf8');
  console.log(`Successfully wrote to ${OUTPUT_FILE}`);
}

main();
