USE labassist;

-- password: "password123" — run tools/hash_password.go to get real hash
-- Temporary placeholder hash (replace with real bcrypt hash before use)
SET @pw = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LPVKCDJa6ae';
SET @admin_pw = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LPVKCDJa6ae';

INSERT IGNORE INTO users (username, password_hash, full_name, email, role) VALUES
('somchai',   @pw,       'ผศ.ดร. สมชาย ใจดี',    'somchai@cp.su.ac.th',   'instructor'),
('malee',     @pw,       'รศ.ดร. มาลี ศรีสุข',   'malee@cp.su.ac.th',     'instructor'),
('thanakorn', @pw,       'อ. ธนากร แสงอรุณ',     'thanakorn@cp.su.ac.th', 'instructor'),
('parinya',   @pw,       'ปริญญา สุภาวดี',        'parinya@cp.su.ac.th',   'staff'),
('admin',     @admin_pw, 'วิทยา ผู้ดูแลระบบ',     'admin@cp.su.ac.th',     'admin');

INSERT IGNORE INTO users (full_name, email, role, student_id, gpa, faculty, year, google_sub) VALUES
('ปกป้อง วงศ์ไทย',    'pakpong@gmail.com',    'student', '650710245', 3.45, 'วิทยาศาสตร์', 3, 'google_sub_001'),
('นภัสรา จันทรเดช',  'napatsara@gmail.com',  'student', '650710102', 3.12, 'วิทยาศาสตร์', 3, 'google_sub_002'),
('ภูมิพัฒน์ สีเขียว', 'phumipath@gmail.com', 'student', '650710318', 3.78, 'วิทยาศาสตร์', 3, 'google_sub_003'),
('วริศรา ทองดี',      'warissara@gmail.com',  'student', '650710421', 2.95, 'วิทยาศาสตร์', 2, 'google_sub_004'),
('ณัฐพล มีสุข',       'nathapol@gmail.com',   'student', '650710533', 3.62, 'วิทยาศาสตร์', 3, 'google_sub_005');

INSERT IGNORE INTO courses (code, title, instructor_id, semester, academic_year, ta_slots, labboy_slots, status, deadline) VALUES
('CS101', 'การโปรแกรมคอมพิวเตอร์เบื้องต้น',   1, '1', 2567, 3, 2, 'open',         '2567-09-30'),
('CS221', 'โครงสร้างข้อมูลและอัลกอริทึม',       1, '1', 2567, 2, 1, 'open',         '2567-09-25'),
('CS305', 'เครือข่ายคอมพิวเตอร์',               2, '1', 2567, 2, 1, 'closed',        NULL),
('CS312', 'ระบบฐานข้อมูล',                       2, '1', 2567, 2, 2, 'closed',        NULL),
('CS340', 'ปัญญาประดิษฐ์',                       3, '1', 2567, 2, 1, 'closing_soon', '2567-09-20'),
('CS405', 'วิศวกรรมซอฟต์แวร์',                  3, '1', 2567, 3, 1, 'open',          '2567-10-05');

INSERT IGNORE INTO applications (student_id, course_id, role_applied, status, motivation, applied_at) VALUES
(6, 1, 'ta',     'accepted', 'สนใจสอนการโปรแกรมให้น้องปี 1 ครับ', NOW()),
(7, 1, 'labboy', 'accepted', 'อยากช่วยดูแลห้องแลปครับ', NOW()),
(8, 2, 'ta',     'accepted', 'เรียน CS221 ได้ A มาครับ ยินดีช่วย', NOW()),
(9, 6, 'ta',     'rejected', 'ต้องการประสบการณ์ด้าน SE', NOW()),
(10,1, 'ta',     'accepted', 'มีประสบการณ์สอน Python มาก่อน', NOW());

UPDATE courses SET ta_accepted = 2, labboy_accepted = 1 WHERE id = 1;
UPDATE courses SET ta_accepted = 1 WHERE id = 2;
