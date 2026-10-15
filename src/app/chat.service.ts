import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, Injector, runInInjectionContext } from '@angular/core';
import {
    Auth,
    authState,
    createUserWithEmailAndPassword,
    linkWithCredential,
    signInAnonymously,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    type User
} from '@angular/fire/auth';
import { EmailAuthProvider } from 'firebase/auth';
import { BehaviorSubject, combineLatest, concat, EMPTY, firstValueFrom, from, interval, map, Observable, of, startWith, switchMap, take, catchError } from 'rxjs';

export const GENERAL_CONVERSATION_ID = '00000000-0000-0000-0000-000000000001';

export interface ChatMessage {
    id: string;
    senderId: string;
    text: string;
    createdAt: string;
    readAt?: string | null;
    senderName?: string;
    senderPhotoURL?: string | null;
    attachments?: MediaAttachment[];
}

export interface MediaAttachment {
    id: string;
    url: string;
    contentType: string;
    fileName: string;
}

export interface UserProfile {
    uid: string;
    username: string;
    firstName: string;
    lastName: string;
    displayName: string;
    age: number;
    photoURL: string;
    bio: string;
    role?: 'user' | 'admin';
    isActive?: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface AdminUser {
    uid: string;
    email: string | null;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    bio: string;
    isActive: boolean;
    role: 'user' | 'admin';
    createdAt: string;
}

export interface UploadedMedia {
    id: string;
    url: string;
    contentType: string;
    fileName: string;
    size: number;
    createdAt: string;
}

export interface ChatConversation {
    id: string;
    kind: 'general' | 'direct';
    title: string;
    username?: string;
    photoURL?: string | null;
    lastMessage: string;
    lastMessageAt?: string | null;
    unreadCount: number;
}

export interface ChatUserResult {
    username: string;
    displayName: string;
    photoURL: string | null;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
    private readonly auth = inject(Auth);
    private readonly http = inject(HttpClient);
    private readonly injector = inject(Injector);
    private signInPromise: Promise<User> | null = null;
    private readonly selectedConversationId = new BehaviorSubject(GENERAL_CONVERSATION_ID);
    readonly user$ = authState(this.auth);

    readonly messages$: Observable<ChatMessage[]> = combineLatest([this.user$, this.selectedConversationId]).pipe(
        switchMap(([user, conversationId]) => {
            if (!user) return EMPTY;
            return concat(
                of([] as ChatMessage[]),
                interval(3000).pipe(
                    startWith(0),
                    switchMap(() => from(this.listMessages(user, conversationId)).pipe(catchError(() => of([]))))
                )
            );
        })
    );

    selectConversation(conversationId: string): void {
        this.selectedConversationId.next(conversationId);
    }

    async listConversations(): Promise<ChatConversation[]> {
        try {
            return await firstValueFrom(this.http.get<ChatConversation[]>('/api/conversations', {
                headers: await this.authHeaders()
            }));
        } catch (error) {
            throw this.toApiError(error);
        }
    }

    async searchUsers(search: string): Promise<ChatUserResult[]> {
        try {
            return await firstValueFrom(this.http.get<ChatUserResult[]>('/api/users', {
                headers: await this.authHeaders(),
                params: { search }
            }));
        } catch (error) {
            throw this.toApiError(error);
        }
    }

    async openDirectConversation(username: string): Promise<ChatConversation> {
        try {
            return await firstValueFrom(this.http.post<ChatConversation>('/api/conversations/direct', { username }, {
                headers: await this.authHeaders()
            }));
        } catch (error) {
            throw this.toApiError(error);
        }
    }

    async listAdminUsers(search = ''): Promise<AdminUser[]> {
        try {
            return await firstValueFrom(this.http.get<AdminUser[]>('/api/admin/users', {
                headers: await this.authHeaders(),
                params: { search }
            }));
        } catch (error) {
            throw this.toApiError(error);
        }
    }

    async updateAdminUser(uid: string, changes: {
        role?: 'user' | 'admin';
        isActive?: boolean;
        profile?: Pick<AdminUser, 'username' | 'firstName' | 'lastName' | 'bio'>;
    }): Promise<AdminUser> {
        try {
            return await firstValueFrom(this.http.patch<AdminUser>(`/api/admin/users/${encodeURIComponent(uid)}`, changes, {
                headers: await this.authHeaders()
            }));
        } catch (error) {
            throw this.toApiError(error);
        }
    }

    async ensureAnonymousUser(): Promise<User> {
        const user = this.auth.currentUser;
        if (user) return user;
        if (!this.signInPromise) {
            this.signInPromise = firstValueFrom(this.user$.pipe(take(1)))
                .then(async restoredUser => {
                    if (restoredUser) return restoredUser;
                    const credential = await runInInjectionContext(
                        this.injector,
                        () => signInAnonymously(this.auth)
                    );
                    return credential.user;
                })
                .finally(() => {
                    this.signInPromise = null;
                });
        }
        return this.signInPromise;
    }

