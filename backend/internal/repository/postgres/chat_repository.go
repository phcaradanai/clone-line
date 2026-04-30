package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/phcar/chat-app-backend/internal/domain"
)

type chatRepository struct {
	db *pgxpool.Pool
}

func NewChatRepository(db *pgxpool.Pool) domain.ChatRepository {
	return &chatRepository{db: db}
}

func (r *chatRepository) SaveMessage(msg *domain.Message) error {
	query := `INSERT INTO messages (room_id, user_id, content, type, file_url) 
	          VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`
	return r.db.QueryRow(context.Background(), query, msg.RoomID, msg.UserID, msg.Content, msg.Type, msg.FileURL).
		Scan(&msg.ID, &msg.CreatedAt)
}

func (r *chatRepository) GetMessages(roomID string, limit int, offset int) ([]domain.Message, error) {
	query := `SELECT m.id, m.room_id, m.user_id, m.content, m.type, m.file_url, m.created_at,
	          u.username, u.display_name, u.avatar_url
	          FROM messages m
	          LEFT JOIN users u ON m.user_id = u.id
	          WHERE m.room_id = $1
	          ORDER BY m.created_at DESC
	          LIMIT $2 OFFSET $3`
	
	rows, err := r.db.Query(context.Background(), query, roomID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []domain.Message
	for rows.Next() {
		var m domain.Message
		var u domain.User
		err := rows.Scan(&m.ID, &m.RoomID, &m.UserID, &m.Content, &m.Type, &m.FileURL, &m.CreatedAt,
			&u.Username, &u.DisplayName, &u.AvatarURL)
		if err != nil {
			return nil, err
		}
		u.ID = m.UserID
		m.User = &u
		messages = append(messages, m)
	}
	return messages, nil
}

func (r *chatRepository) GetRooms(userID string) ([]domain.Room, error) {
	query := `SELECT r.id, r.name, r.is_group, r.created_at
	          FROM rooms r
	          JOIN room_members rm ON r.id = rm.room_id
	          WHERE rm.user_id = $1
	          ORDER BY r.created_at DESC`
	
	rows, err := r.db.Query(context.Background(), query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rooms []domain.Room
	for rows.Next() {
		var rm domain.Room
		if err := rows.Scan(&rm.ID, &rm.Name, &rm.IsGroup, &rm.CreatedAt); err != nil {
			return nil, err
		}
		rooms = append(rooms, rm)
	}
	return rooms, nil
}

func (r *chatRepository) GetRoom(roomID string) (*domain.Room, error) {
	// Implementation omitted for brevity
	return nil, nil
}

func (r *chatRepository) CreateRoom(room *domain.Room, memberIDs []string) error {
	// Implementation omitted for brevity
	return nil
}

func (r *chatRepository) RegisterUser(user *domain.User) error {
	query := `INSERT INTO users (username, display_name) VALUES ($1, $2) RETURNING id, created_at`
	return r.db.QueryRow(context.Background(), query, user.Username, user.DisplayName).
		Scan(&user.ID, &user.CreatedAt)
}
