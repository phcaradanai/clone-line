-- 1. Create Tables First
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100),
    is_group BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS room_members (
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_read_message_id UUID, -- No hard FK to allow message deletion placeholders
    last_read_at TIMESTAMPTZ,
    unread_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reply_to_message_id UUID, -- No hard FK constraint to allow deleted previews
    content TEXT,
    type VARCHAR(20) NOT NULL DEFAULT 'text',
    file_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    delete_scope TEXT
);

-- Ensure columns exist if table was already created
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS last_read_message_id UUID;
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0;

-- Ensure types and constraints are correct even if columns already existed
ALTER TABLE room_members ALTER COLUMN unread_count SET DEFAULT 0;
ALTER TABLE room_members ALTER COLUMN unread_count SET NOT NULL;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delete_scope TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id UUID;

-- Ensure types are correct
ALTER TABLE messages ALTER COLUMN deleted_at TYPE TIMESTAMPTZ;
ALTER TABLE messages ALTER COLUMN delete_scope TYPE TEXT;

-- 2. Table Cleanup
DROP TABLE IF EXISTS room_read_states;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_room_created_at ON messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_message_id ON messages(reply_to_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_deleted_at ON messages(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_room_members_unread ON room_members(room_id, user_id) WHERE unread_count > 0;
CREATE INDEX IF NOT EXISTS idx_room_members_last_read_at ON room_members(last_read_at);

-- 3. Essential Seed Data
-- Insert Default Room for testing
INSERT INTO rooms (id, name, is_group) 
VALUES ('00000000-0000-0000-0000-000000000002', 'General Chat', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Insert Default Users for testing
INSERT INTO users (id, username, display_name)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'TestUser1', 'Test User 1'),
    ('00000000-0000-0000-0000-000000000003', 'TestUser2', 'Test User 2')
ON CONFLICT (id) DO NOTHING;

-- Insert Room Members
INSERT INTO room_members (room_id, user_id)
VALUES 
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003')
ON CONFLICT (room_id, user_id) DO NOTHING;
