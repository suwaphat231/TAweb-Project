-- LabAssist Seed Data (PostgreSQL)
-- password: "password123" → bcrypt hash
-- Generate real hash: go run tools/hash_password.go "password123"

DO $$
DECLARE
  pw TEXT := '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LPVKCDJa6ae';
BEGIN

-- Instructors
INSERT INTO users (username, password_hash, full_name, email, role) VALUES
('somchai',   pw, 'ผศ.ดร. สมชาย ใจดี',    'somchai@cp.su.ac.th',   'instructor'),
('malee',     pw, 'รศ.ดร. มาลี ศรีสุข',   'malee@cp.su.ac.th',     'instructor'),
('thanakorn', pw, 'อ. ธนากร แสงอรุณ',     'thanakorn@cp.su.ac.th', 'instructor')
ON CONFLICT DO NOTHING;

-- Staff
INSERT INTO users (username, password_hash, full_name, email, role) VALUES
('parinya', pw, 'ปริญญา สุภาวดี', 'parinya@cp.su.ac.th', 'staff')
ON CONFLICT DO NOTHING;

-- Admin
INSERT INTO users (username, password_hash, full_name, email, role) VALUES
('admin', pw, 'วิทยา ผู้ดูแลระบบ', 'admin@cp.su.ac.th', 'admin')
ON CONFLICT DO NOTHING;

-- Mock Students
INSERT INTO users (full_name, email, role, student_id, gpa, faculty, year, google_sub) VALUES
('ปกป้อง วงศ์ไทย',    'pakpong@gmail.com',    'student', '650710245', 3.45, 'วิทยาศาสตร์', 3, 'google_sub_001'),
('นภัสรา จันทรเดช',  'napatsara@gmail.com',  'student', '650710102', 3.12, 'วิทยาศาสตร์', 3, 'google_sub_002'),
('ภูมิพัฒน์ สีเขียว', 'phumipath@gmail.com', 'student', '650710318', 3.78, 'วิทยาศาสตร์', 3, 'google_sub_003'),
('วริศรา ทองดี',      'warissara@gmail.com',  'student', '650710421', 2.95, 'วิทยาศาสตร์', 2, 'google_sub_004'),
('ณัฐพล มีสุข',       'nathapol@gmail.com',   'student', '650710533', 3.62, 'วิทยาศาสตร์', 3, 'google_sub_005')
ON CONFLICT DO NOTHING;

END $$;

-- Courses (instructor ids: somchai=1, malee=2, thanakorn=3)
INSERT INTO courses (code, title, instructor_id, semester, academic_year, ta_slots, labboy_slots, status, deadline)
SELECT * FROM (VALUES
  ('CS101', 'การโปรแกรมคอมพิวเตอร์เบื้องต้น',  (SELECT id FROM users WHERE username='somchai'),   '1', 2567, 3, 2, 'open'::course_status,         '2567-09-30'::date),
  ('CS221', 'โครงสร้างข้อมูลและอัลกอริทึม',      (SELECT id FROM users WHERE username='somchai'),   '1', 2567, 2, 1, 'open'::course_status,         '2567-09-25'::date),
  ('CS305', 'เครือข่ายคอมพิวเตอร์',              (SELECT id FROM users WHERE username='malee'),     '1', 2567, 2, 1, 'closed'::course_status,        NULL),
  ('CS312', 'ระบบฐานข้อมูล',                      (SELECT id FROM users WHERE username='malee'),     '1', 2567, 2, 2, 'closed'::course_status,        NULL),
  ('CS340', 'ปัญญาประดิษฐ์',                      (SELECT id FROM users WHERE username='thanakorn'), '1', 2567, 2, 1, 'closing_soon'::course_status, '2567-09-20'::date),
  ('CS405', 'วิศวกรรมซอฟต์แวร์',                 (SELECT id FROM users WHERE username='thanakorn'), '1', 2567, 3, 1, 'open'::course_status,          '2567-10-05'::date)
) AS v(code, title, instructor_id, semester, academic_year, ta_slots, labboy_slots, status, deadline)
ON CONFLICT DO NOTHING;

-- Applications
INSERT INTO applications (student_id, course_id, role_applied, status, motivation)
SELECT u.id, c.id, 'ta'::role_applied,     'accepted'::app_status, 'สนใจสอนการโปรแกรมให้น้องปี 1 ครับ' FROM users u, courses c WHERE u.email='pakpong@gmail.com'    AND c.code='CS101' ON CONFLICT DO NOTHING;
INSERT INTO applications (student_id, course_id, role_applied, status, motivation)
SELECT u.id, c.id, 'labboy'::role_applied,  'accepted'::app_status, 'อยากช่วยดูแลห้องแลปครับ'           FROM users u, courses c WHERE u.email='napatsara@gmail.com' AND c.code='CS101' ON CONFLICT DO NOTHING;
INSERT INTO applications (student_id, course_id, role_applied, status, motivation)
SELECT u.id, c.id, 'ta'::role_applied,     'accepted'::app_status, 'เรียน CS221 ได้ A มาครับ'           FROM users u, courses c WHERE u.email='phumipath@gmail.com' AND c.code='CS221' ON CONFLICT DO NOTHING;
INSERT INTO applications (student_id, course_id, role_applied, status, motivation)
SELECT u.id, c.id, 'ta'::role_applied,     'rejected'::app_status, 'ต้องการประสบการณ์ด้าน SE'           FROM users u, courses c WHERE u.email='warissara@gmail.com' AND c.code='CS405' ON CONFLICT DO NOTHING;
INSERT INTO applications (student_id, course_id, role_applied, status, motivation)
SELECT u.id, c.id, 'ta'::role_applied,     'accepted'::app_status, 'มีประสบการณ์สอน Python มาก่อน'     FROM users u, courses c WHERE u.email='nathapol@gmail.com'  AND c.code='CS101' ON CONFLICT DO NOTHING;

-- Update accepted counts
UPDATE courses SET ta_accepted = 2, labboy_accepted = 1 WHERE code = 'CS101';
UPDATE courses SET ta_accepted = 1 WHERE code = 'CS221';
