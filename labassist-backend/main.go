package main

import (
	"labassist/config"
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

	cfg := config.Load()

	r := gin.Default()
	r.Use(middleware.CORS(cfg))

	routes.Setup(r, cfg)

	log.Printf("LabAssist API starting on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
