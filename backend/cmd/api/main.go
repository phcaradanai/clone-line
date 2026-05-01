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

	"github.com/google/uuid"
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

	// Initialize WebSocket Hub
	hub := ws.NewHub()
	go hub.Run()

	// Initialize Repositories & Usecases
	chatRepo := postgres.NewChatRepository(dbPool)
	chatUsecase := usecase.NewChatUsecase(chatRepo, hub)

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

	chatHandler := deliveryHttp.NewChatHandler(chatUsecase)
	mux.HandleFunc("POST /api/v1/rooms/{roomId}/read", chatHandler.MarkAsRead)
	mux.HandleFunc("GET /api/v1/rooms/{roomId}/messages/{messageId}/readers", chatHandler.GetMessageReaders)

	// Chat History endpoint
	mux.HandleFunc("/messages", func(w http.ResponseWriter, r *http.Request) {
		// Support both room_id and roomId
		roomID := r.URL.Query().Get("room_id")
		if roomID == "" {
			roomID = r.URL.Query().Get("roomId")
		}

		if roomID == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "room_id is required"})
			return
		}

		// Validate UUID
		if _, err := uuid.Parse(roomID); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid room_id"})
			return
		}
		
		messages, err := chatUsecase.GetChatHistory(roomID, 50, 0)
		if err != nil {
			log.Printf("ERROR: Failed to fetch chat history for room %s: %v", roomID, err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "internal server error"})
			return
		}
		
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(messages)
	})

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

	mux.HandleFunc("/unread", func(w http.ResponseWriter, r *http.Request) {
		roomID := r.URL.Query().Get("room_id")
		userID := r.URL.Query().Get("user_id")
		if roomID == "" || userID == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "room_id and user_id are required"})
			return
		}

		if _, err := uuid.Parse(roomID); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid room_id"})
			return
		}
		if _, err := uuid.Parse(userID); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid user_id"})
			return
		}

		count, err := chatUsecase.GetUnreadCount(roomID, userID)
		if err != nil {
			log.Printf("[API] /unread Error | room_id: %s | user_id: %s | error: %v", roomID, userID, err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "internal server error"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]int{"count": count})
	})

	mux.HandleFunc("/rooms", func(w http.ResponseWriter, r *http.Request) {
		userID := r.URL.Query().Get("user_id")
		if userID == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "user_id is required"})
			return
		}

		if _, err := uuid.Parse(userID); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid user_id"})
			return
		}

		rooms, err := chatUsecase.GetUserRooms(userID)
		if err != nil {
			log.Printf("[API] /rooms Error | user_id: %s | error: %v", userID, err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "internal server error"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(rooms)
	})


	port := os.Getenv("PORT")
	if port == "" { port = "8888" }

	log.Printf("Server starting on port %s...", port)
	
	// Middleware for Logging & CORS
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		
		// CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		
		if r.Method == "OPTIONS" {
			return
		}

		// Wrapper to capture status code
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}

		mux.ServeHTTP(sw, r)

		duration := time.Since(start)
		log.Printf("[HTTP] %s %s | Status: %d | Duration: %v", r.Method, r.URL.Path, sw.status, duration)
	})

	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal(err)
	}
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (sw *statusWriter) WriteHeader(status int) {
	sw.status = status
	sw.ResponseWriter.WriteHeader(status)
}
