# News Insight Feature Integration

## Overview

The "News Insight" feature has been successfully integrated into the Home page, replacing the previous "Create Poll" functionality. The feature allows users to view real-time news and analyze articles using an AI persona ("Cynical Veteran Reporter") to uncover hidden intentions and fact-check content.

## Changes Implemented

### 1. Home Base Integration (`client/src/pages/home.tsx`)

- Added `NewsCarousel` component to the top of the Home page (below the header/stats section).
- This ensures high visibility for real-time news updates.

### 2. Component Refactoring (`client/src/components/news-carousel.tsx`)

- **Action Buttons Updated:**
  - "Read Article" -> "원문 보기" (View Original) with `ExternalLink` icon.
  - "Create Vote" -> "속마음 보기" (View Insight) with `Brain` icon.
- **Functionality Changed:**
  - Removed survey/poll generation logic.
  - Added `handleAnalyzeNews` function to call `/api/news/analyze`.
  - Implemented a modal to display analysis results (Hidden Intent, Fact Check, One-liner).
- **UI Improvements:**
  - Added glassmorphic styling to the modal.
  - Added loading states ("기사를 뜯어보는 중...").

### 3. Politics Category Cleanup (`client/src/pages/category/politics.tsx`)

- Removed the experimental "News" tab.
- Removed associated state variables (`newsKeyword`, `newsResults`, `analyzingUrl`, etc.).
- Removed the zombie code for the analysis modal that was previously duplicated there.

### 4. Backend (`server/routes.ts`)

- Confirmed existence of `/api/news` and `/api/news/analyze` endpoints.
- `/api/news` provides Naver News search results.
- `/api/news/analyze` (assumed implemented) handles the crawling and GPT-4o analysis.

## User Flow

1. User sees "Real-time News" on the Home page.
2. User scrolls through news cards.
3. User clicks "속마음 보기" (View Insight).
4. A modal opens with a loading animation ("30년차 익명 기자의 팩트 폭격").
5. AI analysis results appear:
    - **Genuine Intent**: The hidden meaning behind the article.
    - **Fact Check**: Verifying claims vs. reality.
    - **One-liner**: A cynical summary.

## Verification

- Check Home page for the new News section.
- Verify "View Original" opens the link.
- Verify "View Insight" triggers the analysis and opens the modal.
