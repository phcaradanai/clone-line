package ws

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/phcar/chat-app-backend/internal/domain"
	"github.com/phcar/chat-app-backend/internal/usecase"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

func ServeWs(hub *Hub, uc usecase.ChatUsecase, w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")

	// Validation BEFORE upgrade
	if userID == "" {
		log.Printf("[WS] Connection rejected: user_id is required")
		http.Error(w, "user_id is required", http.StatusBadRequest)
		return
	}

	if _, err := uuid.Parse(userID); err != nil {
		log.Printf("[WS] Connection rejected: invalid user_id (%s)", userID)
		http.Error(w, "invalid user_id", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] Upgrade error for user %s: %v", userID, err)
		return
	}

	log.Printf("[WS] User connected: %s", userID)

	client := &Client{
		ID:      userID,
		Conn:    conn,
		Send:    make(chan []byte, 256),
		Hub:     hub,
		Usecase: uc,
	}

	client.Hub.register <- client

	// Start reader and writer goroutines
	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			log.Printf("error: %v", err)
			break
		}

		// Parse and handle event
		var event struct {
			Type    string          `json:"type"`
			Payload json.RawMessage `json:"payload"`
		}

		if err := json.Unmarshal(message, &event); err == nil && event.Type == "message:read" {
			var payload struct {
				RoomID            string `json:"room_id"`
				UserID            string `json:"user_id"`
				LastReadMessageID string `json:"last_read_message_id"`
				ReadAt            string `json:"read_at"`
			}
			if err := json.Unmarshal(event.Payload, &payload); err == nil {
				log.Printf("[WS] message:read received from user %s for room %s", payload.UserID, payload.RoomID)

				// Update persistence
				err := c.Usecase.MarkAsRead(payload.RoomID, payload.UserID, payload.LastReadMessageID)
				if err != nil {
					log.Printf("[DB] Mark read error: %v", err)
				}
				// Note: broadcast is now handled inside Usecase.MarkAsRead via EventPublisher
			} else {
				log.Printf("[WS] Failed to parse message:read payload: %v", err)
			}
			continue
		}

		// Otherwise, handle as a regular message
		var msg domain.Message
		if err := json.Unmarshal(message, &msg); err == nil {
			if msg.UserID == "" {
				msg.UserID = c.ID
			}

			// Try to save to database but don't block broadcasting if it fails
			err := c.Usecase.SendMessage(&msg)
			if err != nil {
				log.Printf("Warning: Failed to save message to DB: %v", err)
				// Broadcast error or original message? Let's just log.
			}
			// Note: broadcast is now handled inside Usecase.SendMessage via EventPublisher
		} else {
			log.Printf("Received non-JSON message or invalid format: %s", string(message))
			// Do not broadcast raw invalid messages
		}

	}
}

func (c *Client) writePump() {
	defer func() {
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			if err := w.Close(); err != nil {
				return
			}
		}
	}
}
