-- 20260501_add_reply_and_read_states.sql

-- Ensure messages has fields needed by reply preview
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS reply_to_message_id UUID NULL;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS file_url TEXT;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS type VARCHAR(20);

UPDATE messages
SET type = 'text'
WHERE type IS NULL;

ALTER TABLE messages
ALTER COLUMN type SET DEFAULT 'text';

ALTER TABLE messages
ALTER COLUMN type SET NOT NULL;

-- Indexes for chat history and reply preview
CREATE INDEX IF NOT EXISTS idx_messages_room_created_at
ON messages(room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_reply_to_message_id
ON messages(reply_to_message_id);

CREATE INDEX IF NOT EXISTS idx_messages_user_id
ON messages(user_id);

-- Read states
CREATE TABLE IF NOT EXISTS room_read_states (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id UUID NULL REFERENCES messages(id) ON DELETE SET NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_read_states_user_id
ON room_read_states(user_id);

CREATE INDEX IF NOT EXISTS idx_room_read_states_last_read_message_id
ON room_read_states(last_read_message_id);