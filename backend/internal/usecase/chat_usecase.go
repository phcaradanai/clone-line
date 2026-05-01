package usecase

import (
	"github.com/phcar/chat-app-backend/internal/domain"
)

type ChatUsecase interface {
	SendMessage(msg *domain.Message) error
	GetChatHistory(roomID string, limit, offset int) ([]domain.Message, error)
	GetUserRooms(userID string) ([]domain.Room, error)
	RegisterUser(user *domain.User) error
	MarkAsRead(roomID string, userID string, lastReadMessageID string) error
	GetUnreadCount(roomID string, userID string) (int, error)
	GetMessageReaders(roomID string, messageID string) ([]domain.User, error)
}

type chatUsecase struct {
	repo      domain.ChatRepository
	publisher domain.EventPublisher
}

func NewChatUsecase(repo domain.ChatRepository, publisher domain.EventPublisher) ChatUsecase {
	return &chatUsecase{repo: repo, publisher: publisher}
}

func (u *chatUsecase) SendMessage(msg *domain.Message) error {
	// Validate replyToMessageId if present
	if msg.ReplyToMessageID != nil {
		repliedMsg, err := u.repo.GetMessage(*msg.ReplyToMessageID)
		if err != nil {
			return err
		}
		if repliedMsg.RoomID != msg.RoomID {
			return domain.ValidationError{Message: "replied message belongs to a different room"}
		}

		preview := ""
		if repliedMsg.Type == "image" {
			preview = "รูปภาพ"
		} else if repliedMsg.Type == "file" {
			preview = "ไฟล์แนบ"
		} else {
			preview = repliedMsg.Content
		}
		repliedMsg.Preview = preview
		msg.ReplyToMessage = repliedMsg
	}

	err := u.repo.SaveMessage(msg)
	if err != nil {
		return err
	}

	if u.publisher != nil {
		u.publisher.Publish(msg.RoomID, map[string]interface{}{
			"type": "message.created",
			"payload": msg,
		})
	}
	return nil
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

func (u *chatUsecase) MarkAsRead(roomID string, userID string, lastReadMessageID string) error {
	err := u.repo.MarkAsRead(roomID, userID, lastReadMessageID)
	if err == nil && u.publisher != nil {
		u.publisher.Publish(roomID, map[string]interface{}{
			"type": "room.read",
			"payload": map[string]string{
				"room_id": roomID,
				"user_id": userID,
				"last_read_message_id": lastReadMessageID,
			},
		})
	}
	return err
}

func (u *chatUsecase) GetUnreadCount(roomID string, userID string) (int, error) {
	return u.repo.GetUnreadCount(roomID, userID)
}

func (u *chatUsecase) GetMessageReaders(roomID string, messageID string) ([]domain.User, error) {
	return u.repo.GetMessageReaders(roomID, messageID)
}

