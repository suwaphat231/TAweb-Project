
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('student', 'instructor', 'staff', 'admin');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id                     BIGSERIAL PRIMARY KEY,
    username               VARCHAR(100),
    password_hash          VARCHAR(255),
    full_name              VARCHAR(200)  NOT NULL,
    email                  VARCHAR(200)  NOT NULL,
    role                   user_role     NOT NULL,
    student_id             VARCHAR(20),
    google_sub             VARCHAR(100),
    gpa                    DECIMAL(3,2),
    faculty                VARCHAR(200),
    year                   SMALLINT,
    is_active              BOOLEAN       NOT NULL DEFAULT true,
    created_at             TIMESTAMPTZ,
    updated_at             TIMESTAMPTZ,

    transcript_grades      JSONB,
    transcript_status      VARCHAR(50),
    transcript_message     TEXT,
    transcript_confidence  DECIMAL(5,4),
    transcript_updated_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
    ON users (username);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_student_id
    ON users (student_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
    ON users (google_sub);

-- Admin-created accounts start with a blank email (filled in later via
-- Google sign-in), so multiple blank emails must be allowed — a plain
-- unique index would reject the second such account.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
    ON users (email) WHERE email <> '';
