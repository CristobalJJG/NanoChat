import express from 'express';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { optionalFirebaseAuth, requireFirebaseAuth } from './auth.js';
import { initializeDatabase, pool } from './db.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const maxUploadSize = 25 * 1024 * 1024;
const generalConversationId = '00000000-0000-0000-0000-000000000001';
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedMediaTypes = new Set([
    ...imageTypes,
    'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm',
    'video/mp4', 'video/webm', 'application/pdf'
]);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadSize, files: 1 },
    fileFilter: (_request, file, callback) => {
        if (!allowedMediaTypes.has(file.mimetype)) {
            callback(Object.assign(new Error('El tipo MIME del archivo no está permitido.'), { status: 415 }));
            return;
        }
        callback(null, true);
    }
});
const profileUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_request, file, callback) => {
        if (!imageTypes.has(file.mimetype)) {
            callback(Object.assign(new Error('La foto debe ser JPG, PNG o WebP.'), { status: 415 }));
            return;
        }
        callback(null, true);
    }
});

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

async function ensureUser(request) {
    const result = await pool.query(
        `INSERT INTO app_users (firebase_uid, email, is_anonymous)
         VALUES ($1, $2, $3)
         ON CONFLICT (firebase_uid) DO UPDATE
         SET email = COALESCE(EXCLUDED.email, app_users.email),
             is_anonymous = EXCLUDED.is_anonymous
         RETURNING firebase_uid, is_active`,
        [request.authUser.uid, request.authUser.email, request.authUser.isAnonymous]
    );
    const user = result.rows[0];
    await pool.query(
        `INSERT INTO user_roles (firebase_uid, role_name)
         VALUES ($1, 'user') ON CONFLICT DO NOTHING`,
        [user.firebase_uid]
    );
    if (process.env.INITIAL_ADMIN_UID && user.firebase_uid === process.env.INITIAL_ADMIN_UID) {
        await pool.query(
            `INSERT INTO user_roles (firebase_uid, role_name)
             VALUES ($1, 'admin') ON CONFLICT DO NOTHING`,
            [user.firebase_uid]
        );
    }
    return user;
}

function withUser(handler) {
    return async (request, response, next) => {
        try {
            const user = await ensureUser(request);
            if (!user.is_active) return response.status(403).json({ error: 'La cuenta está desactivada.' });
            await handler(request, response, next);
        } catch (error) {
            next(error);
        }
    };
}

function withAdmin(handler) {
    return withUser(async (request, response, next) => {
        const result = await pool.query(
            `SELECT EXISTS (
                SELECT 1 FROM user_roles
                WHERE firebase_uid = $1 AND role_name = 'admin'
            ) AS is_admin`,
            [request.authUser.uid]
        );
        if (!result.rows[0].is_admin) {
            return response.status(403).json({ error: 'Se requieren permisos de administrador.' });
        }
        await handler(request, response, next);
    });
}

async function canAccessConversation(conversationId, uid, isAnonymous = false) {
    const result = await pool.query(
        `SELECT kind, participant_one_uid, participant_two_uid
         FROM conversations WHERE id = $1`,
        [conversationId]
    );
    const conversation = result.rows[0];
    return Boolean(conversation && (
        conversation.kind === 'general'
        || (!isAnonymous && (
            conversation.participant_one_uid === uid
            || conversation.participant_two_uid === uid
        ))
    ));
}

