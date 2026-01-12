
import os
import re
import time
import json
import requests
import nltk
from datetime import datetime
from difflib import SequenceMatcher
from dotenv import load_dotenv
from bs4 import BeautifulSoup
from newspaper import Article
from supabase import create_client, Client
from openai import OpenAI
from apscheduler.schedulers.blocking import BlockingScheduler

# NLTK 데이터 다운로드 (newspaper3k 필수)
try:
    nltk.download('punkt')
except:
    pass

# 환경 변수 로드
load_dotenv()

# API 설정
NAVER_CLIENT_ID = os.getenv("NAVER_CLIENT_ID")
NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# 클라이언트 초기화
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
openai = OpenAI(api_key=OPENAI_API_KEY)

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"

def get_similarity(a, b):
    """제목 유사도 계산 (difflib)"""
    return SequenceMatcher(None, a, b).ratio()

def fetch_naver_news(query='정치', display=100):
    """1. 네이버 뉴스 수집"""
    url = f"https://openapi.naver.com/v1/search/news.json?query={query}&display={display}&sort=sim"
    headers = {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET
    }
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        return response.json().get('items', [])
    print(f"❌ 네이버 API 호출 실패: {response.status_code}")
    return []

def filter_duplicates(items):
    """2. 제목 유사도 기반 중복 제거 (0.6 이상)"""
    unique_items = []
    for item in items:
        is_duplicate = False
        clean_title = item['title'].replace('<b>', '').replace('</b>', '').replace('&quot;', '"')
        item['clean_title'] = clean_title
        
        for u_item in unique_items:
            if get_similarity(clean_title, u_item['clean_title']) >= 0.6:
                is_duplicate = True
                break
        
        if not is_duplicate:
            try:
                res = supabase.table("news_articles").select("id").eq("original_link", item['link']).execute()
                if not res.data:
                    unique_items.append(item)
            except:
                unique_items.append(item)
    
    print(f"✅ 필터링 완료: {len(items)}개 -> {len(unique_items)}개 신규 기사")
    return unique_items

def clean_content(text):
    """본문 정제: 불필요한 텍스트 제거 및 포맷팅"""
    if not text:
        return ""
    
    # 제거할 패턴들
    junk_patterns = [
        r'기사 섹션 분류 안내.*?섹션으로 분류됩니다\.',
        r'※.*?YTN.*',
        r'\[카카오톡\].*',
        r'\[전화\].*',
        r'\[메일\].*',
        r'Copyright ⓒ.*',
        r'무단 전재.*',
        r'저작권자.*',
        r'▶.*?바로가기',
        r'▶.*?구독하기',
    ]
    
    for pattern in junk_patterns:
        text = re.sub(pattern, '', text, flags=re.DOTALL | re.IGNORECASE)
    
    # 연속된 공백/줄바꿈 정리
    text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)  # 3개 이상의 줄바꿈을 2개로
    text = re.sub(r' +', ' ', text)  # 연속된 공백을 1개로
    
    return text.strip()

def crawl_article(url):
    """3. 하이브리드 크롤링 & 본문 정규화 (네이버 타겟팅)"""
    image_url = None
    content = ""
    is_ai_generated = False

    try:
        # A. newspaper3k (기본)
        article = Article(url, language='ko', keep_article_html=False)
        article.download()
        article.parse()
        content = article.text
        image_url = article.top_image
    except Exception as e:
        print(f"⚠️ newspaper3k 실패: {url}")

    # B. BeautifulSoup Fallback (본문이 너무 짧거나 네이버 안내문일 때)
    if not content or len(content) < 150 or "기사 섹션 분류 안내" in content:
        try:
            headers = {"User-Agent": USER_AGENT}
            resp = requests.get(url, headers=headers, timeout=10)
            soup = BeautifulSoup(resp.content, 'html.parser', from_encoding='utf-8')
            
            # 불필요한 태그 제거 (공지사항, 안내글 등)
            for junk in soup.select('.newsct_notice, .n_news_notice, .news_notice, .news_section_info, footer, header, script, style, iframe'):
                junk.decompose()
            
            # 네이버 뉴스 특화 본문 선택자
            naver_selectors = [
                '#articleBodyContents', 
                '#articeBody', 
                '.newsct_article', 
                '#newsct_article', 
                '#contents'
            ]
            
            article_body = None
            for selector in naver_selectors:
                article_body = soup.select_one(selector)
                if article_body: break
            
            if article_body:
                content = article_body.get_text(separator='\n', strip=True)
            else:
                # 최후의 수단: body에서 스크립트 제외하고 긁기
                content = soup.get_text(separator='\n', strip=True)
                
            # 이미지 추출
            og_image = soup.find("meta", property="og:image")
            if og_image:
                image_url = og_image["content"]
                
        except Exception as e:
            print(f"⚠️ BeautifulSoup 실패 ({url}): {e}")

    # 본문 정제
    content = clean_content(content)
    
    return content, image_url, is_ai_generated

