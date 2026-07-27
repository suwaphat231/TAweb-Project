-- Seed data for the `users` table, mirroring the fixtures in database/seed.go
-- (addStaffUser / addStudent calls). Password for every seeded login is
-- "password123" (bcrypt hash below).

INSERT INTO users
    (id, username, password_hash, full_name, email, role, student_id, google_sub, gpa, faculty, year, is_active, created_at, updated_at)
VALUES
    (1, 'somchai',   '$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO', 'ผศ.ดร. ภูริวัจน์ วรวิชัยพัฒน์', 'somchai@cp.su.ac.th',   'instructor', NULL,         NULL,             NULL, NULL,             NULL, true, NOW(), NOW()),
    (2, 'malee',     '$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO', 'รศ.ดร. มาลี ศรีสุข',            'malee@cp.su.ac.th',     'instructor', NULL,         NULL,             NULL, NULL,             NULL, true, NOW(), NOW()),
    (3, 'thanakorn', '$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO', 'อ. ธนากร แสงอรุณ',            'thanakorn@cp.su.ac.th', 'instructor', NULL,         NULL,             NULL, NULL,             NULL, true, NOW(), NOW()),
    (4, 'parinya',   '$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO', 'ปริญญา สุภาวดี',               'parinya@cp.su.ac.th',   'staff',      NULL,         NULL,             NULL, NULL,             NULL, true, NOW(), NOW()),
    (5, 'admin',     '$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO', 'วิทยา ผู้ดูแลระบบ',           'admin@cp.su.ac.th',     'admin',      NULL,         NULL,             NULL, NULL,             NULL, true, NOW(), NOW()),

    (6,  'pakpong',   '$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO', 'ปกป้อง วงศ์ไทย',   'pakpong@gmail.com',   'student', '650710245', 'google_sub_001', 3.45, 'วิทยาศาสตร์', 3, true, NOW(), NOW()),
    (7,  'napatsara', '$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO', 'นภัสรา จันทรเดช',  'napatsara@gmail.com', 'student', '650710102', 'google_sub_002', 3.12, 'วิทยาศาสตร์', 3, true, NOW(), NOW()),
    (8,  'phumipath',  '$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO', 'ภูมิพัฒน์ สีเขียว', 'phumipath@gmail.com', 'student', '650710318', 'google_sub_003', 3.78, 'วิทยาศาสตร์', 3, true, NOW(), NOW()),
    (9,  'warissara',  '$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO', 'วริศรา ทองดี',      'warissara@gmail.com', 'student', '650710421', 'google_sub_004', 2.95, 'วิทยาศาสตร์', 2, true, NOW(), NOW()),
    (10, 'nathapol',   '$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO', 'ณัฐพล มีสุข',       'nathapol@gmail.com',  'student', '650710533', 'google_sub_005', 3.62, 'วิทยาศาสตร์', 3, true, NOW(), NOW());

-- Ids above are hardcoded, so bump the identity sequence past them or the
-- next INSERT without an explicit id (e.g. a new signup) would collide.
SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users));
