-- wrangler d1 execute lunar-attendance --remote --file=./local_data-external-db.sql 
INSERT INTO "teachers" (id, name, email, pin)
VALUES(
    'teacher_1',
    'Ada Sharma',
    'teacher@example.com',
    '1234'
  );
INSERT INTO "teachers" (id, name, email, pin)
VALUES(
    'teacher_2',
    'Bikram Rai',
    'science@example.com',
    '1234'
  );
INSERT INTO "teachers" (id, name, email, pin)
VALUES(
    'teacher_f46e3a204507',
    'Sagun Basnet',
    'sagunbasnet@gmail.com',
    '9812'
  );
INSERT INTO "teachers" (id, name, email, pin)
VALUES(
    'teacher_18374ba7f09b',
    'Sanam Tamang',
    'snm.tmg7@gmail.com',
    '1234'
  );
INSERT INTO "classes" (id, name, code, ends_at)
VALUES(
    'FLUTTER-101',
    'Flutter',
    'FLUTTER-101',
    1794034003
  );
INSERT INTO "classes" (id, name, code, ends_at)
VALUES(
    'REACT-2025',
    'REACT JS',
    'REACT-2025',
    1794034003
  );
INSERT INTO "classes" (id, name, code, ends_at)
VALUES(
    'PROMPT-101',
    'Prompt Engineering',
    'PROMPT-101',
    1794034003
  );
INSERT INTO "classes" (id, name, code, ends_at)
VALUES(
    'CS101',
    'Computer Science 101',
    'CS101',
    1794036264
  );
INSERT INTO "classes" (id, name, code, ends_at)
VALUES(
    'MATH201',
    'Discrete Mathematics',
    'MATH201',
    1794036264
  );
INSERT INTO "classes" (id, name, code, ends_at)
VALUES(
    'PHY150',
    'Applied Physics',
    'PHY150',
    1794036264
  );
INSERT INTO "classes" (id, name, code, ends_at)
VALUES(
    'REACT-2026',
    'Madan Bhandari Engineering College React',
    'REACT-2026',
    1794037836
  );
INSERT INTO "students" (id, name, email)
VALUES(
    'student_1',
    'Test Student',
    'student@example.com'
  );
INSERT INTO "students" (id, name, email)
VALUES('student_2', 'Mira Karki', 'mira@example.com');
INSERT INTO "students" (id, name, email)
VALUES('student_3', 'Nabin Gurung', 'nabin@example.com');
INSERT INTO "students" (id, name, email)
VALUES(
    'student_47e746f5442d',
    'Bunu Khatiwada',
    'bunu@gmail.com'
  );
INSERT INTO "students" (id, name, email)
VALUES(
    'student_afd22a50c609',
    'Arju Khadka',
    'arjun@gmail.com'
  );
INSERT INTO "students" (id, name, email)
VALUES(
    'student_6b282f22de95',
    'Dipesh Mahato',
    'dipesh@gmail.com'
  );
INSERT INTO "students" (id, name, email)
VALUES(
    'student_74234cd3724c',
    'Suraj Sah',
    'suraj@gmail.com'
  );
INSERT INTO "students" (id, name, email)
VALUES(
    'student_69b840906264',
    'Nishan Niroula',
    'nishan@flutter.com'
  );
INSERT INTO "students" (id, name, email)
VALUES(
    'student_60f8de794ece',
    'Alisha Swornakar',
    'alish@flutter.com'
  );