function profileResponse(row) {
    if (!row?.username) return null;
    return {
        uid: row.firebase_uid,
        email: row.email,
        username: row.username,
        firstName: row.first_name,
        lastName: row.last_name,
        displayName: row.display_name,
        age: row.age,
        photoURL: row.photo_media_id ? `/api/media/${row.photo_media_id}` : '',
        bio: row.bio,
        role: row.role ?? (row.is_admin ? 'admin' : 'user'),
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function validateFile(file, acceptedTypes = allowedMediaTypes) {
    if (!file?.buffer?.length) throw Object.assign(new Error('Selecciona un archivo.'), { status: 400 });
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !acceptedTypes.has(detected.mime)) {
        throw Object.assign(new Error('El formato real del archivo no está permitido.'), { status: 415 });
    }
    return detected.mime;
}

app.get('/api/health', async (_request, response) => {
    await pool.query('SELECT 1');
    response.json({ status: 'ok', database: 'connected' });
});

app.get('/api/me/profile', requireFirebaseAuth, withUser(async (request, response) => {
    const result = await pool.query(
        `SELECT app_users.*,
                EXISTS (SELECT 1 FROM user_roles WHERE firebase_uid = app_users.firebase_uid AND role_name = 'admin') AS is_admin
         FROM app_users WHERE firebase_uid = $1`,
        [request.authUser.uid]
    );
    const profile = profileResponse(result.rows[0]);
    if (!profile) return response.status(404).json({ error: 'Completa tu perfil para continuar.' });
    response.json(profile);
}));

app.put('/api/me/profile', requireFirebaseAuth, profileUpload.single('photo'), withUser(async (request, response) => {
    const { username, firstName, lastName, age, bio = '' } = request.body;
    const normalizedUsername = String(username ?? '').trim().toLowerCase();
    const normalizedFirstName = String(firstName ?? '').trim();
    const normalizedLastName = String(lastName ?? '').trim();
    const normalizedBio = String(bio).trim();
    const ageNumber = Number(age);

    if (!/^[a-z0-9_]{3,20}$/.test(normalizedUsername)) {
        return response.status(400).json({ error: 'El username debe tener 3-20 caracteres: letras, números o guion bajo.' });
    }
    if (!normalizedFirstName || normalizedFirstName.length > 60 || !normalizedLastName || normalizedLastName.length > 60) {
        return response.status(400).json({ error: 'Introduce nombres y apellidos de hasta 60 caracteres.' });
    }
    if (!Number.isInteger(ageNumber) || ageNumber < 1 || ageNumber > 120) {
        return response.status(400).json({ error: 'La edad debe ser un número entre 1 y 120.' });
    }
    if (normalizedBio.length > 160) return response.status(400).json({ error: 'La biografía no puede superar los 160 caracteres.' });
    if (!request.file || request.file.size > 5 * 1024 * 1024) {
        return response.status(400).json({ error: 'Selecciona una foto de hasta 5 MB.' });
    }

    const contentType = await validateFile(request.file, imageTypes);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const mediaResult = await client.query(
            `INSERT INTO media (owner_uid, content_type, original_name, file_size, content, visibility)
             VALUES ($1, $2, $3, $4, $5, 'public') RETURNING id`,
            [request.authUser.uid, contentType, request.file.originalname.slice(0, 255), request.file.size, request.file.buffer]
        );
        const displayName = `${normalizedFirstName} ${normalizedLastName}`;
        const userResult = await client.query(
            `UPDATE app_users
             SET username = $2, first_name = $3, last_name = $4, display_name = $5,
                 age = $6, bio = $7, photo_media_id = $8, updated_at = NOW()
             WHERE firebase_uid = $1
             RETURNING *`,
            [request.authUser.uid, normalizedUsername, normalizedFirstName, normalizedLastName,
                displayName, ageNumber, normalizedBio, mediaResult.rows[0].id]
        );
        if (!userResult.rowCount) throw new Error('No se encontró la cuenta autenticada.');
        await client.query('COMMIT');
        const profileResult = await client.query(
            `SELECT app_users.*,
                    EXISTS (SELECT 1 FROM user_roles WHERE firebase_uid = app_users.firebase_uid AND role_name = 'admin') AS is_admin
             FROM app_users WHERE firebase_uid = $1`,
            [request.authUser.uid]
        );
        response.status(201).json(profileResponse(profileResult.rows[0]));
    } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') {
            return response.status(409).json({ error: 'Ese nombre de usuario ya está en uso.' });
        }
        throw error;
    } finally {
        client.release();
    }
}));

