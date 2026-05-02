-- 20260502_complete_read_and_delete.sql

-- 1. Update room_members to include read state and unread count
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS last_read_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0;

-- 2. Update messages to support soft delete
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delete_scope VARCHAR(20);

-- 3. Migrate data from room_read_states to room_members (optional but good for consistency)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'room_read_states') THEN
        UPDATE room_members rm
        SET last_read_message_id = rrs.last_read_message_id,
            last_read_at = rrs.last_read_at
        FROM room_read_states rrs
        WHERE rm.room_id = rrs.room_id AND rm.user_id = rrs.user_id;
        
        DROP TABLE room_read_states;
    END IF;
END $$;

-- 4. Add indexes
CREATE INDEX IF NOT EXISTS idx_room_members_unread ON room_members(room_id, user_id) WHERE unread_count > 0;
CREATE INDEX IF NOT EXISTS idx_messages_deleted_at ON messages(deleted_at) WHERE deleted_at IS NOT NULL;
