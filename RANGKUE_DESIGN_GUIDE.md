# 🎱 RANGKUE (랭큐) 디자인 가이드 (v1.1)

본 문서는 RANGKUE 서비스의 정체성을 확립하고, 사용자에게 일관된 **프리미엄 다크 & 네온(Neon) 경험**을 제공하기 위한 디자인 원칙을 정의합니다. 특히 업로드된 'Quick Command' UI를 핵심 레퍼런스로 삼습니다.

---

## 1. Core Visual Identity (핵심 정체성)

- **Concept**: Bento Premium Dark (체계적이고 직관적인 프리미엄 다크 모드)
- **Keyword**: Bento-Grid, Glassmorphism, Neon-Accent, Depth
- **Ambience**: 심야의 세련된 클럽이나 전문 경기장에서 느껴지는 집중력과 강렬한 포인트 컬러의 조화

## 2. Color Palette (컬러 팔레트)

### 🎨 Primary Styling

- **Background (Base)**: `#0A0A0A` (Deepest Black) - 전체 화면의 기본 배경색.
- **Surface (Card)**: `#141414` 또는 `rgba(255, 255, 255, 0.05)` - 카드 및 섹션 구분용. 미세한 입체감을 위해 배경보다 약간 밝게 설정.
- **Accent (Rankue Green)**: `#10B981` (Vibrant Emerald) - 포인트 컬러, 아이콘 배경, 활성 상태 표시.
- **Border/Line**: `rgba(255, 255, 255, 0.1)` - 카드의 테두리나 구분선에 사용하는 아주 얇고 섬세한 라인.

### 📝 Typography Color

- **Headline/Title**: `#FFFFFF` (Pure White) - 카드 제목 및 핵심 정보.
- **Sub-headline**: `rgba(255, 255, 255, 0.6)` - 보조 안내 텍스트 (예: 영문 병기 텍스트).
- **Secondary/Description**: `rgba(255, 255, 255, 0.4)` - 덜 중요한 정보나 설명글.

---

## 3. Layout & Component Rules (레이아웃 및 컴포넌트)

### 🍱 Bento Grid System (벤토 그리드)

- **Structure**: 중요도에 따라 1x1, 1x2(세로형), 2x1(가로형) 등 다양한 크기의 카드를 격자 형태로 배치.
- **Spacing**: 카드 사이의 간격(Gap)은 `16px` 이상으로 충분히 확보하여 시각적 여백을 제공.

### 🗂️ Card Design (카드 디자인)

- **Shape**: `rounded-[2.5rem]` (아주 큰 라운드 값)을 사용하여 현대적이고 부드러운 느낌 강조.
- **Icon Block**: 카드 내부 아이콘은 원형 또는 둥근 사각형 배경(`bg-white/5` 등) 위에 배치하여 버튼처럼 인지되도록 함.
- **Hover/Active**: 상호작용 시 미세한 스케일 업(`scale-[1.02]`) 또는 내부 그림자 변화로 피드백 제공.

### ⌨️ Input Fields (입력 필드)

- **Style**: 배경색을 배제하고 **두께 2px의 하단 밑줄(Bottom Border)**만 사용.
- **Focus**: 입력 필드 포커싱 시 밑줄 컬러를 `Rankue Green (#10B981)`으로 변경하며 Glow 효과 추가.

---

## 4. Typography Rules (타이포그래피)

1. **Dual Language Pairing**: 국문 제목 아래에 영문 서브 제목을 병기하여 글로벌하고 전문적인 느낌을 연출 (예: 혼자 연습하기 / PRACTICE MODE).
2. **Contrast**: 메인 텍스트는 `font-bold`, 서브 텍스트는 `font-medium` 및 낮은 불투명도를 적용하여 계층 구조 형성.
3. **Spacing**: 가독성을 위해 적절한 자간(`tracking-tight` or `wider`) 적용.

---

## 5. UX Principles (사용자 경험 원칙)

1. **Hierarchy through Size**: 가장 자주 사용하는 기능(연습, 대결)은 큰 카드로, 보조 기능은 작은 카드로 설계하여 사용자 시선을 유도합니다.
2. **Glassmorphism**: 카드 배경에 `backdrop-blur`와 반투명 배경을 조합하여 깊이감(Depth)을 형성합니다.
3. **Micro-interactions**: 버튼 클릭이나 카드 진입 시 부드러운 트랜지션을 적용하여 사용자에게 즐거움을 제공합니다.

---

**RANKUE: The Smartest Way to Level Up Your Billiards.**