def ai_recovery(title, description):
    """4. 크롤링 실패 시 AI 복원 모드"""
    print(f"🤖 AI 복원 모드 진입: {title[:20]}...")
    prompt = f"다음 뉴스 제목과 요약을 바탕으로, 맥락을 잇는 3~4문단의 기사 형식 설명글을 작성해줘. 아주 자연스러운 뉴스 기사 문체여야 해.\n제목: {title}\n요약: {description}"
    
    response = openai.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7
    )
    return response.choices[0].message.content, True

def analyze_mind(content):
    """5. AI 속마음 분석 (명시적 스키마 강제)"""
    system_prompt = """너는 30년 차 베테랑 정치부 기자이자 냉소적인 논평가다. 기사의 표면적 내용 뒤에 숨겨진 의도를 파악해라.
    반드시 다음 키를 가진 JSON으로만 응답해라:
    - hidden_intent: 기사의 진짜 속뜻 (냉소적이고 날카로운 어조)
    - translation: 기사를 아주 시니컬하게 요약한 한 줄
    - fact_check: 기사의 팩트와 주장 분석 (팩트인지 기자의 뇌피셜인지 구분)
    """
    user_prompt = f"다음 기사를 분석해:\n\n{content}"
    
    try:
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"❌ AI 분석 실패: {e}")
        return None

def process_job():
    print(f"🚀 작업 시작: {datetime.now()}")
    
    # 다양한 카테고리에서 뉴스 수집
    categories = {
        '정치': 15,
        '경제': 10,
        '사회': 10,
        '국제': 5,
        '스포츠': 5,
        'IT과학': 5,
        '연예': 5
    }
    
    total_saved = 0
    
    for category, limit in categories.items():
        print(f"\n📰 [{category}] 카테고리 수집 시작...")
        raw_news = fetch_naver_news(query=category, display=50)
        new_news = filter_duplicates(raw_news)
        
        for item in new_news[:limit]:
            try:
                content, image, is_ai = crawl_article(item['link'])
                
                # 본문 정제 및 복원
                if not content or len(content) < 150:
                    content, is_ai = ai_recovery(item['clean_title'], item['description'])
                
                analysis = analyze_mind(content)
                if not analysis: continue
                
                try:
                    pub_date = datetime.strptime(item['pubDate'], '%a, %d %b %Y %H:%M:%S +0900')
                except:
                    pub_date = datetime.now()
                
                data = {
                    "title": item['clean_title'],
                    "original_link": item['link'],
                    "published_at": pub_date.isoformat(),
                    "image_url": image,
                    "content": content,
                    "category": category,
                    "is_ai_generated": is_ai,
                    "mind_translation": analysis
                }
                
                supabase.table("news_articles").insert(data).execute()
                total_saved += 1
                print(f"✅ 저장 완료 [{category}]: {item['clean_title'][:30]}")
                time.sleep(1)
                
            except Exception as e:
                print(f"❌ 처리 중 오류 ({item['link']}): {e}")
        
        print(f"✅ [{category}] 완료: {min(len(new_news), limit)}개 처리")
    
    print(f"\n🎉 전체 작업 완료: 총 {total_saved}개 기사 저장")

if __name__ == "__main__":
    print("🔥 뉴스 속마음 번역기 수집기 가동 중...")
    process_job()
    
    scheduler = BlockingScheduler()
    scheduler.add_job(process_job, 'interval', minutes=30)
    scheduler.start()
