package postgres

import (
	"context"
	"time"

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
	query := `SELECT m.id, m.room_id, 
	          COALESCE(m.user_id::text, ''), 
	          COALESCE(m.content, ''), 
	          m.type, 
	          COALESCE(m.file_url, ''), 
	          m.created_at,
	          (SELECT COUNT(rm.user_id) 
	           FROM room_members rm 
	           JOIN messages m_read ON rm.last_read_message_id = m_read.id
	           WHERE rm.room_id = m.room_id 
	           AND rm.user_id != m.user_id 
	           AND m_read.created_at >= m.created_at) as read_count,
	          COALESCE(u.username, 'anonymous'), 
	          COALESCE(u.display_name, 'Unknown User'), 
	          COALESCE(u.avatar_url, '')
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

	messages := []domain.Message{}
	for rows.Next() {
		var m domain.Message
		var u domain.User
		err := rows.Scan(&m.ID, &m.RoomID, &m.UserID, &m.Content, &m.Type, &m.FileURL, &m.CreatedAt, &m.ReadCount,
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

func (r *chatRepository) MarkAsRead(roomID string, userID string, lastReadMessageID string) error {
	query := `UPDATE room_members 
	          SET last_read_message_id = $1, last_read_at = NOW() 
	          WHERE room_id = $2 AND user_id = $3`
	_, err := r.db.Exec(context.Background(), query, lastReadMessageID, roomID, userID)
	return err
}

func (r *chatRepository) GetUnreadCount(roomID string, userID string) (int, error) {
	query := `SELECT COUNT(*) 
	          FROM messages m
	          JOIN room_members rm ON m.room_id = rm.room_id
	          LEFT JOIN messages m_read ON m_read.id = rm.last_read_message_id
	          WHERE rm.room_id = $1 AND rm.user_id = $2
	          AND (rm.last_read_message_id IS NULL OR m.created_at > m_read.created_at)
	          AND m.user_id != $2`
	
	var count int
	err := r.db.QueryRow(context.Background(), query, roomID, userID).Scan(&count)
	return count, err
}

func (r *chatRepository) GetRooms(userID string) ([]domain.Room, error) {
	query := `SELECT r.id, COALESCE(r.name, ''), r.is_group, r.created_at, rm.last_read_message_id, rm.last_read_at,
	          (SELECT COUNT(*) FROM messages m 
	           LEFT JOIN messages m_read ON m_read.id = rm.last_read_message_id
	           WHERE m.room_id = r.id 
	           AND m.user_id != $1
	           AND (rm.last_read_message_id IS NULL OR m.created_at > m_read.created_at)) as unread_count,
	          lm.id, COALESCE(lm.content, ''), lm.type, lm.created_at
	          FROM rooms r
	          JOIN room_members rm ON r.id = rm.room_id
	          LEFT JOIN LATERAL (
	             SELECT id, content, type, created_at
	             FROM messages
	             WHERE room_id = r.id
	             ORDER BY created_at DESC
	             LIMIT 1
	          ) lm ON true
	          WHERE rm.user_id = $1
	          ORDER BY r.created_at DESC`
	
	rows, err := r.db.Query(context.Background(), query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	rooms := []domain.Room{}
	for rows.Next() {
		var rm domain.Room
		var lmID, lmContent, lmType *string
		var lmCreatedAt *time.Time
		var lastReadMessageID *string
		var lastReadAt *time.Time
		
		err := rows.Scan(
			&rm.ID, &rm.Name, &rm.IsGroup, &rm.CreatedAt, 
			&lastReadMessageID, &lastReadAt, &rm.UnreadCount, 
			&lmID, &lmContent, &lmType, &lmCreatedAt,
		)
		if err != nil {
			return nil, err
		}

		rm.LastReadMessageID = lastReadMessageID
		rm.LastReadAt = lastReadAt
		
		if lmID != nil {
			rm.LastMessage = &domain.Message{
				ID:        *lmID,
				Content:   COALESCE(lmContent, ""),
				Type:      COALESCE(lmType, "text"),
				CreatedAt: COALESCE_TIME(lmCreatedAt),
			}
		}
		
		rooms = append(rooms, rm)
	}
	return rooms, nil
}

func COALESCE(s *string, def string) string {
	if s == nil { return def }
	return *s
}

func COALESCE_TIME(t *time.Time) time.Time {
	if t == nil { return time.Time{} }
	return *t
}



func (r *chatRepository) GetRoom(roomID string) (*domain.Room, error) {
	query := `SELECT id, COALESCE(name, ''), is_group, created_at FROM rooms WHERE id = $1`
	var rm domain.Room
	err := r.db.QueryRow(context.Background(), query, roomID).Scan(&rm.ID, &rm.Name, &rm.IsGroup, &rm.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &rm, nil
}

func (r *chatRepository) CreateRoom(room *domain.Room, memberIDs []string) error {
	ctx := context.Background()
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	queryRoom := `INSERT INTO rooms (name, is_group) VALUES ($1, $2) RETURNING id, created_at`
	err = tx.QueryRow(ctx, queryRoom, room.Name, room.IsGroup).Scan(&room.ID, &room.CreatedAt)
	if err != nil {
		return err
	}

	queryMember := `INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)`
	for _, mID := range memberIDs {
		_, err = tx.Exec(ctx, queryMember, room.ID, mID)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}


func (r *chatRepository) RegisterUser(user *domain.User) error {
	query := `INSERT INTO users (username, display_name) VALUES ($1, $2) RETURNING id, created_at`
	return r.db.QueryRow(context.Background(), query, user.Username, user.DisplayName).
		Scan(&user.ID, &user.CreatedAt)
}

