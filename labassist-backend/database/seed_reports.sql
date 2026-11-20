SET NAMES utf8mb4;

-- 1. Ensure student demo_std01 has accepted applications for courses 42, 1, 5, 3
INSERT INTO applications (student_id, posting_id, course_id, role_applied, status, applied_at, reviewed_at)
SELECT 24, 42, 42, 'labboy', 'accepted', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM applications WHERE student_id = 24 AND course_id = 42);

INSERT INTO applications (student_id, posting_id, course_id, role_applied, status, applied_at, reviewed_at)
SELECT 24, 1, 1, 'labboy', 'accepted', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM applications WHERE student_id = 24 AND course_id = 1);

INSERT INTO applications (student_id, posting_id, course_id, role_applied, status, applied_at, reviewed_at)
SELECT 24, 5, 5, 'labboy', 'accepted', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM applications WHERE student_id = 24 AND course_id = 5);

INSERT INTO applications (student_id, posting_id, course_id, role_applied, status, applied_at, reviewed_at)
SELECT 24, 3, 3, 'labboy', 'accepted', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM applications WHERE student_id = 24 AND course_id = 3);

-- 2. Clean up any previous test reports for courses 42, 1, 5, 3 for student 24 to avoid duplicate runs
DELETE h FROM labboy_report_status_history h
JOIN labboy_reports r ON h.report_id = r.id
WHERE r.student_id = 24 AND r.course_id IN (42, 1, 5, 3);

DELETE resp FROM labboy_report_responses resp
JOIN labboy_reports r ON resp.report_id = r.id
WHERE r.student_id = 24 AND r.course_id IN (42, 1, 5, 3);

DELETE rev FROM labboy_report_reviews rev
JOIN labboy_reports r ON rev.report_id = r.id
WHERE r.student_id = 24 AND r.course_id IN (42, 1, 5, 3);

DELETE FROM labboy_reports WHERE student_id = 24 AND course_id IN (42, 1, 5, 3);

-- Report 2: UNDER_REVIEW (Course 42)
INSERT INTO labboy_reports (application_id, student_id, course_id, reporter_id, incident_date, category, description, impact, status, submitted_at, created_at, updated_at)
SELECT a.id, 24, 42, 18, DATE_SUB(CURDATE(), INTERVAL 6 DAY), 'LATE_NOTICE',
'แจ้งลาการปฏิบัติหน้าที่ผู้ช่วยแล็บล่วงหน้าเพียง 15 นาทีก่อนเริ่มคาบเรียน ทำให้จัดหาผู้ช่วยแทนไม่ทัน',
'อาจารย์ผู้สอนต้องดูแลนักศึกษาในห้องปฏิบัติการ 40 คนเพียงลำพังในช่วงครึ่งชั่วโมงแรก',
'UNDER_REVIEW', DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY)
FROM applications a WHERE a.student_id = 24 AND a.course_id = 42 LIMIT 1;

SET @rep2 = LAST_INSERT_ID();

INSERT INTO labboy_report_status_history (report_id, from_status, to_status, actor_id, reason, created_at)
VALUES
(@rep2, 'DRAFT', 'SUBMITTED', 18, 'รายงานการแจ้งลาล่าช้ากระทันหัน', DATE_SUB(NOW(), INTERVAL 5 DAY)),
(@rep2, 'SUBMITTED', 'AWAITING_RESPONSE', 23, 'ขอให้นักศึกษาชี้แจงสาเหตุที่แจ้งลากระทันหัน', DATE_SUB(NOW(), INTERVAL 4 DAY)),
(@rep2, 'AWAITING_RESPONSE', 'UNDER_REVIEW', 23, 'ได้รับคำชี้แจงแล้ว อยู่ระหว่างตรวจสอบเอกสารประกอบ', DATE_SUB(NOW(), INTERVAL 2 DAY));

INSERT INTO labboy_report_responses (report_id, author_id, kind, message, created_at)
VALUES
(@rep2, 24, 'EXPLANATION', 'กราบขออภัยอาจารย์และพี่เจ้าหน้าที่ครับ ในวันดังกล่าวเกิดอุบัติเหตุรถจักรยานยนต์ยางแบนระหว่างเดินทางมามหาวิทยาลัย ทำให้ไม่สามารถโทรแจ้งอาจารย์ได้ทันที ได้ทำการเปลี่ยนยางเสร็จแล้วรีบเดินทางมาถึงห้องปฏิบัติการในเวลาต่อมาครับ', DATE_SUB(NOW(), INTERVAL 3 DAY));


-- Report 3: CONFIRMED (Course 1)
INSERT INTO labboy_reports (application_id, student_id, course_id, reporter_id, incident_date, category, description, impact, status, submitted_at, created_at, updated_at)
SELECT a.id, 24, 1, 18, DATE_SUB(CURDATE(), INTERVAL 14 DAY), 'ABSENCE',
'ขาดการปฏิบัติหน้าที่ผู้ช่วยปฏิบัติการคาบแล็บวันพุธ โดยไม่มีการแจ้งลาล่วงหน้าและไม่สามารถติดต่อได้ตลอดช่วงเวลาการสอน',
'นักศึกษาในห้องแล็บไม่ได้รับความช่วยเหลือในการทำแบบฝึกหัด ปฏิบัติการดำเนินไปอย่างล่าช้า',
'CONFIRMED', DATE_SUB(NOW(), INTERVAL 13 DAY), DATE_SUB(NOW(), INTERVAL 13 DAY), DATE_SUB(NOW(), INTERVAL 8 DAY)
FROM applications a WHERE a.student_id = 24 AND a.course_id = 1 LIMIT 1;

