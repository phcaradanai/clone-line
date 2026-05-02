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
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	query := `INSERT INTO messages (room_id, user_id, reply_to_message_id, content, type, file_url) 
	          VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`
	err = tx.QueryRow(ctx, query, msg.RoomID, msg.UserID, msg.ReplyToMessageID, msg.Content, msg.Type, msg.FileURL).
		Scan(&msg.ID, &msg.CreatedAt)
	if err != nil {
		return err
	}

	// Increment unread_count for all members except the sender
	updateUnread := `UPDATE room_members SET unread_count = unread_count + 1 
	                 WHERE room_id = $1 AND user_id != $2`
	_, err = tx.Exec(ctx, updateUnread, msg.RoomID, msg.UserID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *chatRepository) GetMessage(messageID string) (*domain.Message, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	query := `
		SELECT m.id, m.room_id, m.user_id, m.reply_to_message_id, m.content, m.type, m.file_url, m.created_at, 
		       u.display_name, m.deleted_at, m.deleted_by, m.delete_scope
		FROM messages m 
		LEFT JOIN users u ON m.user_id = u.id
		WHERE m.id = $1`
	var m domain.Message
	var dName *string
	err := r.db.QueryRow(ctx, query, messageID).Scan(
		&m.ID, &m.RoomID, &m.UserID, &m.ReplyToMessageID, &m.Content, &m.Type, &m.FileURL, &m.CreatedAt,
		&dName, &m.DeletedAt, &m.DeletedBy, &m.DeleteScope,
	)
	if err != nil {
		return nil, err
	}
	m.User = &domain.User{
		ID:          m.UserID,
		DisplayName: COALESCE(dName, ""),
	}
	return &m, nil
}

func (r *chatRepository) GetMessages(roomID string, limit int, offset int) ([]domain.Message, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := `
		SELECT id, room_id, user_id, reply_to_message_id, content, type, file_url, created_at, read_count, username, display_name, avatar_url,
		       replied_id, replied_content, replied_type, replied_file_url, replied_user_id, replied_user_name, replied_user_avatar,
		       deleted_at, deleted_by, delete_scope
		FROM (
			SELECT m.id, m.room_id, 
			       COALESCE(m.user_id::text, '') as user_id, 
			       m.reply_to_message_id,
			       COALESCE(m.content, '') as content, 
			       m.type, 
			       COALESCE(m.file_url, '') as file_url, 
			       m.created_at,
			       (SELECT COUNT(rm_r.user_id) 
			        FROM room_members rm_r 
			        JOIN messages m_read ON rm_r.last_read_message_id = m_read.id
			        WHERE rm_r.room_id = m.room_id 
			        AND rm_r.user_id != m.user_id 
			        AND m_read.created_at >= m.created_at) as read_count,
			       COALESCE(u.username, 'anonymous') as username, 
			       COALESCE(u.display_name, 'Unknown User') as display_name, 
			       COALESCE(u.avatar_url, '') as avatar_url,
			       replied.id as replied_id,
			       replied.content as replied_content,
			       replied.type as replied_type,
			       replied.file_url as replied_file_url,
			       replied.user_id as replied_user_id,
			       ru.display_name as replied_user_name,
			       ru.avatar_url as replied_user_avatar,
			       m.deleted_at, m.deleted_by, m.delete_scope
			FROM messages m
			LEFT JOIN users u ON m.user_id = u.id
			LEFT JOIN messages replied ON m.reply_to_message_id = replied.id
			LEFT JOIN users ru ON replied.user_id = ru.id
			WHERE m.room_id = $1
			ORDER BY m.created_at DESC
			LIMIT $2 OFFSET $3
		) sub
		ORDER BY created_at ASC, id ASC`

	rows, err := r.db.Query(ctx, query, roomID, limit, offset)
	if err != nil {
		log.Printf("[DATABASE] GetMessages Query Error | room_id: %s | error: %v", roomID, err)
		return nil, err
	}
	defer rows.Close()

	messages := []domain.Message{}
	for rows.Next() {
		var m domain.Message
		var u domain.User
		var rID, rContent, rType, rFileURL, rUserID, rUserName, rUserAvatar *string
		err := rows.Scan(&m.ID, &m.RoomID, &m.UserID, &m.ReplyToMessageID, &m.Content, &m.Type, &m.FileURL, &m.CreatedAt, &m.ReadCount,
			&u.Username, &u.DisplayName, &u.AvatarURL, &rID, &rContent, &rType, &rFileURL, &rUserID, &rUserName, &rUserAvatar,
			&m.DeletedAt, &m.DeletedBy, &m.DeleteScope)
		if err != nil {
			log.Printf("[DATABASE] GetMessages Scan Error | room_id: %s | error: %v", roomID, err)
			return nil, err
		}
		u.ID = m.UserID
		m.User = &u

		if m.DeletedAt != nil {
			m.IsDeleted = true
			m.Content = "ลบข้อความนี้แล้ว"
			m.Type = "deleted"
		}

		if m.ReplyToMessageID != nil {
			if rID == nil {
				m.ReplyToMessage = &domain.Message{
					ID:        *m.ReplyToMessageID,
					Content:   "ข้อความนี้ถูกลบแล้ว",
					Type:      "deleted",
					Preview:   "ข้อความนี้ถูกลบแล้ว",
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
					ID:      *rID,
					Content: COALESCE(rContent, ""),
					Type:    COALESCE(rType, "text"),
					FileURL: COALESCE(rFileURL, ""),
					Preview: preview,
					User: &domain.User{
						ID:          COALESCE(rUserID, ""),
						DisplayName: COALESCE(rUserName, ""),
						AvatarURL:   COALESCE(rUserAvatar, ""),
					},
				}
			}
		}

		messages = append(messages, m)
	}
	return messages, nil
}

