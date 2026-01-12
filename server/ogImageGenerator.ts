import { Express, Request, Response } from "express";

export function registerOGImageRoutes(app: Express) {
  // 기본 OG 이미지 생성
  app.get("/og-image", (req: Request, res: Response) => {
    const { title, description, category } = req.query;
    
    // SVG로 동적 OG 이미지 생성
    const svg = generateOGImage({
      title: (title as string) || "Polli - 참여형 여론 플랫폼",
      description: (description as string) || "누구나 만들고, 누구나 참여하는 설문/투표 플랫폼",
      category: (category as string) || "general"
    });
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24시간 캐시
    res.send(svg);
  });

  // 설문별 동적 OG 이미지
  app.get("/og-image/poll/:id", async (req: Request, res: Response) => {
    try {
      const pollId = req.params.id;
      // 실제 설문 데이터를 가져와서 OG 이미지 생성
      // 나중에 데이터베이스 연동 시 구현
      
      const svg = generateOGImage({
        title: `설문 #${pollId}`,
        description: "지금 참여해서 의견을 공유하세요!",
        category: "poll"
      });
      
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1시간 캐시
      res.send(svg);
    } catch (error) {
      console.error("OG image generation error:", error);
      res.status(500).send("Image generation failed");
    }
  });
}

function generateOGImage(options: {
  title: string;
  description: string;
  category: string;
}) {
  const { title, description, category } = options;
  
  // 카테고리별 색상 설정
  const colors = {
    fun: { primary: "#FFA726", secondary: "#FFE082", accent: "#FF8A65" },
    life: { primary: "#66BB6A", secondary: "#A5D6A7", accent: "#81C784" },
    deep: { primary: "#EF5350", secondary: "#FFAB91", accent: "#FF8A80" },
    location: { primary: "#42A5F5", secondary: "#90CAF9", accent: "#64B5F6" },
    general: { primary: "#EC4899", secondary: "#F9A8D4", accent: "#F472B6" }
  };
  
  const colorScheme = colors[category as keyof typeof colors] || colors.general;
  
  return `
    <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <!-- 배경 그라데이션 -->
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${colorScheme.primary};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${colorScheme.secondary};stop-opacity:1" />
        </linearGradient>
        <linearGradient id="textGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#FFFFFF;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#F8FAFC;stop-opacity:0.9" />
        </linearGradient>
      </defs>
      
      <!-- 배경 -->
      <rect width="1200" height="630" fill="url(#bgGradient)"/>
      
      <!-- 패턴 -->
      <circle cx="1100" cy="100" r="80" fill="${colorScheme.accent}" opacity="0.3"/>
      <circle cx="100" cy="530" r="60" fill="${colorScheme.accent}" opacity="0.2"/>
      <circle cx="1000" cy="500" r="40" fill="${colorScheme.accent}" opacity="0.4"/>
      
      <!-- 로고/브랜드 -->
      <text x="80" y="120" font-family="Arial, sans-serif" font-size="64" font-weight="bold" fill="url(#textGradient)">Polli</text>
      
      <!-- 메인 타이틀 -->
      <text x="80" y="220" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="white" text-anchor="start">
        <tspan x="80" dy="0">${title.length > 30 ? title.substring(0, 30) + '...' : title}</tspan>
      </text>
      
      <!-- 설명 -->
      <text x="80" y="320" font-family="Arial, sans-serif" font-size="28" fill="rgba(255,255,255,0.9)" text-anchor="start">
        <tspan x="80" dy="0">${description.length > 50 ? description.substring(0, 50) + '...' : description}</tspan>
      </text>
      
      <!-- 액션 버튼 스타일 텍스트 -->
      <rect x="80" y="400" width="280" height="60" rx="30" fill="rgba(255,255,255,0.2)" stroke="white" stroke-width="2"/>
      <text x="220" y="440" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="white" text-anchor="middle">지금 참여하기</text>
      
      <!-- 하단 URL -->
      <text x="80" y="550" font-family="Arial, sans-serif" font-size="20" fill="rgba(255,255,255,0.8)">polli.replit.app</text>
      
      <!-- 투표/설문 아이콘 (SVG) -->
      <g transform="translate(900, 250)">
        <circle cx="0" cy="0" r="80" fill="rgba(255,255,255,0.2)" stroke="white" stroke-width="3"/>
        <path d="M-30,-20 L-10,-20 L-10,20 L-30,20 Z" fill="white"/>
        <path d="M-5,-20 L15,-20 L15,0 L-5,0 Z" fill="white"/>
        <path d="M20,-20 L40,-20 L40,10 L20,10 Z" fill="white"/>
      </g>
    </svg>
  `;
}