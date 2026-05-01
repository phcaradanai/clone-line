ALTER TABLE messages
ADD COLUMN IF NOT EXISTS reply_to_message_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to_message_id
ON messages(reply_to_message_id);

CREATE TABLE IF NOT EXISTS room_read_states (
  room_id UUID NOT NULL,
  user_id UUID NOT NULL,
  last_read_message_id UUID NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_read_states_room_user
ON room_read_states(room_id, user_id);

CREATE INDEX IF NOT EXISTS idx_room_read_states_last_read_message
ON room_read_states(room_id, last_read_message_id);