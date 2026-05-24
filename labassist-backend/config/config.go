package config

import (
	"fmt"
	"os"
)

type Config struct {
	DBHost        string
	DBPort        string
	DBUser        string
	DBPassword    string
	DBName        string
	JWTSecret     string
	Port          string
	GoogleClientID string
	ClientURL     string
}

func Load() *Config {
	return &Config{
		DBHost:        getEnv("DB_HOST", "localhost"),
		DBPort:        getEnv("DB_PORT", "5432"),
		DBUser:        getEnv("DB_USER", "postgres"),
		DBPassword:    getEnv("DB_PASSWORD", ""),
		DBName:        getEnv("DB_NAME", "labassist"),
		JWTSecret:     getEnv("JWT_SECRET", "labassist-secret"),
		Port:          getEnv("PORT", "8080"),
		GoogleClientID: getEnv("GOOGLE_CLIENT_ID", ""),
		ClientURL:     getEnv("CLIENT_URL", "http://localhost:5173"),
	}
}

func (c *Config) DSN() string {
	return fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=Asia/Bangkok",
		c.DBHost, c.DBUser, c.DBPassword, c.DBName, c.DBPort)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
