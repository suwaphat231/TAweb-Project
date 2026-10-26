package config

import (
	"errors"
	"os"
	"strings"
)

type Config struct {
	JWTSecret      string
	Port           string
	GoogleClientID string
	ClientURL      string
	OCRServiceURL  string
	SeedDemoData   bool
	DevLogin       bool
	// ResetDBOnStart drops every table before migrating so each start
	// begins from freshly seeded demo data. Development only.
	ResetDBOnStart bool

	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string

	// SMTP settings for password-reset emails. When SMTPHost is empty no
	// email is sent; with DevLogin on, the code is logged instead.
	SMTPHost     string
	SMTPPort     string
	SMTPUser     string
	SMTPPassword string
	SMTPFrom     string

	// Object storage (MinIO / S3) for uploaded files. When S3Endpoint is
	// empty, files are kept in MySQL instead.
	S3Endpoint  string
	S3AccessKey string
	S3SecretKey string
	S3Bucket    string
	S3UseSSL    bool
}

func Load() (*Config, error) {
	secret := os.Getenv("JWT_SECRET")
	if err := validateJWTSecret(secret); err != nil {
		return nil, err
	}
	seedDemo := false
	switch os.Getenv("SEED_DEMO_DATA") {
	case "", "false":
	case "true":
		seedDemo = true
	default:
		return nil, errors.New("SEED_DEMO_DATA must be true or false")
	}
	devLogin := false
	switch os.Getenv("DEV_LOGIN") {
	case "", "false":
	case "true":
		devLogin = true
	default:
		return nil, errors.New("DEV_LOGIN must be true or false")
	}
	resetDB := false
	switch os.Getenv("RESET_DB_ON_START") {
	case "", "false":
	case "true":
		resetDB = true
	default:
		return nil, errors.New("RESET_DB_ON_START must be true or false")
	}
	// DEV_LOGIN and SEED_DEMO_DATA are never on in production, so requiring
	// both keeps a stray reset flag from wiping a real database.
	if resetDB && !(devLogin && seedDemo) {
		return nil, errors.New("RESET_DB_ON_START=true requires DEV_LOGIN=true and SEED_DEMO_DATA=true")
	}
	return &Config{
		SeedDemoData:   seedDemo,
		DevLogin:       devLogin,
		ResetDBOnStart: resetDB,
		JWTSecret:      secret,
		Port:           getEnv("PORT", "8080"),
		GoogleClientID: getEnv("GOOGLE_CLIENT_ID", ""),
		ClientURL:      getEnv("CLIENT_URL", "http://localhost:5173"),
		OCRServiceURL:  getEnv("OCR_SERVICE_URL", "http://localhost:8000"),

		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "3306"),
		DBUser:     getEnv("DB_USER", "labassist"),
		DBPassword: getEnv("DB_PASSWORD", "labassist123"),
		DBName:     getEnv("DB_NAME", "labassist"),

		SMTPHost:     getEnv("SMTP_HOST", ""),
		SMTPPort:     getEnv("SMTP_PORT", "587"),
		SMTPUser:     getEnv("SMTP_USER", ""),
		SMTPPassword: getEnv("SMTP_PASSWORD", ""),
		SMTPFrom:     getEnv("SMTP_FROM", getEnv("SMTP_USER", "")),

		S3Endpoint:  getEnv("S3_ENDPOINT", ""),
		S3AccessKey: getEnv("S3_ACCESS_KEY", ""),
		S3SecretKey: getEnv("S3_SECRET_KEY", ""),
		S3Bucket:    getEnv("S3_BUCKET", "labassist-files"),
		S3UseSSL:    os.Getenv("S3_USE_SSL") == "true",
	}, nil
}

// Validate configuration before connecting to the database or serving requests.
// Never include the supplied secret in errors or logs.
func validateJWTSecret(secret string) error {
	if strings.TrimSpace(secret) == "" {
		return errors.New("JWT_SECRET is required; generate a random secret of at least 32 bytes")
	}
	if secret != strings.TrimSpace(secret) {
		return errors.New("JWT_SECRET must not have leading or trailing whitespace")
	}
	switch strings.ToLower(secret) {
	case "labassist-secret", "change-me-in-production", "labassist-super-secret-key-change-in-production", "your-secret-key-here":
		return errors.New("JWT_SECRET must not use an example or default value; generate a new random secret")
	}
	if len(secret) < 32 {
		return errors.New("JWT_SECRET must be at least 32 bytes; generate a random secret")
	}
	return nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
