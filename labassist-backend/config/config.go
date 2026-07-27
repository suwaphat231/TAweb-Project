package config

import (
	"os"
)

type Config struct {
	JWTSecret      string
	Port           string
	GoogleClientID string
	ClientURL      string

	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
}

func Load() *Config {
	return &Config{
		JWTSecret:      getEnv("JWT_SECRET", "labassist-secret"),
		Port:           getEnv("PORT", "8080"),
		GoogleClientID: getEnv("GOOGLE_CLIENT_ID", ""),
		ClientURL:      getEnv("CLIENT_URL", "http://localhost:5173"),

		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "labassist"),
		DBPassword: getEnv("DB_PASSWORD", "labassist123"),
		DBName:     getEnv("DB_NAME", "labassist"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