app.get('/api/admin/users', requireFirebaseAuth, withAdmin(async (request, response) => {
    const search = String(request.query.search ?? '').trim();
    const result = await pool.query(
        `SELECT u.firebase_uid, u.email, u.username, u.first_name, u.last_name,
                u.display_name, u.bio, u.is_active, u.created_at,
                CASE WHEN EXISTS (
                    SELECT 1 FROM user_roles ur
                    WHERE ur.firebase_uid = u.firebase_uid AND ur.role_name = 'admin'
                ) THEN 'admin' ELSE 'user' END AS role
         FROM app_users u
         WHERE u.is_anonymous = FALSE
           AND ($1 = '' OR COALESCE(u.username, '') ILIKE $2
            OR COALESCE(u.display_name, '') ILIKE $2
            OR COALESCE(u.email, '') ILIKE $2)
         ORDER BY u.created_at DESC
         LIMIT 100`,
        [search, `%${search}%`]
    );
    response.json(result.rows.map(row => ({
        uid: row.firebase_uid,
        email: row.email,
        username: row.username,
        firstName: row.first_name,
        lastName: row.last_name,
        displayName: row.display_name,
        bio: row.bio,
        isActive: row.is_active,
        role: row.role,
        createdAt: row.created_at
    })));
}));

app.patch('/api/admin/users/:uid', requireFirebaseAuth, withAdmin(async (request, response) => {
    const targetUid = request.params.uid;
    const { role, isActive, profile } = request.body ?? {};
    if (role !== undefined && !['user', 'admin'].includes(role)) {
        return response.status(400).json({ error: 'El rol no es válido.' });
    }
    if (isActive !== undefined && typeof isActive !== 'boolean') {
        return response.status(400).json({ error: 'El estado de la cuenta no es válido.' });
    }

    let normalizedProfile;
    if (profile !== undefined) {
        const username = String(profile?.username ?? '').trim().toLowerCase();
        const firstName = String(profile?.firstName ?? '').trim();
        const lastName = String(profile?.lastName ?? '').trim();
        const bio = String(profile?.bio ?? '').trim();
        if (!/^[a-z0-9_]{3,20}$/.test(username)) {
            return response.status(400).json({ error: 'El username debe tener 3-20 caracteres: letras, números o guion bajo.' });
        }
        if (!firstName || firstName.length > 60 || !lastName || lastName.length > 60) {
            return response.status(400).json({ error: 'Nombres y apellidos son obligatorios y admiten hasta 60 caracteres.' });
        }
        if (bio.length > 160) return response.status(400).json({ error: 'La biografía no puede superar los 160 caracteres.' });
        normalizedProfile = { username, firstName, lastName, bio };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(73001, 104)');
        const targetResult = await client.query(
            `SELECT is_active, EXISTS (
                SELECT 1 FROM user_roles WHERE firebase_uid = $1 AND role_name = 'admin'
             ) AS is_admin
             FROM app_users WHERE firebase_uid = $1 FOR UPDATE`,
            [targetUid]
        );
        if (!targetResult.rowCount) {
            await client.query('ROLLBACK');
            return response.status(404).json({ error: 'No se encontró ese usuario.' });
        }

        const target = targetResult.rows[0];
        if (targetUid === request.authUser.uid && (role === 'user' || isActive === false)) {
            await client.query('ROLLBACK');
            return response.status(409).json({ error: 'No puedes quitarte el rol ni bloquear tu propia cuenta.' });
        }
        const bootstrapUid = process.env.INITIAL_ADMIN_UID;
        if (targetUid === bootstrapUid && (role === 'user' || isActive === false)) {
            await client.query('ROLLBACK');
            return response.status(409).json({ error: 'No puedes quitar el rol ni bloquear al administrador inicial.' });
        }

        const removingAdmin = target.is_admin && (role === 'user' || isActive === false);
        if (removingAdmin) {
            const countResult = await client.query(
                `SELECT COUNT(*)::int AS count
                 FROM app_users u
                 JOIN user_roles ur ON ur.firebase_uid = u.firebase_uid AND ur.role_name = 'admin'
                 WHERE u.is_active = TRUE`,
            );
            if (countResult.rows[0].count <= 1) {
                await client.query('ROLLBACK');
                return response.status(409).json({ error: 'Debe quedar al menos un administrador activo.' });
            }
        }

        if (isActive !== undefined) {
            await client.query('UPDATE app_users SET is_active = $2 WHERE firebase_uid = $1', [targetUid, isActive]);
        }
        if (role === 'admin') {
            await client.query(
                `INSERT INTO user_roles (firebase_uid, role_name, granted_by_uid)
                 VALUES ($1, 'admin', $2) ON CONFLICT DO NOTHING`,
                [targetUid, request.authUser.uid]
            );
        } else if (role === 'user') {
            await client.query(
                `DELETE FROM user_roles WHERE firebase_uid = $1 AND role_name = 'admin'`,
                [targetUid]
            );
        }
        if (normalizedProfile) {
            await client.query(
                `UPDATE app_users
                 SET username = $2, first_name = $3, last_name = $4,
                     display_name = $3 || ' ' || $4, bio = $5, updated_at = NOW()
                 WHERE firebase_uid = $1`,
                [targetUid, normalizedProfile.username, normalizedProfile.firstName,
                    normalizedProfile.lastName, normalizedProfile.bio]
            );
        }

        const updatedResult = await client.query(
            `SELECT u.firebase_uid, u.email, u.username, u.first_name, u.last_name,
                    u.display_name, u.bio, u.is_active, u.created_at,
                    CASE WHEN EXISTS (
                        SELECT 1 FROM user_roles ur
                        WHERE ur.firebase_uid = u.firebase_uid AND ur.role_name = 'admin'
                    ) THEN 'admin' ELSE 'user' END AS role
             FROM app_users u WHERE u.firebase_uid = $1`,
            [targetUid]
        );
        await client.query('COMMIT');
        const updated = updatedResult.rows[0];
        response.json({
            uid: updated.firebase_uid,
            email: updated.email,
            username: updated.username,
            firstName: updated.first_name,
            lastName: updated.last_name,
            displayName: updated.display_name,
            bio: updated.bio,
            isActive: updated.is_active,
            role: updated.role,
            createdAt: updated.created_at
        });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') {
            return response.status(409).json({ error: 'Ese username ya está en uso.' });
        }
        throw error;
    } finally {
        client.release();
    }
}));

