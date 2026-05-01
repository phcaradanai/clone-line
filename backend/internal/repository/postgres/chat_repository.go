package postgres

import (
	"context"
	"log"
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
	query := `INSERT INTO messages (room_id, user_id, reply_to_message_id, content, type, file_url) 
	          VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`
	err := r.db.QueryRow(context.Background(), query, msg.RoomID, msg.UserID, msg.ReplyToMessageID, msg.Content, msg.Type, msg.FileURL).
		Scan(&msg.ID, &msg.CreatedAt)
	if err != nil {
		return err
	}

	return nil
}

func (r *chatRepository) GetMessage(messageID string) (*domain.Message, error) {
	query := `
		SELECT m.id, m.room_id, m.user_id, m.reply_to_message_id, m.content, m.type, m.file_url, m.created_at, u.display_name 
		FROM messages m 
		LEFT JOIN users u ON m.user_id = u.id
		WHERE m.id = $1`
	var m domain.Message
	var dName *string
	err := r.db.QueryRow(context.Background(), query, messageID).Scan(&m.ID, &m.RoomID, &m.UserID, &m.ReplyToMessageID, &m.Content, &m.Type, &m.FileURL, &m.CreatedAt, &dName)
	if err != nil {
		return nil, err
	}
	m.User = &domain.User{
		ID: m.UserID,
		DisplayName: COALESCE(dName, ""),
	}
	return &m, nil
}

func (r *chatRepository) GetMessages(roomID string, limit int, offset int) ([]domain.Message, error) {
	query := `
		SELECT id, room_id, user_id, reply_to_message_id, content, type, file_url, created_at, read_count, username, display_name, avatar_url,
		       replied_id, replied_content, replied_type, replied_file_url, replied_user_id, replied_user_name
		FROM (
			SELECT m.id, m.room_id, 
			       COALESCE(m.user_id::text, '') as user_id, 
			       m.reply_to_message_id,
			       COALESCE(m.content, '') as content, 
			       m.type, 
			       COALESCE(m.file_url, '') as file_url, 
			       m.created_at,
			       (SELECT COUNT(rm.user_id) 
			        FROM room_members rm 
			        JOIN room_read_states rrs ON rrs.room_id = rm.room_id AND rrs.user_id = rm.user_id
			        JOIN messages m_read ON rrs.last_read_message_id = m_read.id
			        WHERE rm.room_id = m.room_id 
			        AND rm.user_id != m.user_id 
			        AND m_read.created_at >= m.created_at) as read_count,
			       COALESCE(u.username, 'anonymous') as username, 
			       COALESCE(u.display_name, 'Unknown User') as display_name, 
			       COALESCE(u.avatar_url, '') as avatar_url,
			       replied.id as replied_id,
			       replied.content as replied_content,
			       replied.type as replied_type,
			       replied.file_url as replied_file_url,
			       replied.user_id as replied_user_id,
			       ru.display_name as replied_user_name
			FROM messages m
			LEFT JOIN users u ON m.user_id = u.id
			LEFT JOIN messages replied ON m.reply_to_message_id = replied.id
			LEFT JOIN users ru ON replied.user_id = ru.id
			WHERE m.room_id = $1
			ORDER BY m.created_at DESC
			LIMIT $2 OFFSET $3
		) sub
		ORDER BY created_at ASC, id ASC`
	
	rows, err := r.db.Query(context.Background(), query, roomID, limit, offset)
	if err != nil {
		log.Printf("[DATABASE] GetMessages Query Error | room_id: %s | error: %v", roomID, err)
		return nil, err
	}
	defer rows.Close()

	messages := []domain.Message{}
	for rows.Next() {
		var m domain.Message
		var u domain.User
		var rID, rContent, rType, rFileURL, rUserID, rUserName *string
		err := rows.Scan(&m.ID, &m.RoomID, &m.UserID, &m.ReplyToMessageID, &m.Content, &m.Type, &m.FileURL, &m.CreatedAt, &m.ReadCount,
			&u.Username, &u.DisplayName, &u.AvatarURL, &rID, &rContent, &rType, &rFileURL, &rUserID, &rUserName)
		if err != nil {
			log.Printf("[DATABASE] GetMessages Scan Error | room_id: %s | error: %v", roomID, err)
			return nil, err
		}
		u.ID = m.UserID
		m.User = &u
		
		if m.ReplyToMessageID != nil {
			if rID == nil {
				m.ReplyToMessage = &domain.Message{
					ID: *m.ReplyToMessageID,
					Content: "ข้อความนี้ถูกลบแล้ว",
					Type: "deleted",
					Preview: "ข้อความนี้ถูกลบแล้ว",
					IsDeleted: true,
				}
			} else {
				preview := ""
				if COALESCE(rType, "text") == "image" {
					preview = "รูปภาพ"
				} else if COALESCE(rType, "text") == "file" {
					preview = "ไฟล์แนบ"
				} else {
					preview = COALESCE(rContent, "")
				}

				m.ReplyToMessage = &domain.Message{
					ID: *rID,
					Content: COALESCE(rContent, ""),
					Type: COALESCE(rType, "text"),
					FileURL: COALESCE(rFileURL, ""),
					Preview: preview,
					User: &domain.User{
						ID: COALESCE(rUserID, ""),
						DisplayName: COALESCE(rUserName, ""),
					},
				}
			}
		}
		
		messages = append(messages, m)
	}
	return messages, nil
}

