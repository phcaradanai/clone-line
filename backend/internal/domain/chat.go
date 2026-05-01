package domain

import (
	"time"
)

type User struct {
	ID          string    `json:"id"`
	Username    string    `json:"username"`
	DisplayName string    `json:"display_name"`
	AvatarURL   string    `json:"avatar_url"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Room struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	IsGroup   bool      `json:"is_group"`
	CreatedAt time.Time `json:"created_at"`
	Members   []User    `json:"members,omitempty"`
	UnreadCount int     `json:"unread_count"`
	LastMessage *Message `json:"last_message,omitempty"`
	LastReadMessageID *string `json:"last_read_message_id,omitempty"`
	LastReadAt *time.Time `json:"last_read_at,omitempty"`
}

type RoomReadState struct {
	RoomID            string    `json:"room_id"`
	UserID            string    `json:"user_id"`
	LastReadMessageID *string   `json:"last_read_message_id,omitempty"`
	LastReadAt        time.Time `json:"last_read_at"`
}
type Message struct {
	ID        string    `json:"id"`
	RoomID    string    `json:"room_id"`
	UserID    string    `json:"user_id"`
	ReplyToMessageID *string `json:"reply_to_message_id,omitempty"`
	Content   string    `json:"content"`
	Type      string    `json:"type"` // text, image, file
	FileURL   string    `json:"file_url,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	ReadCount int       `json:"read_count"`
	User      *User     `json:"user,omitempty"`
	ReplyToMessage *Message `json:"reply_to_message,omitempty"`
	Preview   string    `json:"preview,omitempty"`
	IsDeleted bool      `json:"is_deleted,omitempty"`
}

type EventPublisher interface {
	Publish(roomID string, event interface{})
}

type ChatRepository interface {
	SaveMessage(msg *Message) error
	GetMessages(roomID string, limit int, offset int) ([]Message, error)
	GetRooms(userID string) ([]Room, error)
	GetRoom(roomID string) (*Room, error)
	CreateRoom(room *Room, memberIDs []string) error
	RegisterUser(user *User) error
	MarkAsRead(roomID string, userID string, lastReadMessageID string) error
	GetUnreadCount(roomID string, userID string) (int, error)
	GetMessageReaders(roomID string, messageID string) ([]User, error)
	GetMessage(messageID string) (*Message, error)
}

type ValidationError struct {
	Message string
}

func (e ValidationError) Error() string {
	return e.Message
}