app.get('/api/users', requireFirebaseAuth, withUser(async (request, response) => {
    if (request.authUser.isAnonymous) {
        return response.status(403).json({ error: 'Crea una cuenta para buscar usuarios e iniciar conversaciones directas.' });
    }
    const search = String(request.query.search ?? '').trim().replace(/^@/, '');
    if (search.length < 2) return response.json([]);

    const result = await pool.query(
        `SELECT username, display_name, photo_media_id
         FROM app_users
         WHERE firebase_uid <> $1 AND username IS NOT NULL
           AND (username ILIKE $2 OR display_name ILIKE $2)
         ORDER BY username
         LIMIT 20`,
        [request.authUser.uid, `%${search}%`]
    );
    response.json(result.rows.map(row => ({
        username: row.username,
        displayName: row.display_name,
        photoURL: row.photo_media_id ? `/api/media/${row.photo_media_id}` : null
    })));
}));

app.get('/api/conversations', requireFirebaseAuth, withUser(async (request, response) => {
    const result = await pool.query(
        `SELECT c.id, c.kind,
                CASE WHEN c.kind = 'general' THEN 'General' ELSE other.display_name END AS title,
                CASE WHEN c.kind = 'direct' THEN other.username END AS username,
                CASE WHEN c.kind = 'direct' AND other.photo_media_id IS NOT NULL
                     THEN '/api/media/' || other.photo_media_id::text END AS photo_url,
                latest.text AS last_message,
                latest.created_at AS last_message_at,
                COALESCE(unread.count, 0)::int AS unread_count
         FROM conversations c
         LEFT JOIN app_users other
           ON c.kind = 'direct'
          AND other.firebase_uid = CASE
              WHEN c.participant_one_uid = $1 THEN c.participant_two_uid
              ELSE c.participant_one_uid
          END
         LEFT JOIN LATERAL (
             SELECT text, created_at FROM messages
             WHERE conversation_id = c.id
             ORDER BY created_at DESC, id DESC LIMIT 1
         ) latest ON TRUE
         LEFT JOIN LATERAL (
             SELECT COUNT(*) AS count
             FROM messages unread_message
             WHERE c.kind = 'direct'
               AND unread_message.conversation_id = c.id
               AND unread_message.sender_uid <> $1
               AND unread_message.read_at IS NULL
         ) unread ON TRUE
         WHERE c.kind = 'general'
            OR ($2 = FALSE AND (
                c.participant_one_uid = $1
                OR c.participant_two_uid = $1
            ))
         ORDER BY (c.kind = 'general') DESC, latest.created_at DESC NULLS LAST`,
        [request.authUser.uid, request.authUser.isAnonymous]
    );
    response.json(result.rows.map(row => ({
        id: row.id,
        kind: row.kind,
        title: row.title ?? row.username ?? 'Usuario',
        username: row.username,
        photoURL: row.photo_url ?? null,
        lastMessage: row.last_message ?? '',
        lastMessageAt: row.last_message_at,
        unreadCount: row.unread_count
    })));
}));

