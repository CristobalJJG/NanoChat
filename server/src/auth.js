import { createRemoteJWKSet, jwtVerify } from 'jose';

const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if (!projectId) throw new Error('FIREBASE_PROJECT_ID es obligatorio para validar sesiones Firebase.');

const firebaseKeys = createRemoteJWKSet(new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
));

async function verifyToken(token) {
    const { payload } = await jwtVerify(token, firebaseKeys, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId
    });
    if (typeof payload.sub !== 'string' || !payload.sub) {
        throw new Error('El token no contiene un UID válido.');
    }

    return {
        uid: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : null,
        isAnonymous: payload.firebase?.sign_in_provider === 'anonymous'
    };
}

function readBearerToken(request) {
    const [scheme, token] = (request.get('authorization') ?? '').split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

export async function optionalFirebaseAuth(request, response, next) {
    const token = readBearerToken(request);
    if (!token) return next();

    try {
        request.authUser = await verifyToken(token);
        next();
    } catch {
        response.status(401).json({ error: 'La sesión de Firebase no es válida.' });
    }
}

export async function requireFirebaseAuth(request, response, next) {
    if (!readBearerToken(request)) {
        return response.status(401).json({ error: 'Inicia sesión para continuar.' });
    }
    return optionalFirebaseAuth(request, response, next);
}