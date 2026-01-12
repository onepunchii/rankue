import os

# 1. 엑셀에 들어갈 데이터 (글로벌 1위~184위)
csv_content = """rank,name,group,gender,type
1,쑨헝위,MODYSSEY,Male,Solo
2,리즈하오,MODYSSEY,Male,Solo
3,윌리엄,LYKN,Male,Solo
4,샤오잔,,Male,Solo
5,판저이,MODYSSEY,Male,Solo
6,위슈신,,Female,Solo
7,MODYSSEY,MODYSSEY,Male,Group
8,셀레나 고메즈,,Female,Solo
9,저스틴 비버,,Male,Solo
10,쉬에수런,MODYSSEY,Male,Solo
11,이첸,MODYSSEY,Male,Solo
12,아니타,,Female,Solo
13,LYKN,LYKN,Male,Group
14,올리비아 로드리고,,Female,Solo
15,덩쯔치,,Female,Solo
16,케이티 페리,,Female,Solo
17,니키 미나즈,,Female,Solo
18,왕이보,,Male,Solo
19,두아 리파,,Female,Solo
20,자오광쉬,MODYSSEY,Male,Solo
21,로살리아,,Female,Solo
22,브루노 마스,,Male,Solo
23,리한나,,Female,Solo
24,나가오 켄토,나니와단시,Male,Solo
25,테일러 스위프트,,Female,Solo
26,배드 버니,,Male,Solo
27,카밀라 카베요,,Female,Solo
28,카롤 G,,Female,Solo
29,페소 플루마,,Male,Solo
30,베키 G,,Female,Solo
31,드레이크,,Male,Solo
32,위켄드,,Male,Solo
33,라나 델 레이,,Female,Solo
34,트래비스 스콧,,Male,Solo
35,아리아나 그란데,,Female,Solo
36,에드 시런,,Male,Solo
37,빌리 아일리시,,Female,Solo
38,숀 멘데스,,Male,Solo
39,해리 스타일스,,Male,Solo
40,아델,,Female,Solo
41,타일라,,Female,Solo
42,더 키드 라로이,,Male,Solo
43,트로이 시반,,Male,Solo
44,사브리나 카펜터,,Female,Solo
45,포스트 말론,,Male,Solo
46,도자캣,,Female,Solo
47,라우 알레한드로,,Male,Solo
48,켄드릭 라마,,Male,Solo
49,에미넴,,Male,Solo
50,퓨처,,Male,Solo
51,SZA,,Female,Solo
52,DJ 스네이크,,Male,Solo
53,찰리 푸스,,Male,Solo
54,앤 마리,,Female,Solo
55,찰리 XCX,,Female,Solo
56,선뚱 M-TP,,Male,Solo
57,까오칭천,,Male,Solo
58,Sunnee,,Female,Solo
59,정나이신,,Female,Solo
60,조이스 추,,Female,Solo
61,쑨옌쯔,,Female,Solo
62,앙군,,Female,Solo
63,미떰,,Female,Solo
64,에메,,Female,Solo
65,아이묭,,Female,Solo
66,후지이 카제,,Male,Solo
67,요네즈 켄시,,Male,Solo
68,리사,,Female,Solo
69,아도,,Female,Solo
70,이리,,Female,Solo
71,챤미나,,Female,Solo
72,바운디,,Male,Solo
73,류위,,Male,Solo
74,류위신,,Female,Solo
75,쥐징이,,Female,Solo
76,송야쉔,,Male,Solo
77,주심,,Male,Solo
78,탄젠츠,,Male,Solo
79,야오천,,Male,Solo
80,선의순,,Female,Solo
81,화천위,,Male,Solo
82,장비천,,Female,Solo
83,쉐즈첸,,Male,Solo
84,주걸륜,,Male,Solo
85,왕신링,,Female,Solo
86,채의림,,Female,Solo
87,진혁신,,Male,Solo
88,임준걸,,Male,Solo
89,유우리,,Male,Solo
90,소타,BE:FIRST,Male,Solo
91,슌토,BE:FIRST,Male,Solo
92,마나토,BE:FIRST,Male,Solo
93,류헤이,BE:FIRST,Male,Solo
94,쥬논,BE:FIRST,Male,Solo
95,료키,BE:FIRST,Male,Solo
96,레오,BE:FIRST,Male,Solo
97,쿠도 타이키,Da-iCE,Male,Solo
98,이와오카 토오루,Da-iCE,Male,Solo
99,오노 유다이,Da-iCE,Male,Solo
100,하나무라 소타,Da-iCE,Male,Solo
101,와다 하야테,Da-iCE,Male,Solo
102,카이류,MAZZEL,Male,Solo
103,나오야,MAZZEL,Male,Solo
104,란,MAZZEL,Male,Solo
105,세이토,MAZZEL,Male,Solo
106,류키,MAZZEL,Male,Solo
107,타쿠토,MAZZEL,Male,Solo
108,하야토,MAZZEL,Male,Solo
109,에이키,MAZZEL,Male,Solo
110,오모리 모토키,Mrs. GREEN APPLE,Male,Solo
111,와카이 히로토,Mrs. GREEN APPLE,Male,Solo
112,후지사와 료카,Mrs. GREEN APPLE,Male,Solo
113,세카이,FANTASTICS,Male,Solo
114,사토 타이키,FANTASTICS,Male,Solo
115,사와모토 나츠키,FANTASTICS,Male,Solo
116,세구치 레이야,FANTASTICS,Male,Solo
117,호리 나츠키,FANTASTICS,Male,Solo
118,키무라 케이토,FANTASTICS,Male,Solo
119,야기 유세이,FANTASTICS,Male,Solo
120,나카지마 소타,FANTASTICS,Male,Solo
121,히다카 류타,BALLISTIK BOYZ,Male,Solo
122,카노 요시유키,BALLISTIK BOYZ,Male,Solo
123,카이누마 류세이,BALLISTIK BOYZ,Male,Solo
124,후카호리 미쿠,BALLISTIK BOYZ,Male,Solo
125,오쿠다 리키야,BALLISTIK BOYZ,Male,Solo
126,마츠이 리키,BALLISTIK BOYZ,Male,Solo
127,스나다 마사히로,BALLISTIK BOYZ,Male,Solo
128,이쿠타리라,YOASOBI,Female,Solo
129,제임스,DEXX,Male,Solo
130,튜터,DEXX,Male,Solo
131,임,DEXX,Male,Solo
132,뻐,DEXX,Male,Solo
133,띠띠,DEXX,Male,Solo
134,우우,DEXX,Male,Solo
135,알란,BUS,Male,Solo
136,마크리스,BUS,Male,Solo
137,쿤폴,BUS,Male,Solo
138,하트,BUS,Male,Solo
139,진욱,BUS,Male,Solo
140,타이,BUS,Male,Solo
141,넥스,BUS,Male,Solo
142,푸탓차이,BUS,Male,Solo
143,코퍼,BUS,Male,Solo
144,에에,BUS,Male,Solo
145,장티,BUS,Male,Solo
146,핌와수,BUS,Male,Solo
147,후지와라 죠이치로,나니와단시,Male,Solo
148,니시하타 다이고,나니와단시,Male,Solo
149,오오하시 카즈야,나니와단시,Male,Solo
150,타카하시 쿄헤이,나니와단시,Male,Solo
151,오오니시 류세이,나니와단시,Male,Solo
152,미치에다 슌스케,나니와단시,Male,Solo
153,이와모토 히카루,스노우맨,Male,Solo
154,후카자와 타츠야,스노우맨,Male,Solo
155,라울,스노우맨,Male,Solo
156,와타나베 쇼타,스노우맨,Male,Solo
157,무카이 코지,스노우맨,Male,Solo
158,아베 료헤이,스노우맨,Male,Solo
159,메구로 렌,스노우맨,Male,Solo
160,미야다테 료타,스노우맨,Male,Solo
161,사쿠마 다이스케,스노우맨,Male,Solo
162,주니어,ATLAS,Male,Solo
163,젯,ATLAS,Male,Solo
164,품,ATLAS,Male,Solo
165,나이스,ATLAS,Male,Solo
166,어윈,ATLAS,Male,Solo
167,뮤온,ATLAS,Male,Solo
168,태드,ATLAS,Male,Solo
169,너트,LYKN,Male,Solo
170,홍,LYKN,Male,Solo
171,투이,LYKN,Male,Solo
172,레고,LYKN,Male,Solo
173,BE:FIRST,BE:FIRST,Male,Group
174,Da-iCE,Da-iCE,Male,Group
175,Mrs. GREEN APPLE,Mrs. GREEN APPLE,Male,Group
176,FANTASTICS,FANTASTICS,Male,Group
177,BALLISTIK BOYZ,BALLISTIK BOYZ,Male,Group
178,스노우맨,스노우맨,Male,Group
179,ATLAS,ATLAS,Male,Group
180,MAZZEL,MAZZEL,Male,Group
181,나니와단시,나니와단시,Male,Group
182,DEXX,DEXX,Male,Group
183,BUS,BUS,Male,Group
184,안차우윗,MODYSSEY,Male,Solo
"""

# 2. 바탕화면(Desktop) 경로 찾기 (맥북 기준)
desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
file_path = os.path.join(desktop_path, "global_idol.csv")

# 3. 파일 저장 (UTF-8 인코딩)
try:
    with open(file_path, "w", encoding="utf-8-sig") as f:
        f.write(csv_content)
    print(f"🎉 성공! 바탕화면에 'global_idol.csv' 파일이 생성되었습니다.")
    print(f"저장 위치: {file_path}")
except Exception as e:
    print(f"❌ 오류 발생: {e}")