app.post('/api/conversations/direct', requireFirebaseAuth, withUser(async (request, response) => {
    if (request.authUser.isAnonymous) {
        return response.status(403).json({ error: 'Crea una cuenta para iniciar conversaciones directas.' });
    }
    const username = String(request.body?.username ?? '').trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        return response.status(400).json({ error: 'Introduce un username válido.' });
    }

    const targetResult = await pool.query(
        `SELECT firebase_uid, username, display_name, photo_media_id
         FROM app_users WHERE username = $1`,
        [username]
    );
    const target = targetResult.rows[0];
    if (!target) return response.status(404).json({ error: 'No se encontró ese usuario.' });
    if (target.firebase_uid === request.authUser.uid) {
        return response.status(400).json({ error: 'No puedes iniciar una conversación contigo.' });
    }

    await pool.query(
        `INSERT INTO conversations (kind, participant_one_uid, participant_two_uid)
         VALUES ('direct', LEAST($1, $2), GREATEST($1, $2))
         ON CONFLICT (participant_one_uid, participant_two_uid) WHERE kind = 'direct' DO NOTHING`,
        [request.authUser.uid, target.firebase_uid]
    );
    const conversationResult = await pool.query(
        `SELECT id FROM conversations
         WHERE kind = 'direct'
           AND participant_one_uid = LEAST($1, $2)
           AND participant_two_uid = GREATEST($1, $2)`,
        [request.authUser.uid, target.firebase_uid]
    );
    const conversationId = conversationResult.rows[0].id;
    await pool.query(
        `INSERT INTO conversation_members (conversation_id, member_uid)
         VALUES ($1, $2), ($1, $3) ON CONFLICT DO NOTHING`,
        [conversationId, request.authUser.uid, target.firebase_uid]
    );
    response.status(200).json({
        id: conversationId,
        kind: 'direct',
        title: target.display_name ?? target.username,
        username: target.username,
        photoURL: target.photo_media_id ? `/api/media/${target.photo_media_id}` : null,
        lastMessage: '',
        lastMessageAt: null,
        unreadCount: 0
    });
}));

