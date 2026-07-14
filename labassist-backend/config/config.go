package config

import (
	"os"
)

type Config struct {
	JWTSecret      string
	Port           string
	GoogleClientID string
	ClientURL      string
}

func Load() *Config {
	return &Config{
		JWTSecret:      getEnv("JWT_SECRET", "labassist-secret"),
		Port:           getEnv("PORT", "8080"),
		GoogleClientID: getEnv("GOOGLE_CLIENT_ID", ""),
		ClientURL:      getEnv("CLIENT_URL", "http://localhost:5173"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
