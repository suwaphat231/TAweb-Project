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

	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
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
	return &Config{
		SeedDemoData:   seedDemo,
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
