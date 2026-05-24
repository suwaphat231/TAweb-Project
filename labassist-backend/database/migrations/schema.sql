-- LabAssist PostgreSQL Schema
-- Run: psql -U postgres -c "CREATE DATABASE labassist;"
--      psql -U postgres -d labassist -f schema.sql

CREATE TYPE user_role AS ENUM ('student', 'instructor', 'staff', 'admin');
CREATE TYPE course_status AS ENUM ('open', 'closing_soon', 'closed', 'draft');
CREATE TYPE app_status AS ENUM ('accepted', 'rejected', 'withdrawn');
CREATE TYPE role_applied AS ENUM ('ta', 'labboy');

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255),
  full_name     VARCHAR(200) NOT NULL,
  email         VARCHAR(200) UNIQUE NOT NULL,
  role          user_role NOT NULL,
  student_id    VARCHAR(20) UNIQUE,
  google_sub    VARCHAR(100) UNIQUE,
  gpa           NUMERIC(3,2),
  faculty       VARCHAR(200),
  year          SMALLINT,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(20) NOT NULL,
  title           VARCHAR(300) NOT NULL,
  instructor_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  semester        VARCHAR(10) NOT NULL,
  academic_year   INTEGER NOT NULL,
  ta_slots        INTEGER DEFAULT 0,
  labboy_slots    INTEGER DEFAULT 0,
  ta_accepted     INTEGER DEFAULT 0,
  labboy_accepted INTEGER DEFAULT 0,
  status          course_status DEFAULT 'draft',
  deadline        DATE,
  description     TEXT,
  requirements    TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applications (
  id              SERIAL PRIMARY KEY,
  student_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  role_applied    role_applied NOT NULL,
  status          app_status DEFAULT 'accepted',
  motivation      TEXT,
  applied_at      TIMESTAMP DEFAULT NOW(),
  reviewed_at     TIMESTAMP,
  reviewed_by_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note            TEXT,
  UNIQUE (student_id, course_id)
);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
