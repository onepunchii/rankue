import os

# 1. 엑셀에 들어갈 데이터 (547명 전체 정제 완료)
csv_content = """rank,name,group,gender,type
1,박건욱,제로베이스원,Male,Solo
2,셔누,몬스타엑스,Male,Solo
3,슈가,방탄소년단,Male,Solo
4,니키,ENHYPEN,Male,Solo
5,정국,방탄소년단,Male,Solo
6,지민,방탄소년단,Male,Solo
7,G-DRAGON,빅뱅,Male,Solo
8,강다니엘,,Male,Solo
9,뷔,방탄소년단,Male,Solo
10,진,방탄소년단,Male,Solo
11,주헌,몬스타엑스,Male,Solo
12,현진,Stray Kids,Male,Solo
13,밤비,플레이브,Male,Solo
14,문빈,아스트로,Male,Solo
15,제이홉,방탄소년단,Male,Solo
16,이상원,알파드라이브원,Male,Solo
17,시온,원어스,Male,Solo
18,아르노,알파드라이브원,Male,Solo
19,차은우,아스트로,Male,Solo
20,형원,몬스타엑스,Male,Solo
21,김재환,,Male,Solo
22,허씬롱,알파드라이브원,Male,Solo
23,성훈,ENHYPEN,Male,Solo
24,김요한,위아이,Male,Solo
25,성한빈,제로베이스원,Male,Solo
26,휴닝카이,투모로우바이투게더,Male,Solo
27,장하오,제로베이스원,Male,Solo
28,카이,EXO,Male,Solo
29,타카츠카 히로무,INI,Male,Solo
30,범규,투모로우바이투게더,Male,Solo
31,연준,투모로우바이투게더,Male,Solo
32,김준서,알파드라이브원,Male,Solo
33,RM,방탄소년단,Male,Solo
34,희승,ENHYPEN,Male,Solo
35,백현,EXO,Male,Solo
36,온유,샤이니,Male,Solo
37,케이,앤팀,Male,Solo
38,박지훈,,Male,Solo
39,세훈,EXO,Male,Solo
40,라키,,Male,Solo
41,백호,,Male,Solo
42,이리오,알파드라이브원,Male,Solo
43,디오,EXO,Male,Solo
44,휘영,SF9,Male,Solo
45,태현,투모로우바이투게더,Male,Solo
46,정원,ENHYPEN,Male,Solo
47,대성,빅뱅,Male,Solo
48,MJ,아스트로,Male,Solo
49,찬열,EXO,Male,Solo
50,제이크,ENHYPEN,Male,Solo
51,한,Stray Kids,Male,Solo
52,황치열,,Male,Solo
53,돈,NexT1DE,Male,Solo
54,진진,아스트로,Male,Solo
55,박한,아홉,Male,Solo
56,승민,Stray Kids,Male,Solo
57,카와시리 렌,JO1,Male,Solo
58,제이엘,아홉,Male,Solo
59,필릭스,Stray Kids,Male,Solo
60,옹성우,,Male,Solo
61,방찬,Stray Kids,Male,Solo
62,선우,ENHYPEN,Male,Solo
63,건호,CORTIS,Male,Solo
64,리노,Stray Kids,Male,Solo
65,석매튜,제로베이스원,Male,Solo
66,의주,앤팀,Male,Solo
67,영재,GOT7,Male,Solo
68,카즈타,n.SSign,Male,Solo
69,후마,앤팀,Male,Solo
70,로운,,Male,Solo
71,태용,NCT 127,Male,Solo
72,희원,n.SSign,Male,Solo
73,조우안신,알파드라이브원,Male,Solo
74,김지웅,제로베이스원,Male,Solo
75,창빈,Stray Kids,Male,Solo
76,임영민,,Male,Solo
77,시우민,EXO,Male,Solo
78,하루아,앤팀,Male,Solo
79,아이엔,Stray Kids,Male,Solo
80,정한,세븐틴,Male,Solo
81,이대휘,AB6IX,Male,Solo
82,김건우,알파드라이브원,Male,Solo
83,타이오,NexT1DE,Male,Solo
84,박우진,AB6IX,Male,Solo
85,윤산하,아스트로,Male,Solo
86,토모야,NEXZ,Male,Solo
87,런쥔,NCT DREAM,Male,Solo
88,수빈,투모로우바이투게더,Male,Solo
89,요나시로 쇼,JO1,Male,Solo
90,제이,ENHYPEN,Male,Solo
91,종호,에이티즈,Male,Solo
92,하성운,,Male,Solo
93,진호,펜타곤,Male,Solo
94,수호,EXO,Male,Solo
95,소정환,TREASURE,Male,Solo
96,이한,BOYNEXTDOOR,Male,Solo
97,쇼타로,라이즈,Male,Solo
98,하루,NEXZ,Male,Solo
99,타키,앤팀,Male,Solo
100,원빈,라이즈,Male,Solo
101,태민,샤이니,Male,Solo
102,승관,세븐틴,Male,Solo
103,천준혁,TNX,Male,Solo
104,원우,세븐틴,Male,Solo
105,리키,제로베이스원,Male,Solo
106,소건,NEXZ,Male,Solo
107,세이타,NEXZ,Male,Solo
108,김준민,WHIB,Male,Solo
109,마메하라 잇세이,JO1,Male,Solo
110,니콜라스,앤팀,Male,Solo
111,차웅기,아홉,Male,Solo
112,윤호,에이티즈,Male,Solo
113,정상현,알파드라이브원,Male,Solo
114,노아,플레이브,Male,Solo
115,해찬,"NCT 127, NCT DREAM",Male,Solo
116,형준,CRAVITY,Male,Solo
117,레이,EXO,Male,Solo
118,예준,플레이브,Male,Solo
119,조슈아,세븐틴,Male,Solo
120,정승환,,Male,Solo
121,WOODZ,,Male,Solo
122,마키,앤팀,Male,Solo
123,도훈,TWS,Male,Solo
124,동해,슈퍼주니어,Male,Solo
125,마크,"NCT 127, NCT DREAM",Male,Solo
126,리우,BOYNEXTDOOR,Male,Solo
127,명재현,BOYNEXTDOOR,Male,Solo
128,유우,NEXZ,Male,Solo
129,태산,BOYNEXTDOOR,Male,Solo
130,JAY B,GOT7,Male,Solo
131,키무라 마사야,INI,Male,Solo
132,산,에이티즈,Male,Solo
133,재민,NCT DREAM,Male,Solo
134,호시,세븐틴,Male,Solo
135,김우석,,Male,Solo
136,민규,세븐틴,Male,Solo
137,한결,POLARIX,Male,Solo
138,지훈,TWS,Male,Solo
139,여상,에이티즈,Male,Solo
140,은석,라이즈,Male,Solo
141,유키,NEXZ,Male,Solo
142,잭슨,GOT7,Male,Solo
143,민균,온앤오프,Male,Solo
144,조,앤팀,Male,Solo
145,산들,B1A4,Male,Solo
146,첸,EXO,Male,Solo
147,한준,n.SSign,Male,Solo
148,앤톤,라이즈,Male,Solo
149,T.O.P,,Male,Solo
150,김규빈,제로베이스원,Male,Solo
151,이정,WHIB,Male,Solo
152,우영,에이티즈,Male,Solo
153,효진,온앤오프,Male,Solo
154,정세운,,Male,Solo
155,성화,에이티즈,Male,Solo
156,키마타 쇼야,JO1,Male,Solo
157,육성재,비투비,Male,Solo
158,재현,NCT 127,Male,Solo
159,성현,CORTIS,Male,Solo
160,하민,플레이브,Male,Solo
161,민기,에이티즈,Male,Solo
162,한유진,제로베이스원,Male,Solo
163,케이주,KickFlip,Male,Solo
164,신우,B1A4,Male,Solo
165,유마,앤팀,Male,Solo
166,박정우,TREASURE,Male,Solo
167,도겸,세븐틴,Male,Solo
168,강승식,빅톤,Male,Solo
169,휴이,NEXZ,Male,Solo
170,레오,빅스,Male,Solo
171,홍성민,판타지보이즈,Male,Solo
172,김태래,제로베이스원,Male,Solo
173,김종현,,Male,Solo
174,운학,BOYNEXTDOOR,Male,Solo
175,치원,SEVENTOEIGHT,Male,Solo
176,하루토,TREASURE,Male,Solo
177,사토 케이고,JO1,Male,Solo
178,태양,빅뱅,Male,Solo
179,최태훈,TNX,Male,Solo
180,공찬,B1A4,Male,Solo
181,후지마키 쿄스케,INI,Male,Solo
182,도영,TREASURE,Male,Solo
183,주훈,CORTIS,Male,Solo
184,제임스,CORTIS,Male,Solo
185,신유,TWS,Male,Solo
186,은호,플레이브,Male,Solo
187,황민현,,Male,Solo
188,홍중,에이티즈,Male,Solo
189,루카스,,Male,Solo
190,성호,BOYNEXTDOOR,Male,Solo
191,신원,펜타곤,Male,Solo
192,김상우,저스트비,Male,Solo
193,키노,펜타곤,Male,Solo
194,제노,NCT DREAM,Male,Solo
195,한진,TWS,Male,Solo
196,준,세븐틴,Male,Solo
197,다이스케,아홉,Male,Solo
198,사쿠야,NCT WISH,Male,Solo
199,김성규,인피니트,Male,Solo
200,윈스턴,호라이즌,Male,Solo
201,마틴,CORTIS,Male,Solo
202,경민,TWS,Male,Solo
203,BOBBY,iKON,Male,Solo
204,기현,몬스타엑스,Male,Solo
205,계훈,KickFlip,Male,Solo
206,스티븐,아홉,Male,Solo
207,준규,TREASURE,Male,Solo
208,배진영,,Male,Solo
209,한빈,TEMPEST,Male,Solo
210,준서,BAE173,Male,Solo
211,소희,라이즈,Male,Solo
212,에스쿱스,세븐틴,Male,Solo
213,디노,세븐틴,Male,Solo
214,성찬,라이즈,Male,Solo
215,원필,DAY6,Male,Solo
216,우석,펜타곤,Male,Solo
217,김동혁,iKON,Male,Solo
218,현석,CIX,Male,Solo
219,디에잇,세븐틴,Male,Solo
220,타지마 쇼고,INI,Male,Solo
221,한승우,,Male,Solo
222,우무티,XLOV,Male,Solo
223,휘준,MCND,Male,Solo
224,후이,펜타곤,Male,Solo
225,선우,더보이즈,Male,Solo
226,동현,KickFlip,Male,Solo
227,최립우,,Male,Solo
228,한음,,Male,Solo
229,선율,업텐션,Male,Solo
230,뱀뱀,GOT7,Male,Solo
231,김동현,AB6IX,Male,Solo
232,현식,XODIAC,Male,Solo
233,린,NouerA,Male,Solo
234,레오,아오엔,Male,Solo
235,리쿠,NCT WISH,Male,Solo
236,우지,세븐틴,Male,Solo
237,마시호,,Male,Solo
238,남도현,BAE173,Male,Solo
239,건희,원어스,Male,Solo
240,재한,OMEGA X,Male,Solo
241,시로이와 루키,JO1,Male,Solo
242,성윤,n.SSign,Male,Solo
243,유타,NCT 127,Male,Solo
244,카와니시 타쿠미,JO1,Male,Solo
245,용승,VERIVERY,Male,Solo
246,남우현,인피니트,Male,Solo
247,규현,슈퍼주니어,Male,Solo
248,다원,SF9,Male,Solo
249,용희,CIX,Male,Solo
250,소울,P1Harmony,Male,Solo
251,도하,n.SSign,Male,Solo
252,오히라 쇼세이,JO1,Male,Solo
253,프니엘,비투비,Male,Solo
254,샤오,업텐션,Male,Solo
255,은지원,젝스키스,Male,Solo
256,민희,CRAVITY,Male,Solo
257,니시 히로토,INI,Male,Solo
258,엑시,SEVENTOEIGHT,Male,Solo
259,도운,DAY6,Male,Solo
260,정모,CRAVITY,Male,Solo
261,자얀,XODIAC,Male,Solo
262,강민,VERIVERY,Male,Solo
263,원호,,Male,Solo
264,코노 준키,JO1,Male,Solo
265,장슈아이보,아홉,Male,Solo
266,세은,Xikers,Male,Solo
267,아사히,TREASURE,Male,Solo
268,천러,NCT DREAM,Male,Solo
269,로빈,n.SSign,Male,Solo
270,민호,샤이니,Male,Solo
271,신혜성,신화,Male,Solo
272,로렌스,n.SSign,Male,Solo
273,야오즈하오,NexT1DE,Male,Solo
274,영재,TWS,Male,Solo
275,소타,아오엔,Male,Solo
276,진범,WHIB,Male,Solo
277,예성,슈퍼주니어,Male,Solo
278,영훈,더보이즈,Male,Solo
279,후예타오,NexT1DE,Male,Solo
280,주연,더보이즈,Male,Solo
281,킨죠 스카이,JO1,Male,Solo
282,계현,VERIVERY,Male,Solo
283,가온,Xdinary Heroes,Male,Solo
284,O.de,Xdinary Heroes,Male,Solo
285,지성,NCT DREAM,Male,Solo
286,이창섭,비투비,Male,Solo
287,구준회,iKON,Male,Solo
288,아이엠,몬스타엑스,Male,Solo
289,혁,TEMPEST,Male,Solo
290,버논,세븐틴,Male,Solo
291,유우시,NCT WISH,Male,Solo
292,장현수,TNX,Male,Solo
293,Key,샤이니,Male,Solo
294,마크,GOT7,Male,Solo
295,성진,DAY6,Male,Solo
296,마츠다 진,INI,Male,Solo
297,재윤,SF9,Male,Solo
298,미라쿠,NouerA,Male,Solo
299,이한빈,판타지보이즈,Male,Solo
300,재하,WHIB,Male,Solo
301,은휘,TNX,Male,Solo
302,루이,XLOV,Male,Solo
303,아마루,KickFlip,Male,Solo
304,동화,KickFlip,Male,Solo
305,주왕,KickFlip,Male,Solo
306,민제,KickFlip,Male,Solo
307,하승,WHIB,Male,Solo
308,유건,WHIB,Male,Solo
309,숑,NexT1DE,Male,Solo
310,현,XLOV,Male,Solo
311,하루,XLOV,Male,Solo
312,시온,NCT WISH,Male,Solo
313,제로미,호라이즌,Male,Solo
314,희철,슈퍼주니어,Male,Solo
315,오성준,TNX,Male,Solo
316,환웅,원어스,Male,Solo
317,지훈,TREASURE,Male,Solo
318,재희,NCT WISH,Male,Solo
319,료,NCT WISH,Male,Solo
320,전도염,저스트비,Male,Solo
321,예찬,OMEGA X,Male,Solo
322,유용하,위아이,Male,Solo
323,최현석,TREASURE,Male,Solo
324,요시,TREASURE,Male,Solo
325,윤재혁,TREASURE,Male,Solo
326,박주원,아홉,Male,Solo
327,려욱,슈퍼주니어,Male,Solo
328,은혁,슈퍼주니어,Male,Solo
329,신동,슈퍼주니어,Male,Solo
330,켄,빅스,Male,Solo
331,엔,빅스,Male,Solo
332,장동우,인피니트,Male,Solo
333,이성열,인피니트,Male,Solo
334,이성종,인피니트,Male,Solo
335,손동운,하이라이트,Male,Solo
336,양요섭,하이라이트,Male,Solo
337,엘,인피니트,Male,Solo
338,윤두준,하이라이트,Male,Solo
339,이기광,하이라이트,Male,Solo
340,종현,샤이니,Male,Solo
341,혁,빅스,Male,Solo
342,니엘,틴탑,Male,Solo
343,리키,틴탑,Male,Solo
344,서은광,비투비,Male,Solo
345,성민,슈퍼주니어,Male,Solo
346,송승현,,Male,Solo
347,시원,슈퍼주니어,Male,Solo
348,이민혁,비투비,Male,Solo
349,이재진,FT아일랜드,Male,Solo
350,이특,슈퍼주니어,Male,Solo
351,이홍기,FT아일랜드,Male,Solo
352,임현식,비투비,Male,Solo
353,최민환,FT아일랜드,Male,Solo
354,진영,GOT7,Male,Solo
355,유겸,GOT7,Male,Solo
356,김진환,iKON,Male,Solo
357,송윤형,iKON,Male,Solo
358,정찬우,iKON,Male,Solo
359,김동완,신화,Male,Solo
360,이민우,신화,Male,Solo
361,에릭,신화,Male,Solo
362,앤디,신화,Male,Solo
363,전진,신화,Male,Solo
364,민혁,몬스타엑스,Male,Solo
365,진후,업텐션,Male,Solo
366,쿤,업텐션,Male,Solo
367,이진혁,,Male,Solo
368,고결,업텐션,Male,Solo
369,비토,업텐션,Male,Solo
370,규진,업텐션,Male,Solo
371,환희,업텐션,Male,Solo
372,텐,WayV,Male,Solo
373,도영,NCT 127,Male,Solo
374,이재진,젝스키스,Male,Solo
375,김재덕,젝스키스,Male,Solo
376,장수원,젝스키스,Male,Solo
377,윈윈,WayV,Male,Solo
378,홍석,펜타곤,Male,Solo
379,여원,펜타곤,Male,Solo
380,옌안,펜타곤,Male,Solo
381,유토,펜타곤,Male,Solo
382,영빈,SF9,Male,Solo
383,인성,SF9,Male,Solo
384,주호,SF9,Male,Solo
385,유태양,SF9,Male,Solo
386,찬희,SF9,Male,Solo
387,임세준,빅톤,Male,Solo
388,쟈니,NCT 127,Male,Solo
389,김동한,위아이,Male,Solo
390,Young K,DAY6,Male,Solo
391,정우,NCT 127,Male,Solo
392,쿤,WayV,Male,Solo
393,현재,더보이즈,Male,Solo
394,상연,더보이즈,Male,Solo
395,큐,더보이즈,Male,Solo
396,케빈,더보이즈,Male,Solo
397,제이콥,더보이즈,Male,Solo
398,에릭,더보이즈,Male,Solo
399,뉴,더보이즈,Male,Solo
400,이션,온앤오프,Male,Solo
401,승준,온앤오프,Male,Solo
402,와이엇,온앤오프,Male,Solo
403,유,온앤오프,Male,Solo
404,서호,원어스,Male,Solo
405,이도,원어스,Male,Solo
406,양양,WayV,Male,Solo
407,샤오쥔,WayV,Male,Solo
408,헨드리,WayV,Male,Solo
409,전웅,AB6IX,Male,Solo
410,동헌,VERIVERY,Male,Solo
411,호영,VERIVERY,Male,Solo
412,민찬,VERIVERY,Male,Solo
413,연호,VERIVERY,Male,Solo
414,원진,CRAVITY,Male,Solo
415,이은상,YOUNITE,Male,Solo
416,BX,CIX,Male,Solo
417,세림,CRAVITY,Male,Solo
418,앨런,CRAVITY,Male,Solo
419,우빈,CRAVITY,Male,Solo
420,태영,CRAVITY,Male,Solo
421,성민,CRAVITY,Male,Solo
422,준,A.C.E,Male,Solo
423,동훈,A.C.E,Male,Solo
424,와우,A.C.E,Male,Solo
425,김병관,A.C.E,Male,Solo
426,찬,A.C.E,Male,Solo
427,캐슬제이,MCND,Male,Solo
428,빅,MCND,Male,Solo
429,민재,MCND,Male,Solo
430,윈,MCND,Male,Solo
431,장대현,위아이,Male,Solo
432,강석화,위아이,Male,Solo
433,유준,BAE173,Male,Solo
434,무진,BAE173,Male,Solo
435,영서,BAE173,Male,Solo
436,도하,BAE173,Male,Solo
437,빛,BAE173,Male,Solo
438,테오,P1Harmony,Male,Solo
439,기호,P1Harmony,Male,Solo
440,지웅,P1Harmony,Male,Solo
441,인탁,P1Harmony,Male,Solo
442,종섭,P1Harmony,Male,Solo
443,이준혁,POLARIX,Male,Solo
444,이건우,저스트비,Male,Solo
445,배인,저스트비,Male,Solo
446,임지민,저스트비,Male,Solo
447,시우,저스트비,Male,Solo
448,휘찬,OMEGA X,Male,Solo
449,세빈,OMEGA X,Male,Solo
450,한겸,OMEGA X,Male,Solo
451,태동,OMEGA X,Male,Solo
452,XEN,OMEGA X,Male,Solo
453,제현,OMEGA X,Male,Solo
454,케빈,OMEGA X,Male,Solo
455,정훈,OMEGA X,Male,Solo
456,혁,OMEGA X,Male,Solo
457,건일,Xdinary Heroes,Male,Solo
458,정수,Xdinary Heroes,Male,Solo
459,Jun Han,Xdinary Heroes,Male,Solo
460,주연,Xdinary Heroes,Male,Solo
461,형섭,TEMPEST,Male,Solo
462,은찬,TEMPEST,Male,Solo
463,LEW,TEMPEST,Male,Solo
464,태래,TEMPEST,Male,Solo
465,은호,YOUNITE,Male,Solo
466,스티브,YOUNITE,Male,Solo
467,형석,YOUNITE,Male,Solo
468,우노,YOUNITE,Male,Solo
469,DEY,YOUNITE,Male,Solo
470,경문,YOUNITE,Male,Solo
471,시온,YOUNITE,Male,Solo
472,세현,DKZ,Male,Solo
473,민규,DKZ,Male,Solo
474,재찬,DKZ,Male,Solo
475,종형,DKZ,Male,Solo
476,기석,DKZ,Male,Solo
477,준혁,n.SSign,Male,Solo
478,카일러,호라이즌,Male,Solo
479,킴,호라이즌,Male,Solo
480,마커스,호라이즌,Male,Solo
481,레이스터,호라이즌,Male,Solo
482,빈치,호라이즌,Male,Solo
483,규민,XODIAC,Male,Solo
484,리오,XODIAC,Male,Solo
485,렉스,XODIAC,Male,Solo
486,범수,XODIAC,Male,Solo
487,씽,XODIAC,Male,Solo
488,웨인,XODIAC,Male,Solo
489,다빈,XODIAC,Male,Solo
490,오현태,판타지보이즈,Male,Solo
491,히카루,판타지보이즈,Male,Solo
492,김규래,판타지보이즈,Male,Solo
493,강민서,판타지보이즈,Male,Solo
494,히카리,판타지보이즈,Male,Solo
495,김우석,판타지보이즈,Male,Solo
496,소울,판타지보이즈,Male,Solo
497,링치,판타지보이즈,Male,Solo
498,케이단,판타지보이즈,Male,Solo
499,진식,Xikers,Male,Solo
500,수민,Xikers,Male,Solo
501,헌터,Xikers,Male,Solo
502,예찬,Xikers,Male,Solo
503,현우,Xikers,Male,Solo
504,준민,Xikers,Male,Solo
505,유준,Xikers,Male,Solo
506,민재,Xikers,Male,Solo
507,정훈,Xikers,Male,Solo
508,에디,n.SSign,Male,Solo
509,최상엽,LUCY,Male,Solo
510,조원상,LUCY,Male,Solo
511,신예찬,LUCY,Male,Solo
512,신광일,LUCY,Male,Solo
513,츠루보 시온,JO1,Male,Solo
514,이케자키 리히토,INI,Male,Solo
515,오자키 타쿠미,INI,Male,Solo
516,고토 타케루,INI,Male,Solo
517,사노 유다이,INI,Male,Solo
518,쉬펑판,INI,Male,Solo
519,한유섭,NouerA,Male,Solo
520,전준표,NouerA,Male,Solo
521,노기현,NouerA,Male,Solo
522,장현준,NouerA,Male,Solo
523,빙판,NouerA,Male,Solo
524,즈언,아홉,Male,Solo
525,서정우,아홉,Male,Solo
526,펜떠,POLARIX,Male,Solo
527,허세환,POLARIX,Male,Solo
528,양동화,POLARIX,Male,Solo
529,이다을,POLARIX,Male,Solo
530,자이,POLARIX,Male,Solo
531,샤오쯔헝,POLARIX,Male,Solo
532,신처,POLARIX,Male,Solo
533,엠,SEVENTOEIGHT,Male,Solo
534,쿄준,SEVENTOEIGHT,Male,Solo
535,재거,SEVENTOEIGHT,Male,Solo
536,디옴,SEVENTOEIGHT,Male,Solo
537,인홍,WHIB,Male,Solo
538,원준,WHIB,Male,Solo
539,유주,아오엔,Male,Solo
540,루카,아오엔,Male,Solo
541,가쿠,아오엔,Male,Solo
542,하쿠,아오엔,Male,Solo
543,쿄스케,아오엔,Male,Solo
544,셴,NexT1DE,Male,Solo
545,오마르,NexT1DE,Male,Solo
546,천지,틴탑,Male,Solo
547,창조,틴탑,Male,Solo
"""

# 2. 바탕화면(Desktop) 경로 찾기 (맥북 기준)
desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
file_path = os.path.join(desktop_path, "male_solo.csv")

# 3. 파일 저장 (UTF-8 인코딩)
try:
    with open(file_path, "w", encoding="utf-8-sig") as f:
        f.write(csv_content)
    print(f"🎉 성공! 바탕화면에 'male_solo.csv' 파일이 생성되었습니다.")
    print(f"저장 위치: {file_path}")
except Exception as e:
    print(f"❌ 오류 발생: {e}")