package database

import (
	"labassist/config"
	"labassist/models"
	"log"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func Connect(cfg *config.Config) {
	var err error
	DB, err = gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	if err := DB.AutoMigrate(&models.ActivityLog{}); err != nil {
		log.Fatalf("Failed to migrate activity_logs: %v", err)
	}
	log.Println("Database connected")
}
