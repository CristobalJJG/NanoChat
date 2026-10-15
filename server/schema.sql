CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
    firebase_uid TEXT PRIMARY KEY,
    email TEXT,
    username VARCHAR(20) UNIQUE,
    first_name VARCHAR(60),
    last_name VARCHAR(60),
    display_name VARCHAR(120),
    age SMALLINT CHECK (
        age IS NULL
        OR age BETWEEN 1 AND 120
    ),
    bio VARCHAR(160) NOT NULL DEFAULT '',
    photo_media_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_anonymous BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        username IS NULL
        OR username ~ '^[a-z0-9_]{3,20}$'
    )
);

ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN;

UPDATE app_users
SET is_anonymous = (email IS NULL)
WHERE is_anonymous IS NULL;

ALTER TABLE app_users
    ALTER COLUMN is_anonymous SET DEFAULT TRUE,
    ALTER COLUMN is_anonymous SET NOT NULL;

CREATE TABLE IF NOT EXISTS roles (
    name TEXT PRIMARY KEY,
    description TEXT NOT NULL
);

INSERT INTO roles (name, description)
VALUES ('user', 'Usuario estándar'), ('admin', 'Administración de usuarios y permisos')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS user_roles (
    firebase_uid TEXT NOT NULL REFERENCES app_users (firebase_uid) ON DELETE CASCADE,
    role_name TEXT NOT NULL REFERENCES roles (name) ON DELETE CASCADE,
    granted_by_uid TEXT REFERENCES app_users (firebase_uid) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (firebase_uid, role_name)
);

CREATE INDEX IF NOT EXISTS user_roles_role_name_idx ON user_roles (role_name);

CREATE TABLE IF NOT EXISTS media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    owner_uid TEXT NOT NULL REFERENCES app_users (firebase_uid) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size BIGINT NOT NULL CHECK (
        file_size > 0
        AND file_size <= 26214400
    ),
    content BYTEA NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (
        visibility IN ('private', 'shared', 'public')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    kind TEXT NOT NULL CHECK (kind IN ('general', 'direct')),
    participant_one_uid TEXT REFERENCES app_users (firebase_uid) ON DELETE CASCADE,
    participant_two_uid TEXT REFERENCES app_users (firebase_uid) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (
            kind = 'general'
            AND participant_one_uid IS NULL
            AND participant_two_uid IS NULL
        )
        OR (
            kind = 'direct'
            AND participant_one_uid IS NOT NULL
            AND participant_two_uid IS NOT NULL
            AND participant_one_uid < participant_two_uid
        )
    )
);

INSERT INTO
    conversations (id, kind)
VALUES (
        '00000000-0000-0000-0000-000000000001',
        'general'
    ) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    member_uid TEXT NOT NULL REFERENCES app_users (firebase_uid) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, member_uid)
);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_direct_pair_idx ON conversations (
    participant_one_uid,
    participant_two_uid
)
WHERE
    kind = 'direct';

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    conversation_id UUID NOT NULL REFERENCES conversations (id),
    sender_uid TEXT NOT NULL REFERENCES app_users (firebase_uid) ON DELETE CASCADE,
    text VARCHAR(1000) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (length(text) <= 1000)
);

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations (id);

UPDATE messages
SET
    conversation_id = '00000000-0000-0000-0000-000000000001'
WHERE
    conversation_id IS NULL;

ALTER TABLE messages ALTER COLUMN conversation_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS message_attachments (
    message_id UUID NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES media (id) ON DELETE RESTRICT,
    position SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (message_id, media_id)
);

CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages (created_at DESC);

CREATE INDEX IF NOT EXISTS messages_sender_uid_idx ON messages (sender_uid);

CREATE INDEX IF NOT EXISTS messages_conversation_created_at_idx ON messages (
    conversation_id,
    created_at DESC
);

CREATE TABLE IF NOT EXISTS conversation_read_states (
    conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    user_uid TEXT NOT NULL REFERENCES app_users (firebase_uid) ON DELETE CASCADE,
    last_read_message_id UUID REFERENCES messages (id) ON DELETE SET NULL,
    PRIMARY KEY (conversation_id, user_uid)
);

INSERT INTO conversation_read_states (conversation_id, user_uid, last_read_message_id)
SELECT c.id, participant.user_uid, latest.id
FROM conversations c
CROSS JOIN LATERAL (
    VALUES (c.participant_one_uid), (c.participant_two_uid)
) AS participant (user_uid)
JOIN LATERAL (
    SELECT id
    FROM messages
    WHERE conversation_id = c.id
    ORDER BY created_at DESC, id DESC
    LIMIT 1
) latest ON TRUE
WHERE c.kind = 'direct'
ON CONFLICT (conversation_id, user_uid) DO NOTHING;

CREATE INDEX IF NOT EXISTS media_owner_uid_idx ON media (owner_uid);

CREATE INDEX IF NOT EXISTS message_attachments_media_id_idx ON message_attachments (media_id);