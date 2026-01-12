import os

# 1. 유튜버/인플루언서 100명 데이터 (카테고리 포함)
csv_content = """rank,name,category,gender,type
1,쯔양,Mukbang,Female,Influencer
2,김종국(짐종국),Fitness,Male,Influencer
3,침착맨,Talk/Game,Male,Influencer
4,백종원,Cooking,Male,Influencer
5,곽튜브,Travel,Male,Influencer
6,빠니보틀,Travel,Male,Influencer
7,슈카월드,Knowledge,Male,Influencer
8,보겸,Vlog,Male,Influencer
9,감스트,Game/Sports,Male,Influencer
10,히밥,Mukbang,Female,Influencer
11,햄지,Mukbang,Female,Influencer
12,이사배,Beauty,Female,Influencer
13,잇섭,Tech,Male,Influencer
14,김계란(피지컬갤러리),Fitness,Male,Influencer
15,오킹,Talk,Male,Influencer
16,풍자,Talk/Mukbang,Female,Influencer
17,우왁굳,Game/Virtual,Male,Influencer
18,충주맨,Comedy/Public,Male,Influencer
19,덱스,Vlog/Ent,Male,Influencer
20,다나카(김경욱),Comedy,Male,Influencer
21,숏박스,Comedy,Group,Influencer
22,피식대학,Comedy,Group,Influencer
23,너덜트,Comedy,Group,Influencer
24,1분미만,Knowledge,Male,Influencer
25,문복희,Mukbang,Female,Influencer
26,이공삼,Mukbang,Male,Influencer
27,승우아빠,Cooking,Male,Influencer
28,입짧은햇님,Mukbang,Female,Influencer
29,도티,Game/Kids,Male,Influencer
30,대도서관,Game,Male,Influencer
31,잠뜰,Game,Female,Influencer
32,양띵,Game,Female,Influencer
33,악어,Game,Male,Influencer
34,릴카,Game/Vlog,Female,Influencer
35,뜨뜨뜨뜨,Game,Male,Influencer
36,김블루,Game,Male,Influencer
37,혜안,Game,Male,Influencer
38,우주하마,Game,Male,Influencer
39,랄로,Game,Male,Influencer
40,괴물쥐,Game,Male,Influencer
41,파카,Game,Male,Influencer
42,한동숙,Game,Male,Influencer
43,풍월량,Game,Male,Influencer
44,서새봄,Game,Female,Influencer
45,강지,Virtual/Game,Female,Influencer
46,주둥이방송,Talk,Male,Influencer
47,원지의하루,Travel,Female,Influencer
48,채코제,Travel,Male,Influencer
49,희철리즘,Travel,Male,Influencer
50,쏘영,Mukbang,Female,Influencer
51,홍유,Mukbang,Female,Influencer
52,수빙수,Cooking/Mukbang,Female,Influencer
53,육식맨,Cooking,Male,Influencer
54,취미로요리하는남자,Cooking,Male,Influencer
55,아하부장,Cooking,Male,Influencer
56,공혁준,Vlog,Male,Influencer
57,논리왕전기,Talk,Male,Influencer
58,진용진,Planning/Movie,Male,Influencer
59,장삐쭈,Animation,Male,Influencer
60,짤툰,Animation,Male,Influencer
61,총몇명,Animation,Male,Influencer
62,빵빵이의일상,Animation,Male,Influencer
63,과나,Cooking/Music,Male,Influencer
64,사내뷰공업,Comedy,Female,Influencer
65,엄지렐라,Comedy,Female,Influencer
66,미미미누,Edu/Ent,Male,Influencer
67,궤도(안될과학),Science,Male,Influencer
68,긱블,Science/Maker,Group,Influencer
69,조코딩,Coding/Tech,Male,Influencer
70,주우재,Fashion/Ent,Male,Influencer
71,침착한식구들,Vlog,Group,Influencer
72,영국남자,Food/Culture,Group,Influencer
73,올리버쌤,Vlog/Culture,Male,Influencer
74,소맥거핀,Animation,Male,Influencer
75,빨간내복야코,Music/Ani,Male,Influencer
76,팀브라더스,Comedy,Group,Influencer
77,뷰티풀너드,Comedy,Group,Influencer
78,스케치코미디,Comedy,Group,Influencer
79,빠더너스,Comedy,Male,Influencer
80,엔조이커플,Vlog/Couple,Group,Influencer
81,성수커플,Vlog/Couple,Group,Influencer
82,소근커플,Vlog/Couple,Group,Influencer
83,푸메,Mukbang,Female,Influencer
84,설기양,Mukbang,Female,Influencer
85,시네,Mukbang,Female,Influencer
86,제이플라,Music,Female,Influencer
87,빅마블,Music/Ent,Male,Influencer
88,차다빈,Music,Female,Influencer
89,때껄룩,Music/Playlist,Male,Influencer
90,에센셜,Music/Playlist,Group,Influencer
91,가전주부,Tech/Life,Female,Influencer
92,디에디트,Tech/Life,Group,Influencer
93,회사원A,Beauty,Female,Influencer
94,씬님,Beauty,Female,Influencer
95,포니,Beauty,Female,Influencer
96,RISABAE,Beauty,Female,Influencer
97,라뮤끄,Beauty,Female,Influencer
98,조효진,Beauty,Female,Influencer
99,디렉터파이,Beauty,Female,Influencer
100,네고왕,Ent,Group,Influencer
"""

# 2. 바탕화면 경로 찾기
desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
file_path = os.path.join(desktop_path, "influencer.csv")

# 3. 파일 저장
try:
    with open(file_path, "w", encoding="utf-8-sig") as f:
        f.write(csv_content)
    print(f"🎉 성공! 바탕화면에 'influencer.csv' 파일이 생성되었습니다.")
    print(f"저장 위치: {file_path}")
except Exception as e:
    print(f"❌ 오류 발생: {e}")