INSERT INTO "teacher_classes" (teacher_id, class_id)
VALUES('teacher_1', 'REACT-2025');
INSERT INTO "teacher_classes" (teacher_id, class_id)
VALUES('teacher_2', 'PROMPT-101');
INSERT INTO "teacher_classes" (teacher_id, class_id)
VALUES('teacher_1', 'CS101');
INSERT INTO "teacher_classes" (teacher_id, class_id)
VALUES('teacher_1', 'MATH201');
INSERT INTO "teacher_classes" (teacher_id, class_id)
VALUES('teacher_2', 'PHY150');
INSERT INTO "teacher_classes" (teacher_id, class_id)
VALUES('teacher_2', 'FLUTTER-101');
INSERT INTO "teacher_classes" (teacher_id, class_id)
VALUES('teacher_18374ba7f09b', 'FLUTTER-101');
INSERT INTO "teacher_classes" (teacher_id, class_id)
VALUES('teacher_f46e3a204507', 'REACT-2026');
INSERT INTO "student_classes" (student_id, class_id)
VALUES('student_1', 'REACT-2025');
INSERT INTO "student_classes" (student_id, class_id)
VALUES('student_3', 'REACT-2025');
INSERT INTO "student_classes" (student_id, class_id)
VALUES('student_1', 'CS101');
INSERT INTO "student_classes" (student_id, class_id)
VALUES('student_1', 'MATH201');
INSERT INTO "student_classes" (student_id, class_id)
VALUES('student_2', 'CS101');
INSERT INTO "student_classes" (student_id, class_id)
VALUES('student_3', 'MATH201');
INSERT INTO "student_classes" (student_id, class_id)
VALUES('student_afd22a50c609', 'REACT-2026');
INSERT INTO "student_classes" (student_id, class_id)
VALUES('student_47e746f5442d', 'REACT-2026');
INSERT INTO "student_classes" (student_id, class_id)
VALUES('student_6b282f22de95', 'REACT-2026');
INSERT INTO "student_classes" (student_id, class_id)
VALUES('student_74234cd3724c', 'REACT-2026');
INSERT INTO "student_classes" (student_id, class_id)
VALUES('student_60f8de794ece', 'FLUTTER-101');
INSERT INTO "student_classes" (student_id, class_id)
VALUES('student_69b840906264', 'FLUTTER-101');
INSERT INTO "teacher_sessions" (token, teacher_id, expires_at, pin_verified_at)
VALUES(
    'teacher_2437093a705440b8815035027c34ddfe',
    'teacher_1',
    1779693781,
    1778484181
  );
INSERT INTO "teacher_sessions" (token, teacher_id, expires_at, pin_verified_at)
VALUES(
    'teacher_4c56bcb8ec3d419eb110f19705c7a09b',
    'teacher_f46e3a204507',
    1779695676,
    1778486076
  );
INSERT INTO "teacher_sessions" (token, teacher_id, expires_at, pin_verified_at)
VALUES(
    'teacher_700f2289e3e74e1a9916bbe3f4f49823',
    'teacher_18374ba7f09b',
    1779695729,
    1778486129
  );
INSERT INTO "teacher_sessions" (token, teacher_id, expires_at, pin_verified_at)
VALUES(
    'teacher_452d06459d824856b902215eb4c14638',
    'teacher_1',
    1779697309,
    1778487709
  );
INSERT INTO "teacher_sessions" (token, teacher_id, expires_at, pin_verified_at)
VALUES(
    'teacher_2d5fcf61591d47f786d5eb764112145a',
    'teacher_1',
    1779697310,
    1778487710
  );
INSERT INTO "teacher_sessions" (token, teacher_id, expires_at, pin_verified_at)
VALUES(
    'teacher_2c07406ba7704a9682e0bd6c58686327',
    'teacher_1',
    1779697325,
    1778487725
  );
INSERT INTO "teacher_sessions" (token, teacher_id, expires_at, pin_verified_at)
VALUES(
    'teacher_65e7583c544f4ecb935969f2c556411c',
    'teacher_1',
    1779697783,
    1778488183
  );
INSERT INTO "student_access_grants" (token, student_id, created_by_teacher_id, expires_at, used_at)
VALUES(
    'grant_38902151afbe4fb7a1e42e8b0b3cadfa',
    'student_3',
    'teacher_1',
    1778482638,
    1778482090
  );
INSERT INTO "student_access_grants" (token, student_id, created_by_teacher_id, expires_at, used_at)
VALUES(
    'grant_f08aa204f2f3427c9762c014cabd71be',
    'student_afd22a50c609',
    'teacher_f46e3a204507',
    1778486709,
    NULL
  );
