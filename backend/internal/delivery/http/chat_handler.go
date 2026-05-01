package http

import (
	"encoding/json"
	"net/http"

	"github.com/phcar/chat-app-backend/internal/usecase"
)

type ChatHandler struct {
	chatUsecase usecase.ChatUsecase
}

func NewChatHandler(chatUsecase usecase.ChatUsecase) *ChatHandler {
	return &ChatHandler{chatUsecase: chatUsecase}
}

func (h *ChatHandler) MarkAsRead(w http.ResponseWriter, r *http.Request) {
	roomID := r.PathValue("roomId")
	if roomID == "" {
		http.Error(w, "roomId is required", http.StatusBadRequest)
		return
	}

	var payload struct {
		UserID            string `json:"user_id"`
		LastReadMessageID string `json:"last_read_message_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	err := h.chatUsecase.MarkAsRead(roomID, payload.UserID, payload.LastReadMessageID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *ChatHandler) GetMessageReaders(w http.ResponseWriter, r *http.Request) {
	roomID := r.PathValue("roomId")
	messageID := r.PathValue("messageId")

	if roomID == "" || messageID == "" {
		http.Error(w, "roomId and messageId are required", http.StatusBadRequest)
		return
	}

	readers, err := h.chatUsecase.GetMessageReaders(roomID, messageID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(readers)
}
