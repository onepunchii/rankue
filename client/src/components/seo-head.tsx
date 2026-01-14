import { useEffect } from 'react';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  structuredData?: object;
}

export function SEOHead({
  title = "Polli - 매일 돈 버는 투표 & 덕질 앱",
  description = "터치 한 번으로 포인트가 쌓여요! 내 최애 아이돌 1등 만들고, 쉬운 정치 참여까지. 지금 바로 무료 투표하고 기프티콘 받아가세요.",
  keywords = "앱테크, 리워드앱, 돈버는앱, 기프티콘, 아이돌투표, 정치참여, 여론조사, 폴리, POLLI",
  image = "https://www.polli.co.kr/polli_og_marketing_v1.png",
  url = "https://www.polli.co.kr",
  type = "website",
  structuredData
}: SEOHeadProps) {
  useEffect(() => {
    // Update document title
    document.title = title;

    // Update meta tags
    updateMetaTag('description', description);
    updateMetaTag('keywords', keywords);
    updateMetaTag('author', 'Polli Team');
    updateMetaTag('robots', 'index, follow');
    updateMetaTag('language', 'ko-KR');
    updateMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1');
    updateMetaTag('naver-site-verification', '2e7af38e33b85d732c6cbdc50728f72e0ee2480e');

    // Open Graph tags
    updateMetaProperty('og:title', title);
    updateMetaProperty('og:description', description);
    updateMetaProperty('og:image', image);
    updateMetaProperty('og:url', url);
    updateMetaProperty('og:type', type);
    updateMetaProperty('og:site_name', 'Polli');
    updateMetaProperty('og:locale', 'ko_KR');

    // Twitter Card tags
    updateMetaProperty('twitter:card', 'summary_large_image');
    updateMetaProperty('twitter:title', title);
    updateMetaProperty('twitter:description', description);
    updateMetaProperty('twitter:image', image);
    updateMetaProperty('twitter:site', '@polli_survey');

    // Additional SEO tags
    updateMetaProperty('application-name', 'Polli');
    updateMetaProperty('theme-color', '#f5499a');
    updateMetaProperty('mobile-web-app-capable', 'yes');
    updateMetaProperty('apple-mobile-web-app-capable', 'yes');
    updateMetaProperty('apple-mobile-web-app-status-bar-style', 'default');

    // Structured data
    if (structuredData) {
      updateStructuredData(structuredData);
    } else {
      // Default organization structured data
      const defaultStructuredData = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Polli",
        "description": "참여형 여론조사 플랫폼",
        "url": "https://www.polli.co.kr",
        "logo": {
          "@type": "ImageObject",
          "url": "https://www.polli.co.kr/polli_og_image.png"
        },
        "sameAs": [
          "https://twitter.com/polli_survey",
          "https://facebook.com/polli.survey"
        ],
        "contactPoint": {
          "@type": "ContactPoint",
          "telephone": "02-1234-5678",
          "contactType": "customer service",
          "email": "enterprise@polli.co.kr"
        }
      };
      updateStructuredData(defaultStructuredData);
    }

  }, [title, description, keywords, image, url, type, structuredData]);

  return null;
}

function updateMetaTag(name: string, content: string) {
  let element = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
  if (!element) {
    element = document.createElement('meta');
    element.name = name;
    document.head.appendChild(element);
  }
  element.content = content;
}

function updateMetaProperty(property: string, content: string) {
  let element = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('property', property);
    document.head.appendChild(element);
  }
  element.content = content;
}

function updateStructuredData(data: object) {
  // Remove existing structured data
  const existing = document.querySelector('script[type="application/ld+json"]');
  if (existing) {
    existing.remove();
  }

  // Add new structured data
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}