SET @rep3 = LAST_INSERT_ID();

INSERT INTO labboy_report_status_history (report_id, from_status, to_status, actor_id, reason, created_at)
VALUES
(@rep3, 'DRAFT', 'SUBMITTED', 18, 'ขาดปฏิบัติหน้าที่โดยไม่แจ้งล่วงหน้า', DATE_SUB(NOW(), INTERVAL 13 DAY)),
(@rep3, 'SUBMITTED', 'UNDER_REVIEW', 23, 'เจ้าหน้าที่รับเรื่องตรวจสอบ', DATE_SUB(NOW(), INTERVAL 12 DAY)),
(@rep3, 'UNDER_REVIEW', 'CONFIRMED', 23, 'นักศึกษาขาดการปฏิบัติงานจริงและพ้นกำหนดระยะเวลาส่งคำชี้แจง จึงยืนยันผลการรายงานตามระเบียบ', DATE_SUB(NOW(), INTERVAL 8 DAY));

INSERT INTO labboy_report_reviews (report_id, reviewer_id, decision, reason, created_at)
VALUES
(@rep3, 23, 'CONFIRM', 'ตรวจสอบข้อมูลการลงเวลาและสอบถามอาจารย์ผู้สอนแล้ว ยืนยันว่านักศึกษาไม่มาปฏิบัติหน้าที่โดยไม่มีเหตุจำเป็นอันควร', DATE_SUB(NOW(), INTERVAL 8 DAY));


-- Report 4: NOT_SUBSTANTIATED (Course 5)
INSERT INTO labboy_reports (application_id, student_id, course_id, reporter_id, incident_date, category, description, impact, status, submitted_at, created_at, updated_at)
SELECT a.id, 24, 5, 18, DATE_SUB(CURDATE(), INTERVAL 20 DAY), 'OTHER',
'มีรายงานเบื้องต้นว่าส่งมอบคะแนนตรวจการบ้านปฏิบัติการของนักศึกษาล่าช้ากว่ากำหนด 3 วัน',
'เกรงว่าจะส่งผลกระทบต่อการประกาศคะแนนเก็บกลางภาค',
'NOT_SUBSTANTIATED', DATE_SUB(NOW(), INTERVAL 19 DAY), DATE_SUB(NOW(), INTERVAL 19 DAY), DATE_SUB(NOW(), INTERVAL 15 DAY)
FROM applications a WHERE a.student_id = 24 AND a.course_id = 5 LIMIT 1;

SET @rep4 = LAST_INSERT_ID();

INSERT INTO labboy_report_status_history (report_id, from_status, to_status, actor_id, reason, created_at)
VALUES
(@rep4, 'DRAFT', 'SUBMITTED', 18, 'ส่งรายงานการส่งคะแนนล่าช้า', DATE_SUB(NOW(), INTERVAL 19 DAY)),
(@rep4, 'SUBMITTED', 'UNDER_REVIEW', 23, 'รับเรื่องตรวจสอบข้อเท็จจริง', DATE_SUB(NOW(), INTERVAL 18 DAY)),
(@rep4, 'UNDER_REVIEW', 'NOT_SUBSTANTIATED', 23, 'จากการตรวจสอบ นักศึกษาได้รับมอบหมายงานเพิ่มจากอาจารย์ผู้ร่วมสอน และได้ส่งมอบคะแนนครบถ้วนก่อนวันตัดเกรด ไม่มีผลกระทบต่อนักศึกษาในชั้นเรียน', DATE_SUB(NOW(), INTERVAL 15 DAY));

INSERT INTO labboy_report_reviews (report_id, reviewer_id, decision, reason, created_at)
VALUES
(@rep4, 23, 'NOT_SUBSTANTIATED', 'คำร้องไม่มีมูลความผิดตามเกณฑ์ที่กำหนด ขอยกคำร้องและไม่บันทึกเป็นประวัติเชิงลบ', DATE_SUB(NOW(), INTERVAL 15 DAY));


-- Report 5: WITHDRAWN (Course 3)
INSERT INTO labboy_reports (application_id, student_id, course_id, reporter_id, incident_date, category, description, impact, status, submitted_at, created_at, updated_at)
SELECT a.id, 24, 3, 18, DATE_SUB(CURDATE(), INTERVAL 25 DAY), 'LATE_NOTICE',
'รายงานการเข้าปฏิบัติหน้าที่ห้องปฏิบัติการสาย 20 นาที',
'เริ่มแล็บช้ากว่ากำหนดเล็กน้อย',
'WITHDRAWN', DATE_SUB(NOW(), INTERVAL 24 DAY), DATE_SUB(NOW(), INTERVAL 24 DAY), DATE_SUB(NOW(), INTERVAL 23 DAY)
FROM applications a WHERE a.student_id = 24 AND a.course_id = 3 LIMIT 1;

SET @rep5 = LAST_INSERT_ID();

INSERT INTO labboy_report_status_history (report_id, from_status, to_status, actor_id, reason, created_at)
VALUES
(@rep5, 'DRAFT', 'SUBMITTED', 18, 'รายงานการเข้าปฏิบัติหน้าที่สาย', DATE_SUB(NOW(), INTERVAL 24 DAY)),
(@rep5, 'SUBMITTED', 'WITHDRAWN', 18, 'อาจารย์ผู้สอนเข้าใจผิดเรื่องเวลาเริ่มคาบชดเชย นักศึกษามาตรงเวลาตามตารางชดเชยที่ตกลงกันไว้ จึงขอถอนรายงาน', DATE_SUB(NOW(), INTERVAL 23 DAY));
