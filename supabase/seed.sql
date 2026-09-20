insert into public.students
(serial_number, student_name, age, country, timing, days, monthly_fee, currency, parent_name)
values
(1,'MEHAK KAUR',6,'USA','6-7 PM','MON, WED, SAT',55,'USD','SAPNA KAUR'),
(2,'ROOP KAUR',14,'USA','7-8 PM','MON, WED, FRI',55,'USD','SAPNA KAUR'),
(3,'JASREEN KAUR',10,'USA','7-8 PM','MON, WED, FRI',55,'USD','BALJINDER KAUR'),
(4,'SEHAJLEEN KAUR',12,'USA','7-8 PM','MON, WED, FRI',55,'USD','YUVRAJ SINGH'),
(5,'GURSEHAJ SINGH',7,'USA','6-7 PM','MON, WED, SAT',59,'USD','RAMAN KAUR'),
(6,'JASKARAN SINGH',9,'USA','8-9 PM','MON, WED, FRI',59,'USD','KAMALJIT CHAHAL'),
(7,'YUVAN SINGH',8,'USA','5-6 PM','TUE, THUR, SAT',59,'USD','MANDEEP KAUR'),
(8,'GURNAAZ KAUR',6,'USA','6-7 PM','TUE, THUR, FRI',55,'USD','NEETU KAUR'),
(9,'ASEES',6,'USA','6-7 PM','TUE, THUR, FRI',55,'USD','BALJINDER KAUR'),
(10,'GURNADAR KAUR',6,'USA','6-7 PM','TUE, THUR, FRI',59,'USD','SANDEEP KAUR'),
(11,'JAGNOOR SINGH',6,'USA','6-7 PM','TUE, THUR, FRI',59,'USD','KULDIP KAUR'),
(12,'GURDEV SINGH',13,'USA','7-8 PM','TUE, THUR, SAT',35,'USD','JASPREET RAI'),
(13,'ARIA KAUR',11,'USA','7-8 PM','TUE, THUR, SAT',35,'USD','JASPAT RAI'),
(14,'AVNEET KAUR',10,'USA','7-8 PM','TUE, THUR, SAT',35,'USD',null),
(15,'SEHAJ S. WRAICH',11,'USA','7-8 PM','TUE, THUR, SAT',59,'USD','SHAGANDEEP KAUR'),
(16,'RIYAAN SINGH',10,'USA','7-8 PM','TUE, THUR, SAT',59,'USD',null),
(17,'GURMAN SINGH',7,'CAN','9-10 PM','TUE, THUR, SAT',59,'USD','TANEET KAUR'),
(18,'ANSHVEER SINGH',9,'N.Z','5-6 PM','FRI, SAT, SUN',69,'USD','KULWINDER KAUR'),
(19,'RIMPALJOT',null,'IND',null,null,5000,'INR',null),
(20,'EKAM KAUR',10,'AUS','5-6 PM','MON, TUE, WED',69,'USD','SUKHWINDER SINGH')
on conflict (serial_number) do update set
student_name=excluded.student_name, age=excluded.age, country=excluded.country,
timing=excluded.timing, days=excluded.days, monthly_fee=excluded.monthly_fee,
currency=excluded.currency, parent_name=excluded.parent_name;