    async registerWithEmail(email: string, password: string): Promise<User> {
        const normalizedEmail = email.trim();
        if (!normalizedEmail || password.length < 6) {
            throw new Error('Introduce un correo válido y una contraseña de al menos 6 caracteres.');
        }

        const currentUser = this.auth.currentUser;
        const credential = EmailAuthProvider.credential(normalizedEmail, password);
        const result = await runInInjectionContext(this.injector, () => currentUser?.isAnonymous
            ? linkWithCredential(currentUser, credential)
            : createUserWithEmailAndPassword(this.auth, normalizedEmail, password));
        return result.user;
    }

    async signInWithEmail(email: string, password: string): Promise<User> {
        const result = await runInInjectionContext(this.injector, () =>
            signInWithEmailAndPassword(this.auth, email.trim(), password)
        );
        return result.user;
    }

    async signOut(): Promise<void> {
        await runInInjectionContext(this.injector, () => firebaseSignOut(this.auth));
    }

    async getProfile(uid: string): Promise<UserProfile | null> {
        if (this.auth.currentUser?.uid !== uid) throw new Error('No puedes consultar el perfil de otra cuenta.');
        try {
            return await firstValueFrom(this.http.get<UserProfile>('/api/me/profile', {
                headers: await this.authHeaders()
            }));
        } catch (error) {
            if (error instanceof HttpErrorResponse && error.status === 404) return null;
            throw this.toApiError(error);
        }
    }

    async saveProfile(
        uid: string,
        profile: Omit<UserProfile, 'uid' | 'displayName' | 'photoURL' | 'createdAt' | 'updatedAt'>,
        photo: File
    ): Promise<UserProfile> {
        const username = profile.username.trim().toLowerCase();
        const firstName = profile.firstName.trim();
        const lastName = profile.lastName.trim();
        const bio = profile.bio.trim();

        if (!/^[a-z0-9_]{3,20}$/.test(username)) {
            throw new Error('El nombre de usuario debe tener 3-20 caracteres: letras, números o guion bajo.');
        }
        if (!firstName || firstName.length > 60 || !lastName || lastName.length > 60) {
            throw new Error('Introduce nombres y apellidos de hasta 60 caracteres.');
        }
        if (!Number.isInteger(profile.age) || profile.age < 1 || profile.age > 120) {
            throw new Error('La edad debe ser un número entre 1 y 120.');
        }
        if (bio.length > 160) throw new Error('La biografía no puede superar los 160 caracteres.');
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024) {
            throw new Error('Usa una imagen JPG, PNG o WebP de hasta 5 MB.');
        }

        if (this.auth.currentUser?.uid !== uid) throw new Error('No puedes modificar el perfil de otra cuenta.');
        const form = new FormData();
        form.set('username', username);
        form.set('firstName', firstName);
        form.set('lastName', lastName);
        form.set('age', String(profile.age));
        form.set('bio', bio);
        form.set('photo', photo);
        try {
            return await firstValueFrom(this.http.put<UserProfile>('/api/me/profile', form, {
                headers: await this.authHeaders()
            }));
        } catch (error) {
            throw this.toApiError(error);
        }
    }

    async uploadMedia(file: File): Promise<UploadedMedia> {
        const form = new FormData();
        form.set('file', file);
        try {
            return await firstValueFrom(this.http.post<UploadedMedia>('/api/media', form, {
                headers: await this.authHeaders()
            }));
        } catch (error) {
            throw this.toApiError(error);
        }
    }

    async downloadMedia(url: string): Promise<Blob> {
        try {
            return await firstValueFrom(this.http.get(url, {
                headers: await this.authHeaders(),
                responseType: 'blob'
            }));
        } catch (error) {
            throw this.toApiError(error);
        }
    }

    async sendMessage(
        text: string,
        senderId: string,
        _profile: UserProfile | null = null,
        mediaIds: string[] = [],
        conversationId = GENERAL_CONVERSATION_ID
    ): Promise<ChatMessage> {
        const normalizedText = text.trim();
        if (this.auth.currentUser?.uid !== senderId) throw new Error('La sesión ya no corresponde a este usuario.');
        if (normalizedText.length > 1000 || (!normalizedText && !mediaIds.length)) {
            throw new Error('Escribe un mensaje de hasta 1000 caracteres o adjunta un archivo.');
        }

        try {
            return await firstValueFrom(this.http.post<ChatMessage>('/api/messages', {
                text: normalizedText,
                mediaIds,
                conversationId
            }, { headers: await this.authHeaders() }));
        } catch (error) {
            throw this.toApiError(error);
        }
    }

    private async listMessages(user: User, conversationId: string): Promise<ChatMessage[]> {
        const token = await user.getIdToken();
        return firstValueFrom(this.http.get<ChatMessage[]>('/api/messages', {
            headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
            params: { conversationId }
        }));
    }

    private async authHeaders(): Promise<HttpHeaders> {
        const user = this.auth.currentUser;
        if (!user) throw new Error('Inicia sesión para continuar.');
        return new HttpHeaders({ Authorization: `Bearer ${await user.getIdToken()}` });
    }

    private toApiError(error: unknown): Error {
        if (error instanceof HttpErrorResponse) {
            const message = typeof error.error?.error === 'string'
                ? error.error.error
                : `La API respondió con estado ${error.status}.`;
            return Object.assign(new Error(message), { status: error.status });
        }
        return error instanceof Error ? error : new Error('Error de conexión con la API local.');
    }
}