INSERT INTO "student_access_grants" (token, student_id, created_by_teacher_id, expires_at, used_at)
VALUES(
    'grant_622087c04f8e4a54a13163205d41799c',
    'student_60f8de794ece',
    'teacher_18374ba7f09b',
    1778486773,
    NULL
  );
INSERT INTO "student_access_grants" (token, student_id, created_by_teacher_id, expires_at, used_at)
VALUES(
    'grant_7d4d333c760a466fbe1c12edaacaf893',
    'student_afd22a50c609',
    'teacher_f46e3a204507',
    1778487019,
    1778486429
  );
INSERT INTO "student_access_grants" (token, student_id, created_by_teacher_id, expires_at, used_at)
VALUES(
    'grant_0a4da8e4745348209e9b8131fab3b27b',
    'student_60f8de794ece',
    'teacher_18374ba7f09b',
    1778487191,
    1778486645
  );
INSERT INTO "student_access_grants" (token, student_id, created_by_teacher_id, expires_at, used_at)
VALUES(
    'grant_b31cc23cfa0a461d90496a805366ea30',
    'student_2',
    'teacher_1',
    1778487556,
    NULL
  );
INSERT INTO "student_access_grants" (token, student_id, created_by_teacher_id, expires_at, used_at)
VALUES(
    'grant_ffa63896f2524620a8c1b3a8a6694c39',
    'student_1',
    'teacher_1',
    1778487575,
    NULL
  );
INSERT INTO "student_access_grants" (token, student_id, created_by_teacher_id, expires_at, used_at)
VALUES(
    'grant_56a56646ba2c49d3af54d3839092e081',
    'student_1',
    'teacher_1',
    1778487584,
    NULL
  );
INSERT INTO "student_access_grants" (token, student_id, created_by_teacher_id, expires_at, used_at)
VALUES(
    'grant_0b29a755da1440bc818274457b66613a',
    'student_1',
    'teacher_1',
    1778487645,
    1778487135
  );
INSERT INTO "student_access_grants" (token, student_id, created_by_teacher_id, expires_at, used_at)
VALUES(
    'grant_bc454d82bcf94dc1a37451a050bcf3b5',
    'student_1',
    'teacher_1',
    1778487915,
    1778487351
  );
INSERT INTO "student_access_tokens" (token, student_id, created_at, expires_at, last_used_at, revoked_at)
VALUES(
    'student_9c3364b4eb554409aa9c304042c0757b',
    'student_3',
    1778482090,
    1794034003,
    1778482090,
    1778482176
  );
INSERT INTO "student_access_tokens" (token, student_id, created_at, expires_at, last_used_at, revoked_at)
VALUES(
    'student_926ec807521d4ba8a8e12e320abc9f94',
    'student_3',
    1778482176,
    1794034003,
    1778482176,
    1778482209
  );
INSERT INTO "student_access_tokens" (token, student_id, created_at, expires_at, last_used_at, revoked_at)
VALUES(
    'student_b34387cb51af47edb2338b70893d775b',
    'student_3',
    1778482209,
    1794034003,
    1778482209,
    NULL
  );
INSERT INTO "student_access_tokens" (token, student_id, created_at, expires_at, last_used_at, revoked_at)
VALUES(
    'student_de8fb1439b914194b8f43303ea17dc9f',
    'student_afd22a50c609',
    1778486429,
    1794037836,
    1778486429,
    1778486461
  );
INSERT INTO "student_access_tokens" (token, student_id, created_at, expires_at, last_used_at, revoked_at)
VALUES(
    'student_b0f7fd5c00a84bebbbeac4c394fbfbed',
    'student_afd22a50c609',
    1778486461,
    1794037836,
    1778486461,
    NULL
  );
INSERT INTO "student_access_tokens" (token, student_id, created_at, expires_at, last_used_at, revoked_at)
VALUES(
    'student_c989cdddfb134719b0c5b8e192f68ac0',
    'student_60f8de794ece',
    1778486645,
    1794034003,
    1778486645,
    1778486689
  );
