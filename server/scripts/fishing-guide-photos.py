"""
어류 도감의 사진 — 위키미디어 공용의 사진을 라이선스를 확인해 받아 둔다(2026-10-14 오너: "사진 위키백과 써도 돼 적용해 줘").

    python3 -I server/scripts/fishing-guide-photos.py [자료 폴더 — 기본 ~/Desktop/Antigravity/_content]
    (그다음 npx tsx server/scripts/fishing-build-guides.ts 로 글 파일에 사진을 붙인다)

- 사진 주소는 도감 자료(fish_guides.json)의 image. **위키미디어 공용(commons)에 있는 파일만** 쓴다 — 한국어 위키백과에 따로 올라간 파일은
  비자유(공정 이용)일 수 있어 뺀다.
- 파일마다 공용 API 로 작가 · 라이선스를 받아 **자유 라이선스만**(CC0 · 퍼블릭 도메인 · CC BY · CC BY-SA) 쓴다. NC · ND · GFDL 단독 · 모르는 것은 뺀다.
- 받은 사진은 우리 쪽에 줄여 둔다(640px 한 장 + 목록용 120px) — client/public/fishing/guide/img/<key>.webp · <key>-s.webp.
  작가 · 라이선스 · 파일 문서 주소는 photos.json 에 — 화면이 사진 밑에 적는다(CC BY · BY-SA 의 표시 의무).
- 공용 API 는 한 번에 40개씩, 받기는 한 장씩 쉬어 가며(위키미디어의 이용 규칙: 이름을 밝힌 User-Agent).
"""
import hashlib, html, io, json, os, re, sys, time, urllib.parse, urllib.request
from PIL import Image

SRC = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Desktop/Antigravity/_content"))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../client/public/fishing/guide")
IMG = os.path.join(OUT, "img")
UA = "RankueFishingGuide/1.0 (https://www.rankue.co.kr)"
FREE = re.compile(r"^(cc0|cc[ -]by(-sa)?([ -]\d(\.\d)?)?([ -][a-z]{2,})?|public domain|pd([ -].*)?|no restrictions|attribution)$", re.I)
BAD = re.compile(r"\b(nc|nd)\b|non-?commercial|no ?deriv|fair use|non-?free", re.I)


def key_of(i: str) -> str:
    return i if re.fullmatch(r"\d+", i) else "w" + hashlib.sha1(i.encode("utf-8")).hexdigest()[:10]


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for n in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception as e:  # 429 · 일시 오류는 쉬었다 다시
            if n == 3:
                raise
            time.sleep(3 * (n + 1))
    raise RuntimeError("unreachable")


def plain(s: str, n: int) -> str:
    t = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    t = re.sub(r"\s+", " ", t).strip()
    return t[:n]


guides = json.load(open(os.path.join(SRC, "out/fishing/fish_guides.json"), encoding="utf-8"))
want = {}
for g in guides:
    u = g.get("image")
    if not u or "/wikipedia/commons/" not in u:
        continue
    name = urllib.parse.unquote(u.split("?")[0].rsplit("/", 1)[-1])
    want["File:" + name] = key_of(g["id"])
print(f"공용 파일 {len(want)}장", flush=True)

os.makedirs(IMG, exist_ok=True)
titles = list(want.keys())
info = {}
for i in range(0, len(titles), 40):
    chunk = titles[i:i + 40]
    q = urllib.parse.urlencode({"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url|extmetadata|mime", "iiurlwidth": "640", "titles": "|".join(chunk)})
    data = json.loads(get("https://commons.wikimedia.org/w/api.php?" + q))
    norm = {n["to"]: n["from"] for n in data.get("query", {}).get("normalized", [])}
    for p in data.get("query", {}).get("pages", {}).values():
        t = norm.get(p.get("title"), p.get("title"))
        ii = (p.get("imageinfo") or [None])[0]
        if ii:
            info[t] = ii
    time.sleep(0.5)

photos, skipped = {}, {}
for t, key in want.items():
    ii = info.get(t)
    if not ii:
        skipped[key] = "공용에 없음"
        continue
    m = ii.get("extmetadata", {})
    lic = plain((m.get("LicenseShortName") or {}).get("value", ""), 40)
    if not lic or BAD.search(lic) or not FREE.match(lic):
        skipped[key] = f"라이선스 {lic or '없음'}"
        continue
    if not str(ii.get("mime", "")).startswith("image/") or ii.get("mime") == "image/svg+xml":
        skipped[key] = f"형식 {ii.get('mime')}"
        continue
    author = plain((m.get("Artist") or {}).get("value", ""), 80) or plain((m.get("Credit") or {}).get("value", ""), 80) or "작가 표기 없음"
    lic_url = (m.get("LicenseUrl") or {}).get("value") or ""
    try:
        raw = get(ii.get("thumburl") or ii["url"])
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        big = im.copy(); big.thumbnail((640, 640), Image.LANCZOS); big.save(os.path.join(IMG, f"{key}.webp"), "WEBP", quality=72, method=6)
        small = im.copy(); small.thumbnail((120, 120), Image.LANCZOS); small.save(os.path.join(IMG, f"{key}-s.webp"), "WEBP", quality=70, method=6)
    except Exception as e:
        skipped[key] = f"받기 실패 {type(e).__name__}"
        continue
    photos[key] = {"w": big.width, "h": big.height, "author": author, "license": lic, "licenseUrl": lic_url if lic_url.startswith("http") else None, "page": ii.get("descriptionurl")}
    time.sleep(0.35)
    if len(photos) % 40 == 0:
        print(f"  {len(photos)}장", flush=True)

json.dump(photos, open(os.path.join(OUT, "photos.json"), "w", encoding="utf-8"), ensure_ascii=False)
from collections import Counter
print(f"받음 {len(photos)}장 · 뺌 {len(skipped)}장", Counter(v.split(' ')[0] + (' ' + v.split(' ')[1] if v.startswith('라이선스') else '') for v in skipped.values()).most_common(8))
print("라이선스:", Counter(p["license"] for p in photos.values()).most_common(8))
