package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	deliveryHttp "github.com/phcar/chat-app-backend/internal/delivery/http"
	"github.com/phcar/chat-app-backend/internal/delivery/ws"
	"github.com/phcar/chat-app-backend/internal/domain"
	"github.com/phcar/chat-app-backend/internal/repository/postgres"
	"github.com/phcar/chat-app-backend/internal/usecase"
)

func main() {
	// Database connection
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://chatuser:chatpassword@localhost:5432/chatdb"
	}
	dbPool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatal("Unable to connect to database:", err)
	}
	defer dbPool.Close()
	
	// Run migrations
	migrationPath := "migrations/init.sql"
	migrationSQL, err := os.ReadFile(migrationPath)
	if err != nil {
		log.Printf("Warning: Could not read migration file: %v", err)
	} else {
		_, err = dbPool.Exec(context.Background(), string(migrationSQL))
		if err != nil {
			log.Printf("Warning: Could not run migrations: %v", err)
		} else {
			log.Println("Migrations applied successfully")
		}
	}

	// Initialize Repositories & Usecases
	chatRepo := postgres.NewChatRepository(dbPool)
	chatUsecase := usecase.NewChatUsecase(chatRepo)

	// Initialize WebSocket Hub
	hub := ws.NewHub()
	go hub.Run()

	// Initialize Image Upload Handler
	minioEndpoint := os.Getenv("MINIO_ENDPOINT")
	if minioEndpoint == "" {
		minioEndpoint = "localhost:9000"
	}
	minioAccessKey := os.Getenv("MINIO_ACCESS_KEY")
	if minioAccessKey == "" {
		minioAccessKey = "minioadmin"
	}
	minioSecretKey := os.Getenv("MINIO_SECRET_KEY")
	if minioSecretKey == "" {
		minioSecretKey = "minioadminpassword"
	}
	minioBucket := os.Getenv("MINIO_BUCKET")
	if minioBucket == "" {
		minioBucket = "chat-uploads"
	}

	uploadHandler, err := deliveryHttp.NewUploadHandler(
		minioEndpoint,
		minioAccessKey,
		minioSecretKey,
		minioBucket,
	)
	if err != nil {
		log.Fatal("Failed to initialize upload handler:", err)
	}

	// Routes
	mux := http.NewServeMux()

	// WebSocket endpoint
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		ws.ServeWs(hub, chatUsecase, w, r)
	})

	// Upload endpoint
	mux.HandleFunc("/upload", uploadHandler.HandleUpload)

	// Register Guest endpoint
	mux.HandleFunc("/register", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		
		// ในที่นี้เราจะสร้าง User สุ่มให้เลยเพื่อความง่าย
		user := &domain.User{
			Username:    fmt.Sprintf("Guest_%d", time.Now().UnixNano()%10000),
			DisplayName: "Guest User",
		}
		
		// สมมติว่าเรามีฟังก์ชัน CreateUser ใน usecase (เดี๋ยวจะไปเพิ่มครับ)
		if err := chatUsecase.RegisterUser(user); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(user)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8888"
	}

	log.Printf("Server starting on port %s...", port)
	
	// เพิ่ม CORS Middleware
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		
		if r.Method == "OPTIONS" {
			return
		}
		
		mux.ServeHTTP(w, r)
	})

	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal(err)
	}
}