INSERT INTO "student_access_tokens" (token, student_id, created_at, expires_at, last_used_at, revoked_at)
VALUES(
    'student_b703b57589ba4f3c8da86643d661f3fc',
    'student_60f8de794ece',
    1778486689,
    1794034003,
    1778486689,
    NULL
  );
INSERT INTO "student_access_tokens" (token, student_id, created_at, expires_at, last_used_at, revoked_at)
VALUES(
    'student_b1199c639b7c459da30a8e518b554ee9',
    'student_1',
    1778487135,
    1794036264,
    1778487135,
    NULL
  );
INSERT INTO "student_access_tokens" (token, student_id, created_at, expires_at, last_used_at, revoked_at)
VALUES(
    'student_358d51e429984aba8b10bacd78f47f9f',
    'student_1',
    1778487351,
    1794036264,
    1778487351,
    1778487493
  );
INSERT INTO "student_access_tokens" (token, student_id, created_at, expires_at, last_used_at, revoked_at)
VALUES(
    'student_df68d13960d942ab95690190e43864de',
    'student_1',
    1778487493,
    1794036264,
    1778487493,
    NULL
  );
INSERT INTO "attendance_records" (id, session_id, class_id, student_id, student_name, attendance_day, attended_at, requester_ip, user_agent, device_type, country, client_timezone, client_language, client_platform, screen_size)
VALUES(
    '29267fd6-6d11-4d76-a758-38686b1bd267',
    '45aa7dc7-1c75-400a-82ea-212e97216336',
    'REACT-2025',
    'student_3',
    'Nabin Gurung',
    '2026-05-11',
    1778482176,
    '2407:1400:aa78:660:d130:d550:1876:f96a',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
    'mobile',
    'NP',
    'Asia/Katmandu',
    'en-GB',
    'Linux armv81',
    '426x946'
  );
INSERT INTO "attendance_records" (id, session_id, class_id, student_id, student_name, attendance_day, attended_at, requester_ip, user_agent, device_type, country, client_timezone, client_language, client_platform, screen_size)
VALUES(
    '6bf7cc64-6c0f-48a9-b656-5f32d316f04b',
    '4d2fd1a2-bbdc-4f41-9fa4-026dac51c4f1',
    'REACT-2026',
    'student_afd22a50c609',
    'Arju Khadka',
    '2026-05-11',
    1778486461,
    '2407:1400:aa7e:6e98:d130:d550:1876:f96a',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
    'mobile',
    'NP',
    'Asia/Katmandu',
    'en-GB',
    'Linux armv81',
    '426x946'
  );
INSERT INTO "attendance_records" (id, session_id, class_id, student_id, student_name, attendance_day, attended_at, requester_ip, user_agent, device_type, country, client_timezone, client_language, client_platform, screen_size)
VALUES(
    '67103ef0-ddf6-4055-af77-2ff01b8a272d',
    '1872d673-782c-4b0d-9ecc-59dc443f3dbd',
    'FLUTTER-101',
    'student_60f8de794ece',
    'Alisha Swornakar',
    '2026-05-11',
    1778486689,
    '2407:1400:aa7e:6e98:a4cc:abdf:c609:f4d7',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
    'mobile',
    'NP',
    'Asia/Katmandu',
    'en-US',
    'Linux armv81',
    '360x800'
  );
INSERT INTO "attendance_records" (id, session_id, class_id, student_id, student_name, attendance_day, attended_at, requester_ip, user_agent, device_type, country, client_timezone, client_language, client_platform, screen_size)
VALUES(
    '76620343-ffaa-425b-9fad-d1329cdec4d9',
    '0f84b69a-8761-4fa1-8ce0-d3416f83b00a',
    'CS101',
    'student_1',
    'Test Student',
    '2026-05-11',
    1778487493,
    '2407:1400:aa7e:6e98:6c56:635b:ef8b:ed0',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
    'mobile',
    'NP',
    'Asia/Katmandu',
    'en-GB',
    'Linux armv81',
    '385x854'
  );
