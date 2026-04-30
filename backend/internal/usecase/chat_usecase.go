package usecase

import (
	"github.com/phcar/chat-app-backend/internal/domain"
)

type ChatUsecase interface {
	SendMessage(msg *domain.Message) error
	GetChatHistory(roomID string, limit, offset int) ([]domain.Message, error)
	GetUserRooms(userID string) ([]domain.Room, error)
	RegisterUser(user *domain.User) error
}

type chatUsecase struct {
	repo domain.ChatRepository
}

func NewChatUsecase(repo domain.ChatRepository) ChatUsecase {
	return &chatUsecase{repo: repo}
}

func (u *chatUsecase) SendMessage(msg *domain.Message) error {
	// Add validation or processing if needed
	return u.repo.SaveMessage(msg)
}

func (u *chatUsecase) GetChatHistory(roomID string, limit, offset int) ([]domain.Message, error) {
	return u.repo.GetMessages(roomID, limit, offset)
}

func (u *chatUsecase) GetUserRooms(userID string) ([]domain.Room, error) {
	return u.repo.GetRooms(userID)
}

func (u *chatUsecase) RegisterUser(user *domain.User) error {
	return u.repo.RegisterUser(user)
}
