CREATE DATABASE IF NOT EXISTS labassist CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE labassist;

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255),
  full_name     VARCHAR(200) NOT NULL,
  email         VARCHAR(200) UNIQUE NOT NULL,
  role          ENUM('student','instructor','staff','admin') NOT NULL,
  student_id    VARCHAR(20) UNIQUE,
  google_sub    VARCHAR(100) UNIQUE,
  gpa           DECIMAL(3,2),
  faculty       VARCHAR(200),
  year          TINYINT,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    DATETIME DEFAULT NOW(),
  updated_at    DATETIME DEFAULT NOW() ON UPDATE NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(20) NOT NULL,
  title           VARCHAR(300) NOT NULL,
  instructor_id   INT NOT NULL,
  semester        VARCHAR(10) NOT NULL,
  academic_year   YEAR NOT NULL,
  ta_slots        INT DEFAULT 0,
  labboy_slots    INT DEFAULT 0,
  ta_accepted     INT DEFAULT 0,
  labboy_accepted INT DEFAULT 0,
  status          ENUM('open','closing_soon','closed','draft') DEFAULT 'draft',
  deadline        DATE,
  description     TEXT,
  requirements    TEXT,
  created_at      DATETIME DEFAULT NOW(),
  updated_at      DATETIME DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS applications (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  student_id      INT NOT NULL,
  course_id       INT NOT NULL,
  role_applied    ENUM('ta','labboy') NOT NULL,
  status          ENUM('accepted','rejected','withdrawn') DEFAULT 'accepted',
  motivation      TEXT,
  applied_at      DATETIME DEFAULT NOW(),
  reviewed_at     DATETIME,
  reviewed_by_id  INT,
  note            TEXT,
  UNIQUE KEY uq_student_course (student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by_id) REFERENCES users(id) ON DELETE SET NULL
);
