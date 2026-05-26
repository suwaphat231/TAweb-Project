// @title           LabAssist API
// @version         1.0
// @description     ระบบจัดการ TA/Lab Boy ภาควิชาคอมพิวเตอร์ มหาวิทยาลัยศิลปากร
// @termsOfService  http://swagger.io/terms/

// @contact.name   LabAssist Support
// @contact.email  watthakicharoen_s@silpakorn.edu

// @license.name  MIT

// @host      localhost:8080
// @BasePath  /api/v1

// @securityDefinitions.apikey  BearerAuth
// @in                          header
// @name                        Authorization
// @description                 พิมพ์ "Bearer " ตามด้วย JWT token เช่น "Bearer eyJhbGci..."

package main

import (
	_ "labassist/docs"
	"labassist/config"
	"labassist/database"
	"labassist/middleware"
	"labassist/routes"
	"log"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	cfg := config.Load()
	database.Connect(cfg)

	r := gin.Default()
	r.Use(middleware.CORS(cfg))

	routes.Setup(r, cfg)

	log.Printf("LabAssist API starting on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
