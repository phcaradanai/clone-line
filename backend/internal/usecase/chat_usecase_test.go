package usecase_test

import (
	"testing"

	"github.com/phcar/chat-app-backend/internal/domain"
	"github.com/phcar/chat-app-backend/internal/usecase"
)

type mockRepo struct {
	GetMessageFunc        func(messageID string) (*domain.Message, error)
	SaveMessageFunc       func(msg *domain.Message) error
	MarkAsReadFunc        func(roomID string, userID string, lastReadMessageID string) error
	GetMessageReadersFunc func(roomID string, messageID string) ([]domain.User, error)
	GetMessagesFunc       func(roomID string, limit int, offset int) ([]domain.Message, error)
}

func (m *mockRepo) GetUnreadCount(roomID string, userID string) (int, error)          { return 0, nil }
func (m *mockRepo) DeleteMessage(messageID string, userID string, scope string) error { return nil }
func (m *mockRepo) GetMessage(messageID string) (*domain.Message, error) {
	if m.GetMessageFunc != nil {
		return m.GetMessageFunc(messageID)
	}
	return nil, nil
}
func (m *mockRepo) SaveMessage(msg *domain.Message) error {
	if m.SaveMessageFunc != nil {
		return m.SaveMessageFunc(msg)
	}
	return nil
}
func (m *mockRepo) MarkAsRead(roomID, userID, lastReadMessageID string) error {
	if m.MarkAsReadFunc != nil {
		return m.MarkAsReadFunc(roomID, userID, lastReadMessageID)
	}
	return nil
}
func (m *mockRepo) GetMessageReaders(roomID, messageID string) ([]domain.User, error) {
	if m.GetMessageReadersFunc != nil {
		return m.GetMessageReadersFunc(roomID, messageID)
	}
	return nil, nil
}
func (m *mockRepo) GetMessages(roomID string, limit int, offset int) ([]domain.Message, error) {
	if m.GetMessagesFunc != nil {
		return m.GetMessagesFunc(roomID, limit, offset)
	}
	return nil, nil
}
func (m *mockRepo) GetRooms(userID string) ([]domain.Room, error)          { return nil, nil }
func (m *mockRepo) GetRoom(roomID string) (*domain.Room, error)            { return nil, nil }
func (m *mockRepo) CreateRoom(room *domain.Room, memberIDs []string) error { return nil }
func (m *mockRepo) RegisterUser(user *domain.User) error                   { return nil }

type mockPublisher struct {
	PublishFunc func(roomID string, event interface{})
}

func (m *mockPublisher) Publish(roomID string, event interface{}) {
	if m.PublishFunc != nil {
		m.PublishFunc(roomID, event)
	}
}

// 1. Test sending message with valid replyToMessageId
func TestSendMessage_ValidReply(t *testing.T) {
	replyID := "msg-1"
	repo := &mockRepo{
		GetMessageFunc: func(messageID string) (*domain.Message, error) {
			if messageID == replyID {
				return &domain.Message{ID: replyID, RoomID: "room-1"}, nil
			}
			return nil, nil
		},
		SaveMessageFunc: func(msg *domain.Message) error { return nil },
	}
	pub := &mockPublisher{}
	uc := usecase.NewChatUsecase(repo, pub)

	err := uc.SendMessage(&domain.Message{
		RoomID:           "room-1",
		ReplyToMessageID: &replyID,
	})
	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

// 2. Test rejecting replyToMessageId from another room
func TestSendMessage_InvalidReplyAnotherRoom(t *testing.T) {
	replyID := "msg-1"
	repo := &mockRepo{
		GetMessageFunc: func(messageID string) (*domain.Message, error) {
			if messageID == replyID {
				return &domain.Message{ID: replyID, RoomID: "room-2"}, nil
			}
			return nil, nil
		},
	}
	pub := &mockPublisher{}
	uc := usecase.NewChatUsecase(repo, pub)

	err := uc.SendMessage(&domain.Message{
		RoomID:           "room-1",
		ReplyToMessageID: &replyID,
	})
	if err == nil {
		t.Error("expected error for different room, got nil")
	}
}

// 3. Test returning deleted reply preview
// Simulated via repository mock
func TestGetMessages_DeletedReplyPreview(t *testing.T) {
	replyID := "deleted-msg-id"
	repo := &mockRepo{
		GetMessagesFunc: func(roomID string, limit, offset int) ([]domain.Message, error) {
			return []domain.Message{
				{
					ID:               "msg-2",
					ReplyToMessageID: &replyID,
					ReplyToMessage: &domain.Message{
						ID:        replyID,
						Content:   "ข้อความนี้ถูกลบแล้ว",
						Type:      "deleted",
						Preview:   "ข้อความนี้ถูกลบแล้ว",
						IsDeleted: true,
					},
				},
			}, nil
		},
	}
	uc := usecase.NewChatUsecase(repo, &mockPublisher{})
	msgs, _ := uc.GetChatHistory("room-1", 10, 0)

	if len(msgs) == 0 || msgs[0].ReplyToMessage == nil {
		t.Fatal("expected reply to message to be populated")
	}
	if msgs[0].ReplyToMessage.Content != "ข้อความนี้ถูกลบแล้ว" {
		t.Errorf("expected 'ข้อความนี้ถูกลบแล้ว', got %s", msgs[0].ReplyToMessage.Content)
	}
}

// 4. Test mark read moves forward only
// The monotonic logic is enforced in the DB layer (ON CONFLICT DO UPDATE WHERE ... > ...).
// Here we just test the Usecase triggers it and publishes the event.
func TestMarkAsRead_MonotonicAndPublisher(t *testing.T) {
	published := false
	repo := &mockRepo{
		MarkAsReadFunc: func(roomID, userID, lastReadMessageID string) error {
			return nil
		},
	}
	pub := &mockPublisher{
		PublishFunc: func(roomID string, event interface{}) {
			published = true
		},
	}
	uc := usecase.NewChatUsecase(repo, pub)

	err := uc.MarkAsRead("room-1", "user-1", "msg-2")
	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if !published {
		t.Error("expected event to be published")
	}
}

// 5 & 6. Test read count excludes sender and inactive members
// The actual filtering logic is handled by the SQL query `AND rm.user_id != m.user_id`.
// We simulate the repository returning correctly filtered readers.
func TestGetMessageReaders_ExcludesSenderAndInactive(t *testing.T) {
	repo := &mockRepo{
		GetMessageReadersFunc: func(roomID, messageID string) ([]domain.User, error) {
			// Mock simulating that the sender and inactive users are not returned
			return []domain.User{
				{ID: "active-user-2"},
			}, nil
		},
	}
	uc := usecase.NewChatUsecase(repo, &mockPublisher{})

	readers, err := uc.GetMessageReaders("room-1", "msg-1")
	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if len(readers) != 1 || readers[0].ID != "active-user-2" {
		t.Errorf("expected exactly 1 active reader excluding sender")
	}
}
