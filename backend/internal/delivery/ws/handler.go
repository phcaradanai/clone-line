package ws

import (
	"encoding/json"
	"log"
	"net/http"

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
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	// In a real app, extract user ID from JWT
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		userID = "anonymous"
	}

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
				RoomID            string `json:"roomId"`
				UserID            string `json:"userId"`
				LastReadMessageID string `json:"lastReadMessageId"`
				ReadAt            string `json:"readAt"`
			}
			if err := json.Unmarshal(event.Payload, &payload); err == nil {
				// Update persistence
				err := c.Usecase.MarkAsRead(payload.RoomID, payload.UserID, payload.LastReadMessageID)
				if err != nil {
					log.Printf("Warning: Failed to mark as read: %v", err)
				}
				// Broadcast the read receipt to others in the room
				c.Hub.broadcast <- message
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
			}
			
			// Broadcast the message to everyone (including the sender)
			broadcastMsg, _ := json.Marshal(msg)
			c.Hub.broadcast <- broadcastMsg
		} else {
			log.Printf("Received non-JSON message or invalid format: %s", string(message))
			c.Hub.broadcast <- message
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
