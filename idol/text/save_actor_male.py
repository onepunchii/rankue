import os

# 1. 남자 배우 100명 데이터 (인지도/트렌드 반영)
csv_content = """rank,name,gender,type
1,김수현,Male,Actor
2,변우석,Male,Actor
3,차은우,Male,Actor
4,마동석,Male,Actor
5,남궁민,Male,Actor
6,이정재,Male,Actor
7,송중기,Male,Actor
8,손석구,Male,Actor
9,현빈,Male,Actor
10,공유,Male,Actor
11,이민호,Male,Actor
12,박서준,Male,Actor
13,최민식,Male,Actor
14,황정민,Male,Actor
15,하정우,Male,Actor
16,이병헌,Male,Actor
17,정우성,Male,Actor
18,강동원,Male,Actor
19,조인성,Male,Actor
20,김선호,Male,Actor
21,이도현,Male,Actor
22,송강,Male,Actor
23,안효섭,Male,Actor
24,로운,Male,Actor
25,이준호,Male,Actor
26,박보검,Male,Actor
27,지창욱,Male,Actor
28,이종석,Male,Actor
29,김우빈,Male,Actor
30,조정석,Male,Actor
31,이동욱,Male,Actor
32,류승룡,Male,Actor
33,송강호,Male,Actor
34,유해진,Male,Actor
35,이성민,Male,Actor
36,조진웅,Male,Actor
37,이제훈,Male,Actor
38,구교환,Male,Actor
39,임시완,Male,Actor
40,도경수,Male,Actor
41,박형식,Male,Actor
42,서인국,Male,Actor
43,장기용,Male,Actor
44,나인우,Male,Actor
45,채종협,Male,Actor
46,려운,Male,Actor
47,배인혁,Male,Actor
48,문상민,Male,Actor
49,김영대,Male,Actor
50,황인엽,Male,Actor
51,남주혁,Male,Actor
52,육성재,Male,Actor
53,이준기,Male,Actor
54,김남길,Male,Actor
55,지성,Male,Actor
56,소지섭,Male,Actor
57,장혁,Male,Actor
58,권상우,Male,Actor
59,차승원,Male,Actor
60,김래원,Male,Actor
61,박해일,Male,Actor
62,설경구,Male,Actor
63,김윤석,Male,Actor
64,한석규,Male,Actor
65,박성웅,Male,Actor
66,곽도원,Male,Actor
67,이희준,Male,Actor
68,박병은,Male,Actor
69,김대명,Male,Actor
70,전석호,Male,Actor
71,안재홍,Male,Actor
72,류준열,Male,Actor
73,박정민,Male,Actor
74,변요한,Male,Actor
75,유연석,Male,Actor
76,정경호,Male,Actor
77,김동욱,Male,Actor
78,김재욱,Male,Actor
79,주지훈,Male,Actor
80,김성철,Male,Actor
81,이상이,Male,Actor
82,이무생,Male,Actor
83,박성훈,Male,Actor
84,정성일,Male,Actor
85,김민재,Male,Actor
86,우도환,Male,Actor
87,양세종,Male,Actor
88,장동윤,Male,Actor
89,강태오,Male,Actor
90,공명,Male,Actor
91,위하준,Male,Actor
92,김범,Male,Actor
93,이수혁,Male,Actor
94,윤계상,Male,Actor
95,엄태구,Male,Actor
96,진선규,Male,Actor
97,허성태,Male,Actor
98,김의성,Male,Actor
99,이경영,Male,Actor
100,신하균,Male,Actor
"""

# 2. 바탕화면 경로 찾기
desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
file_path = os.path.join(desktop_path, "actor_male.csv")

# 3. 파일 저장
try:
    with open(file_path, "w", encoding="utf-8-sig") as f:
        f.write(csv_content)
    print(f"🎉 성공! 바탕화면에 'actor_male.csv' 파일이 생성되었습니다.")
    print(f"저장 위치: {file_path}")
except Exception as e:
    print(f"❌ 오류 발생: {e}")