func (r *chatRepository) MarkAsRead(roomID string, userID string, lastReadMessageID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	log.Printf("[DB] mark read attempt | user: %s | room: %s | msg: %s", userID, roomID, lastReadMessageID)

	query := `
		UPDATE room_members SET 
			last_read_message_id = $3,
			last_read_at = NOW(),
			unread_count = 0
		WHERE room_id = $1 AND user_id = $2
		AND (
			last_read_message_id IS NULL OR 
			(SELECT created_at FROM messages WHERE id = $3) > 
			(SELECT created_at FROM messages WHERE id = last_read_message_id)
		)`

	result, err := r.db.Exec(ctx, query, roomID, userID, lastReadMessageID)
	if err != nil {
		return err
	}

	rowsAffected := result.RowsAffected()
	log.Printf("[DB] mark read success | rows_affected: %d", rowsAffected)

	return nil
}

func (r *chatRepository) GetMessageReaders(roomID string, messageID string) ([]domain.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	query := `
		SELECT u.id, COALESCE(u.username, ''), COALESCE(u.display_name, ''), COALESCE(u.avatar_url, '')
		FROM room_members rm
		JOIN users u ON rm.user_id = u.id
		JOIN messages m_read ON rm.last_read_message_id = m_read.id
		JOIN messages m ON m.id = $2
		WHERE rm.room_id = $1 
		AND rm.user_id != m.user_id
		AND m_read.created_at >= m.created_at`

	rows, err := r.db.Query(ctx, query, roomID, messageID)
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
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	query := `SELECT unread_count FROM room_members WHERE room_id = $1 AND user_id = $2`

	var count int
	err := r.db.QueryRow(ctx, query, roomID, userID).Scan(&count)
	return count, err
}

func (r *chatRepository) GetRooms(userID string) ([]domain.Room, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := `SELECT r.id, COALESCE(r.name, ''), r.is_group, r.created_at, rm.last_read_message_id, rm.last_read_at, rm.unread_count,
	          lm.id, COALESCE(lm.content, ''), lm.type, lm.created_at, lm.deleted_at
	          FROM rooms r
	          JOIN room_members rm ON r.id = rm.room_id
	          LEFT JOIN LATERAL (
	             SELECT id, content, type, created_at, deleted_at
	             FROM messages
	             WHERE room_id = r.id
	             ORDER BY created_at DESC
	             LIMIT 1
	          ) lm ON true
	          WHERE rm.user_id = $1
	          ORDER BY COALESCE(lm.created_at, r.created_at) DESC`

	rows, err := r.db.Query(ctx, query, userID)
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

		var lmDeletedAt *time.Time
		err := rows.Scan(
			&rm.ID, &rm.Name, &rm.IsGroup, &rm.CreatedAt,
			&lastReadMessageID, &lastReadAt, &rm.UnreadCount,
			&lmID, &lmContent, &lmType, &lmCreatedAt, &lmDeletedAt,
		)
		if err != nil {
			log.Printf("[DATABASE] GetRooms Scan Error | user_id: %s | error: %v", userID, err)
			return nil, err
		}

		if lmDeletedAt != nil {
			lmContentStr := "ลบข้อความนี้แล้ว"
			lmContent = &lmContentStr
		}

		rm.LastReadMessageID = lastReadMessageID
		rm.LastReadAt = lastReadAt

		if lmID != nil {
			content := COALESCE(lmContent, "")
			rm.LastMessage = &domain.Message{
				ID:        *lmID,
				Content:   content,
				Type:      COALESCE(lmType, "text"),
				CreatedAt: COALESCE_TIME(lmCreatedAt),
			}
		}

		rooms = append(rooms, rm)
	}
	return rooms, nil
}

func COALESCE(s *string, def string) string {
	if s == nil {
		return def
	}
	return *s
}

func COALESCE_TIME(t *time.Time) time.Time {
	if t == nil {
		return time.Time{}
	}
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

func (r *chatRepository) DeleteMessage(messageID string, userID string, scope string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	query := `UPDATE messages SET deleted_at = NOW(), deleted_by = $2, delete_scope = $3 
	          WHERE id = $1 AND user_id = $2`
	_, err := r.db.Exec(ctx, query, messageID, userID, scope)
	return err
}

func (r *chatRepository) RegisterUser(user *domain.User) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	query := `INSERT INTO users (username, display_name) VALUES ($1, $2) RETURNING id, created_at`
	return r.db.QueryRow(ctx, query, user.Username, user.DisplayName).
		Scan(&user.ID, &user.CreatedAt)
}
