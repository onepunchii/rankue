import os

# 1. 트로트 가수 100명 데이터 (전설 + 현역 + 오디션 스타)
csv_content = """rank,name,gender,type
1,임영웅,Male,Trot
2,송가인,Female,Trot
3,이찬원,Male,Trot
4,김호중,Male,Trot
5,영탁,Male,Trot
6,장윤정,Female,Trot
7,정동원,Male,Trot
8,장민호,Male,Trot
9,김희재,Male,Trot
10,나훈아,Male,Trot
11,남진,Male,Trot
12,홍진영,Female,Trot
13,김연자,Female,Trot
14,주현미,Female,Trot
15,심수봉,Female,Trot
16,박서진,Male,Trot
17,안성훈,Male,Trot
18,박지현,Male,Trot
19,진해성,Male,Trot
20,손태진,Male,Trot
21,양지은,Female,Trot
22,홍지윤,Female,Trot
23,김다현,Female,Trot
24,김태연,Female,Trot
25,전유진,Female,Trot
26,박군,Male,Trot
27,설운도,Male,Trot
28,태진아,Male,Trot
29,송대관,Male,Trot
30,진성,Male,Trot
31,박현빈,Male,Trot
32,신유,Male,Trot
33,조항조,Male,Trot
34,강진,Male,Trot
35,박상철,Male,Trot
36,은가은,Female,Trot
37,별사랑,Female,Trot
38,김의영,Female,Trot
39,강혜연,Female,Trot
40,황우림,Female,Trot
41,나상도,Male,Trot
42,최수호,Male,Trot
43,진욱,Male,Trot
44,박성온,Male,Trot
45,신성,Male,Trot
46,민수현,Male,Trot
47,김중연,Male,Trot
48,박민수,Male,Trot
49,공훈,Male,Trot
50,에녹,Male,Trot
51,김소연,Female,Trot
52,배아현,Female,Trot
53,오유진,Female,Trot
54,정서주,Female,Trot
55,미스김,Female,Trot
56,나영,Female,Trot
57,빈예서,Female,Trot
58,박구윤,Male,Trot
59,류지광,Male,Trot
60,나태주,Male,Trot
61,김수찬,Male,Trot
62,노지훈,Male,Trot
63,남승민,Male,Trot
64,요요미,Female,Trot
65,설하윤,Female,Trot
66,조정민,Female,Trot
67,윤수현,Female,Trot
68,김혜연,Female,Trot
69,서지오,Female,Trot
70,금잔디,Female,Trot
71,박주희,Female,Trot
72,윙크,Female,Trot
73,유지나,Female,Trot
74,한혜진,Female,Trot
75,김용임,Female,Trot
76,최진희,Female,Trot
77,하춘화,Female,Trot
78,현숙,Female,Trot
79,문희옥,Female,Trot
80,이자연,Female,Trot
81,조명섭,Male,Trot
82,김용필,Male,Trot
83,재하,Male,Trot
84,김경민,Male,Trot
85,이대원,Male,Trot
86,강태관,Male,Trot
87,황윤성,Male,Trot
88,신승태,Male,Trot
89,한강,Male,Trot
90,김국환,Male,Trot
91,배일호,Male,Trot
92,현철,Male,Trot
93,오승근,Male,Trot
94,김흥국,Male,Trot
95,윤태화,Female,Trot
96,마리아,Female,Trot
97,허찬미,Female,Trot
98,김나희,Female,Trot
99,정미애,Female,Trot
100,두리,Female,Trot
"""

# 2. 바탕화면 경로 찾기
desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
file_path = os.path.join(desktop_path, "trot_singer.csv")

# 3. 파일 저장
try:
    with open(file_path, "w", encoding="utf-8-sig") as f:
        f.write(csv_content)
    print(f"🎉 성공! 바탕화면에 'trot_singer.csv' 파일이 생성되었습니다.")
    print(f"저장 위치: {file_path}")
except Exception as e:
    print(f"❌ 오류 발생: {e}")