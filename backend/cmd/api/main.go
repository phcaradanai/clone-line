package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	deliveryHttp "github.com/phcar/chat-app-backend/internal/delivery/http"
	"github.com/phcar/chat-app-backend/internal/delivery/ws"
	"github.com/phcar/chat-app-backend/internal/domain"
	"github.com/phcar/chat-app-backend/internal/repository/postgres"
	"github.com/phcar/chat-app-backend/internal/usecase"
)

func main() {
	// Database connection with Retry
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://chatuser:chatpassword@localhost:5432/chatdb"
	}

	var dbPool *pgxpool.Pool
	var err error
	for i := 0; i < 10; i++ {
		dbPool, err = pgxpool.New(context.Background(), dbURL)
		if err == nil {
			err = dbPool.Ping(context.Background())
			if err == nil {
				break
			}
		}
		log.Printf("Waiting for database... (%d/10)", i+1)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatal("Unable to connect to database after retries:", err)
	}
	defer dbPool.Close()

	// Run migrations from init.sql
	migrationPath := "migrations/init.sql"
	migrationSQL, err := os.ReadFile(migrationPath)
	if err != nil {
		log.Printf("Warning: Could not read migration file: %v", err)
	} else {
		// Split by semicolon and run each statement
		statements := strings.Split(string(migrationSQL), ";")
		for _, stmt := range statements {
			stmt = strings.TrimSpace(stmt)
			if stmt == "" {
				continue
			}
			_, err = dbPool.Exec(context.Background(), stmt)
			if err != nil {
				log.Printf("Migration step failed: %v | Statement: %s", err, stmt)
			}
		}
		log.Println("Migrations applied successfully")
	}

	// Initialize Repositories & Usecases
	chatRepo := postgres.NewChatRepository(dbPool)
	chatUsecase := usecase.NewChatUsecase(chatRepo)

	// Initialize WebSocket Hub
	hub := ws.NewHub()
	go hub.Run()

	// Initialize Image Upload Handler with Retry (Waiting for Minio)
	var uploadHandler *deliveryHttp.UploadHandler
	minioEndpoint := os.Getenv("MINIO_ENDPOINT")
	if minioEndpoint == "" { minioEndpoint = "localhost:9000" }
	minioAccessKey := os.Getenv("MINIO_ACCESS_KEY")
	if minioAccessKey == "" { minioAccessKey = "minioadmin" }
	minioSecretKey := os.Getenv("MINIO_SECRET_KEY")
	if minioSecretKey == "" { minioSecretKey = "minioadminpassword" }
	minioBucket := os.Getenv("MINIO_BUCKET")
	if minioBucket == "" { minioBucket = "chat-uploads" }

	for i := 0; i < 10; i++ {
		uploadHandler, err = deliveryHttp.NewUploadHandler(
			minioEndpoint,
			minioAccessKey,
			minioSecretKey,
			minioBucket,
		)
		if err == nil {
			break
		}
		log.Printf("Waiting for Minio... (%d/10): %v", i+1, err)
		time.Sleep(3 * time.Second)
	}
	if err != nil {
		log.Printf("Warning: Failed to initialize upload handler: %v", err)
	}

	// Routes
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		ws.ServeWs(hub, chatUsecase, w, r)
	})
	if uploadHandler != nil {
		mux.HandleFunc("/upload", uploadHandler.HandleUpload)
	}

	mux.HandleFunc("/register", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		user := &domain.User{
			Username:    fmt.Sprintf("Guest_%d", time.Now().UnixNano()%10000),
			DisplayName: "Guest User",
		}
		if err := chatUsecase.RegisterUser(user); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(user)
	})

	port := os.Getenv("PORT")
	if port == "" { port = "8888" }

	log.Printf("Server starting on port %s...", port)
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		if r.Method == "OPTIONS" { return }
		mux.ServeHTTP(w, r)
	})

	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal(err)
	}
}