func (r *chatRepository) MarkAsRead(roomID string, userID string, lastReadMessageID string) error {
	log.Printf("[DB] mark read attempt | user: %s | room: %s | msg: %s", userID, roomID, lastReadMessageID)
	
	query := `
		INSERT INTO room_read_states (room_id, user_id, last_read_message_id, last_read_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (room_id, user_id) DO UPDATE SET 
			last_read_message_id = EXCLUDED.last_read_message_id,
			last_read_at = NOW()
		WHERE (
			SELECT created_at FROM messages WHERE id = EXCLUDED.last_read_message_id
		) > (
			SELECT created_at FROM messages WHERE id = room_read_states.last_read_message_id
		) OR room_read_states.last_read_message_id IS NULL;`
	
	result, err := r.db.Exec(context.Background(), query, roomID, userID, lastReadMessageID)
	if err != nil {
		return err
	}

	rowsAffected := result.RowsAffected()
	log.Printf("[DB] mark read success | rows_affected: %d", rowsAffected)
	
	return nil
}

func (r *chatRepository) GetMessageReaders(roomID string, messageID string) ([]domain.User, error) {
	query := `
		SELECT u.id, COALESCE(u.username, ''), COALESCE(u.display_name, ''), COALESCE(u.avatar_url, '')
		FROM room_members rm
		JOIN users u ON rm.user_id = u.id
		JOIN room_read_states rrs ON rrs.room_id = rm.room_id AND rrs.user_id = rm.user_id
		JOIN messages m_read ON rrs.last_read_message_id = m_read.id
		JOIN messages m ON m.id = $2
		WHERE rm.room_id = $1 
		AND rm.user_id != m.user_id
		AND m_read.created_at >= m.created_at`
	
	rows, err := r.db.Query(context.Background(), query, roomID, messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []domain.User{}
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

func (r *chatRepository) GetUnreadCount(roomID string, userID string) (int, error) {
	query := `SELECT COUNT(*) 
	          FROM messages m
	          JOIN room_members rm ON m.room_id = rm.room_id
	          LEFT JOIN room_read_states rrs ON rrs.room_id = rm.room_id AND rrs.user_id = rm.user_id
	          LEFT JOIN messages m_read ON m_read.id = rrs.last_read_message_id
	          WHERE rm.room_id = $1 AND rm.user_id = $2
	          AND (rrs.last_read_message_id IS NULL OR m.created_at > m_read.created_at)
	          AND m.user_id != $2`
	
	var count int
	err := r.db.QueryRow(context.Background(), query, roomID, userID).Scan(&count)
	return count, err
}

func (r *chatRepository) GetRooms(userID string) ([]domain.Room, error) {
	query := `SELECT r.id, COALESCE(r.name, ''), r.is_group, r.created_at, rrs.last_read_message_id, rrs.last_read_at,
	          (SELECT COUNT(*) FROM messages m LEFT JOIN messages m_read ON m_read.id = rrs.last_read_message_id WHERE m.room_id = r.id AND m.user_id != $1 AND (rrs.last_read_message_id IS NULL OR m.created_at > m_read.created_at)) as unread_count,
	          lm.id, COALESCE(lm.content, ''), lm.type, lm.created_at
	          FROM rooms r
	          JOIN room_members rm ON r.id = rm.room_id
	          LEFT JOIN room_read_states rrs ON rrs.room_id = rm.room_id AND rrs.user_id = rm.user_id
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
		log.Printf("[DATABASE] GetRooms Query Error | user_id: %s | error: %v", userID, err)
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
			log.Printf("[DATABASE] GetRooms Scan Error | user_id: %s | error: %v", userID, err)
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
