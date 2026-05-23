package main

import (
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