app.get('/api/messages', requireFirebaseAuth, withUser(async (request, response) => {
    const conversationId = typeof request.query.conversationId === 'string'
        ? request.query.conversationId
        : generalConversationId;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)) {
        return response.status(400).json({ error: 'La conversación no es válida.' });
    }
    if (!await canAccessConversation(conversationId, request.authUser.uid, request.authUser.isAnonymous)) {
        return response.status(404).json({ error: 'No se encontró esa conversación.' });
    }

    const result = await pool.query(
        `SELECT m.id, m.sender_uid, m.text, m.created_at, m.read_at,
                COALESCE(u.display_name, 'Invitado') AS sender_name,
                u.photo_media_id,
                COALESCE((
                    SELECT json_agg(json_build_object(
                        'id', a.id,
                        'url', '/api/media/' || a.id::text,
                        'contentType', a.content_type,
                        'fileName', a.original_name
                    ) ORDER BY ma.position)
                    FROM message_attachments ma
                    JOIN media a ON a.id = ma.media_id
                    WHERE ma.message_id = m.id
                ), '[]'::json) AS attachments
         FROM messages m
         JOIN app_users u ON u.firebase_uid = m.sender_uid
         JOIN conversations c ON c.id = m.conversation_id
            WHERE m.conversation_id = $1
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT 100`
           , [conversationId]
    );
    const lastFetchedMessageId = result.rows[0]?.id;
    if (lastFetchedMessageId) {
        await pool.query(
            `UPDATE messages
             SET read_at = NOW()
             WHERE conversation_id = $1
               AND sender_uid <> $2
               AND read_at IS NULL
               AND (created_at, id) <= (
                   SELECT created_at, id FROM messages WHERE id = $3
               )
               AND EXISTS (
                   SELECT 1 FROM conversations
                   WHERE id = $1 AND kind = 'direct'
               )`,
            [conversationId, request.authUser.uid, lastFetchedMessageId]
        );
        await pool.query(
            `INSERT INTO conversation_read_states (conversation_id, user_uid, last_read_message_id)
             SELECT $1, $2, $3
             WHERE EXISTS (
                 SELECT 1 FROM conversations
                 WHERE id = $1 AND kind = 'direct'
             )
             ON CONFLICT (conversation_id, user_uid) DO UPDATE
             SET last_read_message_id = EXCLUDED.last_read_message_id
             WHERE conversation_read_states.last_read_message_id IS NULL
                OR EXISTS (
                    SELECT 1
                    FROM messages new_message
                    JOIN messages old_message
                      ON old_message.id = conversation_read_states.last_read_message_id
                    WHERE new_message.id = EXCLUDED.last_read_message_id
                      AND (new_message.created_at, new_message.id)
                          > (old_message.created_at, old_message.id)
                )`,
            [conversationId, request.authUser.uid, lastFetchedMessageId]
        );
    }
    response.json(result.rows.reverse().map(row => ({
        id: row.id,
        senderId: row.sender_uid,
        senderName: row.sender_name,
        senderPhotoURL: row.photo_media_id ? `/api/media/${row.photo_media_id}` : null,
        text: row.text,
        createdAt: row.created_at,
        readAt: row.read_at,
        attachments: row.attachments
    })));
}));

app.post('/api/media', requireFirebaseAuth, upload.single('file'), withUser(async (request, response) => {
    const contentType = await validateFile(request.file);
    const result = await pool.query(
        `INSERT INTO media (owner_uid, content_type, original_name, file_size, content)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, content_type, original_name, file_size, created_at`,
        [request.authUser.uid, contentType, request.file.originalname.slice(0, 255), request.file.size, request.file.buffer]
    );
    const media = result.rows[0];
    response.status(201).json({
        id: media.id,
        url: `/api/media/${media.id}`,
        contentType: media.content_type,
        fileName: media.original_name,
        size: Number(media.file_size),
        createdAt: media.created_at
    });
}));

app.get('/api/media/:mediaId', optionalFirebaseAuth, async (request, response, next) => {
    try {
        if (request.authUser) {
            const activeResult = await pool.query(
                'SELECT is_active FROM app_users WHERE firebase_uid = $1',
                [request.authUser.uid]
            );
            if (!activeResult.rows[0]?.is_active) {
                return response.status(403).json({ error: 'La cuenta está desactivada.' });
            }
        }
        const result = await pool.query(
            `SELECT owner_uid, content_type, original_name, content, visibility
             FROM media WHERE id = $1`,
            [request.params.mediaId]
        );
        const media = result.rows[0];
        if (!media) return response.status(404).json({ error: 'Archivo no encontrado.' });
        if (media.visibility === 'private' && request.authUser?.uid !== media.owner_uid) {
            return response.status(403).json({ error: 'No tienes acceso a este archivo.' });
        }
        if (media.visibility === 'shared' && !request.authUser) {
            return response.status(401).json({ error: 'Inicia sesión para ver este archivo.' });
        }
        if (media.visibility === 'shared' && request.authUser?.uid !== media.owner_uid) {
            const accessResult = await pool.query(
                `SELECT EXISTS (
                    SELECT 1
                    FROM message_attachments ma
                    JOIN messages m ON m.id = ma.message_id
                    JOIN conversations c ON c.id = m.conversation_id
                    WHERE ma.media_id = $1
                      AND (c.kind = 'general' OR c.participant_one_uid = $2 OR c.participant_two_uid = $2)
                ) AS allowed`,
                [request.params.mediaId, request.authUser.uid]
            );
            if (!accessResult.rows[0].allowed) {
                return response.status(403).json({ error: 'No tienes acceso a este archivo.' });
            }
        }
        response.set({
            'Content-Type': media.content_type,
            'Content-Length': String(media.content.length),
            'Content-Disposition': `inline; filename="${media.original_name.replace(/["\\\r\n]/g, '_')}"`,
            'Cache-Control': media.visibility === 'public' ? 'public, max-age=3600' : 'private, no-store',
            'X-Content-Type-Options': 'nosniff'
        });
        response.send(media.content);
    } catch (error) {
        next(error);
    }
});

