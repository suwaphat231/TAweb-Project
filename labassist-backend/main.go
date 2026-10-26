package main

import (
	"labassist/config"
	"labassist/database"
	"labassist/filestore"
	"labassist/middleware"
	"labassist/routes"
	"log"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

// @title           LabAssist API
// @version         1.0
// @description     API สำหรับระบบจัดการ TA ภาควิชา CS มหาวิทยาลัยศิลปากร
// @host            localhost:8080
// @BasePath        /api/v1
// @securityDefinitions.apikey BearerAuth
// @in              header
// @name            Authorization
func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("invalid configuration: %v", err)
	}

	if err := filestore.Init(filestore.Config{
		Endpoint:  cfg.S3Endpoint,
		AccessKey: cfg.S3AccessKey,
		SecretKey: cfg.S3SecretKey,
		Bucket:    cfg.S3Bucket,
		UseSSL:    cfg.S3UseSSL,
	}); err != nil {
		log.Fatalf("object storage failed: %v", err)
	}

	if err := database.Connect(cfg); err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	// Move files uploaded before object storage was on out of MySQL. It runs
	// in the background; until a row is moved it is still read from its blob.
	go database.MigrateBlobsToFileStore()

	r := gin.Default()
	r.Use(middleware.CORS(cfg))

	routes.Setup(r, cfg)

	log.Printf("LabAssist API starting on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
