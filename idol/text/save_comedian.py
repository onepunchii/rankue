import os

# 1. 개그맨 50명 데이터
csv_content = """rank,name,gender,type
1,유재석,Male,Comedian
2,강호동,Male,Comedian
3,신동엽,Male,Comedian
4,박나래,Female,Comedian
5,장도연,Female,Comedian
6,이경규,Male,Comedian
7,박명수,Male,Comedian
8,김구라,Male,Comedian
9,김숙,Female,Comedian
10,송은이,Female,Comedian
11,이영자,Female,Comedian
12,이수지,Female,Comedian
13,김준호,Male,Comedian
14,문세윤,Male,Comedian
15,황제성,Male,Comedian
16,이진호,Male,Comedian
17,이용진,Male,Comedian
18,양세찬,Male,Comedian
19,양세형,Male,Comedian
20,조세호,Male,Comedian
21,남희석,Male,Comedian
22,김대희,Male,Comedian
23,유세윤,Male,Comedian
24,장동민,Male,Comedian
25,안영미,Female,Comedian
26,신봉선,Female,Comedian
27,김신영,Female,Comedian
28,홍현희,Female,Comedian
29,김민경,Female,Comedian
30,유민상,Male,Comedian
31,김준현,Male,Comedian
32,허경환,Male,Comedian
33,박성광,Male,Comedian
34,김원효,Male,Comedian
35,김지민,Female,Comedian
36,오나미,Female,Comedian
37,박소영,Female,Comedian
38,김승혜,Female,Comedian
39,이은지,Female,Comedian
40,김해준,Male,Comedian
41,이창호,Male,Comedian
42,곽범,Male,Comedian
43,엄지윤,Female,Comedian
44,김원훈,Male,Comedian
45,조진세,Male,Comedian
46,김경욱(다나카),Male,Comedian
47,신기루,Female,Comedian
48,홍윤화,Female,Comedian
49,김용명,Male,Comedian
50,최성민,Male,Comedian
"""

# 2. 바탕화면 경로 찾기
desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
file_path = os.path.join(desktop_path, "comedian.csv")

# 3. 파일 저장
try:
    with open(file_path, "w", encoding="utf-8-sig") as f:
        f.write(csv_content)
    print(f"🎉 성공! 바탕화면에 'comedian.csv' 파일이 생성되었습니다.")
    print(f"저장 위치: {file_path}")
except Exception as e:
    print(f"❌ 오류 발생: {e}")