app.post('/api/messages', requireFirebaseAuth, withUser(async (request, response) => {
    const text = typeof request.body?.text === 'string' ? request.body.text.trim() : '';
    const mediaIds = Array.isArray(request.body?.mediaIds) ? request.body.mediaIds : [];
    const conversationId = typeof request.body?.conversationId === 'string'
        ? request.body.conversationId
        : generalConversationId;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)) {
        return response.status(400).json({ error: 'La conversación no es válida.' });
    }
    if (text.length > 1000) return response.status(400).json({ error: 'El mensaje no puede superar los 1000 caracteres.' });
    if (mediaIds.length > 8 || mediaIds.some(id => typeof id !== 'string')) {
        return response.status(400).json({ error: 'La lista de archivos adjuntos no es válida.' });
    }
    if (!text && !mediaIds.length) return response.status(400).json({ error: 'Escribe un mensaje o adjunta un archivo.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const conversationResult = await client.query(
            `SELECT kind, participant_one_uid, participant_two_uid
             FROM conversations WHERE id = $1 FOR SHARE`,
            [conversationId]
        );
        const conversation = conversationResult.rows[0];
        if (!conversation || (conversation.kind === 'direct'
            && conversation.participant_one_uid !== request.authUser.uid
            && conversation.participant_two_uid !== request.authUser.uid)) {
            await client.query('ROLLBACK');
            return response.status(404).json({ error: 'No se encontró esa conversación.' });
        }
        if (request.authUser.isAnonymous && conversation.kind === 'direct') {
            await client.query('ROLLBACK');
            return response.status(403).json({ error: 'Crea una cuenta para enviar mensajes directos.' });
        }
        if (mediaIds.length) {
            const ownedMedia = await client.query(
                'SELECT id FROM media WHERE id = ANY($1::uuid[]) AND owner_uid = $2 FOR UPDATE',
                [mediaIds, request.authUser.uid]
            );
            if (ownedMedia.rowCount !== new Set(mediaIds).size) {
                await client.query('ROLLBACK');
                return response.status(403).json({ error: 'Algún archivo adjunto no pertenece a tu cuenta.' });
            }
        }

        const messageResult = await client.query(
            `INSERT INTO messages (conversation_id, sender_uid, text) VALUES ($1, $2, $3)
             RETURNING id, sender_uid, text, created_at`,
            [conversationId, request.authUser.uid, text]
        );
        const message = messageResult.rows[0];
        for (const [position, mediaId] of [...new Set(mediaIds)].entries()) {
            await client.query(
                `INSERT INTO message_attachments (message_id, media_id, position) VALUES ($1, $2, $3)`,
                [message.id, mediaId, position]
            );
        }
        if (mediaIds.length) {
            await client.query("UPDATE media SET visibility = 'shared' WHERE id = ANY($1::uuid[])", [[...new Set(mediaIds)]]);
        }
        await client.query('COMMIT');
        response.status(201).json({
            id: message.id,
            senderId: message.sender_uid,
            text: message.text,
            createdAt: message.created_at
        });
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}));

app.use((error, _request, response, _next) => {
    if (error instanceof multer.MulterError) {
        const message = error.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo permitido.' : 'El archivo no es válido.';
        return response.status(413).json({ error: message });
    }
    if (error.status) return response.status(error.status).json({ error: error.message });
    console.error('Error de API:', error.message);
    response.status(500).json({ error: 'Error interno del servidor.' });
});

await initializeDatabase();
app.listen(port, '0.0.0.0', () => console.log(`API lista en el puerto ${port}.`));