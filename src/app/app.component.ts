import { DatePipe } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, ElementRef, effect, inject, QueryList, signal, ViewChild, ViewChildren, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { User } from '@angular/fire/auth';
import { AdminUser, ChatConversation, ChatMessage, ChatService, ChatUserResult, GENERAL_CONVERSATION_ID, MediaAttachment, UserProfile } from './chat.service';
import { AdminPanelComponent } from './admin-panel.component';
import { AuthPanelComponent } from './auth-panel.component';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [DatePipe, AdminPanelComponent, AuthPanelComponent],
    encapsulation: ViewEncapsulation.None,
    templateUrl: './app.component.html',
    styleUrl: './app.component.css'
})
export class AppComponent implements AfterViewInit {
    private readonly chat = inject(ChatService);
    private readonly destroyRef = inject(DestroyRef);
    readonly messages = toSignal(this.chat.messages$, { initialValue: [] as ChatMessage[] });
    readonly attachmentUrls = signal<Record<string, string>>({});
  readonly conversations = signal<ChatConversation[]>([]);
  readonly selectedConversationId = signal(GENERAL_CONVERSATION_ID);
  readonly mobileConversationsOpen = signal(false);
  readonly userSearch = signal('');
  readonly searchResults = signal<ChatUserResult[]>([]);
  readonly searchingUsers = signal(false);
    readonly adminOpen = signal(false);
    @ViewChildren('messageRow', { read: ElementRef }) private messageRows!: QueryList<ElementRef<HTMLElement>>;
    readonly currentUser = signal<User | null>(null);
    readonly profile = signal<UserProfile | null>(null);
    readonly draft = signal('');
    readonly currentUserId = signal<string | null>(null);
    readonly connecting = signal(true);
    readonly sending = signal(false);
    readonly error = signal('');
    readonly saved = signal(false);
    readonly mediaFiles = signal<File[]>([]);
    readonly authLoading = signal(true);
    readonly authMode = signal<'login' | 'register'>('login');
    readonly accountFlow = signal(false);
    readonly authEmail = signal('');
    readonly authPassword = signal('');
    readonly authBusy = signal(false);
    readonly authError = signal('');
    readonly profileUsername = signal('');
    readonly profileFirstName = signal('');
    readonly profileLastName = signal('');
    readonly profileAge = signal('');
    readonly profileBio = signal('');
    readonly profileError = signal('');
    readonly profileBusy = signal(false);
    readonly photoFile = signal<File | null>(null);
    readonly photoPreview = signal('');
    private profileLoadGeneration = 0;
    private conversationRefreshGeneration = 0;
    private lastMessageId: string | null = null;
    private readonly requestedAttachments = new Set<string>();
    private destroyed = false;
    private mediaObserver: IntersectionObserver | null = null;
    private searchTimeout: ReturnType<typeof setTimeout> | null = null;
    private searchGeneration = 0;
    @ViewChild('messageStream') private messageStream?: ElementRef<HTMLDivElement>;

    constructor() {
      effect(() => {
        const latestMessageId = this.messages().at(-1)?.id ?? null;
        if (latestMessageId === this.lastMessageId) return;
        this.lastMessageId = latestMessageId;
        if (latestMessageId) this.scrollToBottom();
      });
      effect(onCleanup => {
        const uid = this.currentUser()?.uid;
        if (!uid) {
          this.conversations.set([]);
          return;
        }
        void this.refreshConversations(uid);
        const refreshTimer = setInterval(() => void this.refreshConversations(uid), 5000);
        onCleanup(() => clearInterval(refreshTimer));
      });
        this.chat.user$.pipe(takeUntilDestroyed()).subscribe(user => {
            void this.refreshUserState(user);
        });
      this.destroyRef.onDestroy(() => {
        this.destroyed = true;
        if (this.searchTimeout) clearTimeout(this.searchTimeout);
        this.mediaObserver?.disconnect();
        for (const url of Object.values(this.attachmentUrls())) URL.revokeObjectURL(url);
      });
    }

    ngAfterViewInit(): void {
      if (typeof IntersectionObserver === 'undefined') {
        for (const message of this.messages()) {
          for (const attachment of message.attachments ?? []) this.loadAttachment(attachment);
        }
        return;
      }

      this.mediaObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const messageId = entry.target.getAttribute('data-message-id');
          const message = this.messages().find(item => item.id === messageId);
          for (const attachment of message?.attachments ?? []) this.loadAttachment(attachment);
          this.mediaObserver?.unobserve(entry.target);
        }
      }, { root: this.messageStream?.nativeElement, rootMargin: '160px 0px' });

      const observeRows = (): void => {
        this.messageRows.forEach(row => this.mediaObserver?.observe(row.nativeElement));
      };
      observeRows();
      this.messageRows.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(observeRows);
    }

    private loadAttachment(attachment: MediaAttachment): void {
      if (this.requestedAttachments.has(attachment.id)) return;
      this.requestedAttachments.add(attachment.id);
      void this.chat.downloadMedia(attachment.url).then(blob => {
        if (this.destroyed) return;
        this.attachmentUrls.update(urls => ({ ...urls, [attachment.id]: URL.createObjectURL(blob) }));
      }).catch(() => {
        this.requestedAttachments.delete(attachment.id);
      });
    }

    private scrollToBottom(): void {
      requestAnimationFrame(() => {
        const stream = this.messageStream?.nativeElement;
        stream?.scrollTo({ top: stream.scrollHeight, behavior: 'smooth' });
      });
    }


    openAdminPanel(): void {
      if (this.profile()?.role !== 'admin') return;
      this.adminOpen.set(true);
    }

    closeAdminPanel(): void {
      this.adminOpen.set(false);
    }

    onAdminProfileUpdated(user: AdminUser): void {
      this.profile.update(profile => profile
        ? { ...profile, role: user.role, isActive: user.isActive }
        : profile);
      if (user.role !== 'admin' || !user.isActive) this.closeAdminPanel();
    }
    isMine(message: ChatMessage): boolean {
        return message.senderId === this.currentUserId();
    }

    activeConversation(): ChatConversation {
      return this.conversations().find(conversation => conversation.id === this.selectedConversationId())
          ?? { id: GENERAL_CONVERSATION_ID, kind: 'general', title: 'General', lastMessage: '' };
    }

    selectConversation(conversation: ChatConversation): void {
      if (this.currentUser()?.isAnonymous && conversation.kind === 'direct') {
        this.error.set('Crea una cuenta para acceder a conversaciones directas.');
        return;
      }
      this.selectedConversationId.set(conversation.id);
      this.chat.selectConversation(conversation.id);
      this.mobileConversationsOpen.set(false);
      this.error.set('');
      this.saved.set(false);
      this.lastMessageId = null;
      this.scrollToBottom();
    }

    onUserSearch(value: string): void {
      if (this.currentUser()?.isAnonymous) return;
      this.userSearch.set(value);
      this.searchResults.set([]);
      if (this.searchTimeout) clearTimeout(this.searchTimeout);
      const generation = ++this.searchGeneration;
      const query = value.trim().replace(/^@/, '');
      if (query.length < 2) {
        this.searchingUsers.set(false);
        return;
      }

      this.searchingUsers.set(true);
      this.searchTimeout = setTimeout(() => void this.searchForUsers(query, generation), 250);
    }

    private async searchForUsers(query: string, generation: number): Promise<void> {
      try {
        const results = await this.chat.searchUsers(query);
        if (generation === this.searchGeneration) this.searchResults.set(results);
      } catch (error: unknown) {
        if (generation === this.searchGeneration) {
          this.error.set(error instanceof Error ? error.message : 'No se pudieron buscar usuarios.');
        }
      } finally {
        if (generation === this.searchGeneration) this.searchingUsers.set(false);
      }
    }

    async startDirectConversation(username: string): Promise<void> {
      if (this.currentUser()?.isAnonymous) {
        this.error.set('Crea una cuenta para iniciar conversaciones directas.');
        return;
      }
      this.error.set('');
      try {
        const conversation = await this.chat.openDirectConversation(username);
        this.conversations.update(conversations => [
          conversation,
          ...conversations.filter(item => item.id !== conversation.id)
        ]);
        this.userSearch.set('');
        this.searchResults.set([]);
        this.selectConversation(conversation);
        const uid = this.currentUser()?.uid;
        if (uid) void this.refreshConversations(uid);
      } catch (error: unknown) {
        this.error.set(error instanceof Error ? error.message : 'No se pudo abrir la conversación.');
      }
    }

    private async refreshConversations(uid: string): Promise<void> {
      const generation = ++this.conversationRefreshGeneration;
      try {
        const conversations = await this.chat.listConversations();
        if (this.currentUser()?.uid !== uid || generation !== this.conversationRefreshGeneration) return;
        this.conversations.set(conversations);
        if (!conversations.some(conversation => conversation.id === this.selectedConversationId())) {
          const general = conversations.find(conversation => conversation.kind === 'general');
          if (general) this.selectConversation(general);
        }
      } catch (error: unknown) {
        if (this.currentUser()?.uid === uid && generation === this.conversationRefreshGeneration) {
          this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar las conversaciones.');
        }
      }
    }

    onDraftInput(value: string): void {
      this.draft.set(value);
      this.error.set('');
      this.saved.set(false);
    }

    selectMedia(event: Event): void {
      const input = event.target as HTMLInputElement;
      const selectedFiles = Array.from(input.files ?? []);
      input.value = '';
      if (!selectedFiles.length) return;

      const files = [...this.mediaFiles(), ...selectedFiles];
      if (files.length > 8) {
        this.error.set('Puedes adjuntar hasta 8 archivos por mensaje.');
        return;
      }
      if (files.some(file => ![
        'image/jpeg', 'image/png', 'image/webp',
        'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm'
      ].includes(file.type))) {
        this.error.set('Adjunta imágenes JPG, PNG o WebP, o audio MP3, M4A, OGG, WAV o WebM.');
        return;
      }
      if (files.some(file => file.size > 25 * 1024 * 1024)) {
        this.error.set('Cada archivo debe pesar como máximo 25 MB.');
        return;
      }

      this.mediaFiles.set(files);
      this.error.set('');
      this.saved.set(false);
    }

    removeMedia(index: number): void {
      this.mediaFiles.update(files => files.filter((_file, fileIndex) => fileIndex !== index));
      this.error.set('');
    }

    userInitial(): string {
      return this.profile()?.username.charAt(0).toUpperCase()
          ?? this.currentUser()?.email?.charAt(0).toUpperCase()
          ?? 'A';
    }

    switchAuthMode(): void {
      this.authMode.update(mode => mode === 'login' ? 'register' : 'login');
      this.authPassword.set('');
      this.authError.set('');
    }

    async submitAuth(event: Event): Promise<void> {
      event.preventDefault();
      if (this.authBusy()) return;

      this.authBusy.set(true);
      this.authError.set('');
      try {
        let user: User;
        if (this.authMode() === 'register') {
          user = await this.chat.registerWithEmail(this.authEmail(), this.authPassword());
        } else {
          user = await this.chat.signInWithEmail(this.authEmail(), this.authPassword());
        }
        await this.refreshUserState(user);
        this.authPassword.set('');
        this.accountFlow.set(false);
      } catch (error: unknown) {
        this.authError.set(this.authErrorMessage(error));
      } finally {
        this.authBusy.set(false);
      }
    }

    async continueAsGuest(): Promise<void> {
      if (this.authBusy()) return;
      this.authBusy.set(true);
      this.authError.set('');
      try {
        const user = await this.chat.ensureAnonymousUser();
        await this.refreshUserState(user);
      } catch (error: unknown) {
        this.authError.set(this.authErrorMessage(error));
      } finally {
        this.authBusy.set(false);
      }
    }

    handleSessionAction(): void {
      if (this.currentUser()?.isAnonymous) {
        this.authMode.set('register');
        this.authEmail.set('');
        this.authPassword.set('');
        this.authError.set('');
        this.accountFlow.set(true);
        return;
      }
      void this.logout();
    }

    closeAccountFlow(): void {
      this.accountFlow.set(false);
      this.authError.set('');
      this.authPassword.set('');
    }

    private async logout(): Promise<void> {
      this.authBusy.set(true);
      try {
        await this.chat.signOut();
        this.authMode.set('login');
        this.authEmail.set('');
        this.authPassword.set('');
      } catch (error: unknown) {
        this.error.set(this.firebaseErrorMessage(error, 'session'));
      } finally {
        this.authBusy.set(false);
      }
    }

    selectProfilePhoto(event: Event): void {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;

      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        this.profileError.set('Usa una imagen JPG, PNG o WebP de hasta 5 MB.');
        input.value = '';
        return;
      }

      const previousPreview = this.photoPreview();
      if (previousPreview) URL.revokeObjectURL(previousPreview);
      this.photoFile.set(file);
      this.photoPreview.set(URL.createObjectURL(file));
      this.profileError.set('');
    }

    async submitProfile(event: Event): Promise<void> {
      event.preventDefault();
      const user = this.currentUser();
      const photo = this.photoFile();
      if (!user || user.isAnonymous || this.profileBusy()) return;
      if (!photo) {
        this.profileError.set('Selecciona una foto de perfil para continuar.');
        return;
      }

      this.profileBusy.set(true);
      this.profileError.set('');
      try {
        const profile = await this.chat.saveProfile(user.uid, {
          username: this.profileUsername(),
          firstName: this.profileFirstName(),
          lastName: this.profileLastName(),
          age: Number(this.profileAge()),
          bio: this.profileBio()
        }, photo);
        this.profile.set(profile);
        const preview = this.photoPreview();
        if (preview) URL.revokeObjectURL(preview);
        this.photoPreview.set('');
        this.photoFile.set(null);
      } catch (error: unknown) {
        this.profileError.set(this.profileErrorMessage(error));
      } finally {
        this.profileBusy.set(false);
      }
    }

    private async refreshUserState(user: User | null): Promise<void> {
      const generation = ++this.profileLoadGeneration;
      this.currentUser.set(user);
      this.currentUserId.set(user?.uid ?? null);
      this.profile.set(null);
      this.profileError.set('');
      this.authLoading.set(true);
      this.connecting.set(true);

      if (!user || user.isAnonymous) {
        this.authLoading.set(false);
        this.connecting.set(false);
        return;
      }

      try {
        const profile = await this.chat.getProfile(user.uid);
        if (generation !== this.profileLoadGeneration) return;
        this.profile.set(profile);
      } catch (error: unknown) {
        if (generation !== this.profileLoadGeneration) return;
        this.profileError.set(this.profileErrorMessage(error));
      } finally {
        if (generation === this.profileLoadGeneration) {
          this.authLoading.set(false);
          this.connecting.set(false);
        }
      }
    }

    private profileErrorMessage(error: unknown): string {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : '';
      if (code === 'permission-denied') return 'La API o PostgreSQL rechazó el perfil. Revisa la sesión y la configuración local.';
      if (error instanceof Error && !code) return error.message;
      return `No se pudo guardar el perfil${code ? ` (${code})` : ''}. Revisa las reglas de Firebase.`;
    }

    private authErrorMessage(error: unknown): string {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : '';

      if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use') {
        return 'Ese correo ya tiene una cuenta. Inicia sesión con ella.';
      }
      if (code === 'auth/invalid-email') return 'El correo electrónico no es válido.';
      if (code === 'auth/weak-password') return 'La contraseña debe tener al menos 6 caracteres.';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        return 'Correo o contraseña incorrectos.';
      }
      if (code === 'auth/operation-not-allowed') {
        return 'Activa el proveedor Correo electrónico/Contraseña en Firebase Authentication.';
      }
      if (code === 'auth/too-many-requests') return 'Demasiados intentos. Espera un momento y vuelve a probar.';
      if (code === 'auth/network-request-failed') return 'No se pudo conectar con Firebase. Revisa la conexión.';
      if (error instanceof Error && !code) return error.message;
      return `No se pudo completar la autenticación${code ? ` (${code})` : ''}.`;
    }

    async sendMessage(event: Event): Promise<void> {
        event.preventDefault();
        const text = this.draft().trim();
      const files = this.mediaFiles();
      if ((!text && !files.length) || text.length > 1000 || this.sending()) return;

        this.sending.set(true);
        this.error.set('');
        try {
            const user = await this.chat.ensureAnonymousUser();
            this.currentUserId.set(user.uid);
        const uploadedMedia = await Promise.all(files.map(file => this.chat.uploadMedia(file)));
            const conversationId = this.selectedConversationId();
            const sentMessage = await this.chat.sendMessage(
              text, user.uid, this.profile(), uploadedMedia.map(media => media.id), conversationId
            );
            this.draft.set('');
        this.mediaFiles.set([]);
            this.saved.set(true);
            this.scrollToBottom();
            this.conversations.update(conversations => {
              const updated = conversations.map(conversation => conversation.id === conversationId
                ? {
                    ...conversation,
                    lastMessage: sentMessage.text || (uploadedMedia.length === 1 ? 'Archivo adjunto' : 'Archivos adjuntos'),
                    lastMessageAt: sentMessage.createdAt
                  }
                : conversation);
              return updated.sort((first, second) => {
                if (first.kind === 'general') return second.kind === 'general' ? 0 : -1;
                if (second.kind === 'general') return 1;
                return Date.parse(second.lastMessageAt ?? '') - Date.parse(first.lastMessageAt ?? '');
              });
            });
            void this.refreshConversations(user.uid);
        } catch (error: unknown) {
          this.error.set(this.firebaseErrorMessage(error, 'message'));
        } finally {
            this.sending.set(false);
        }
    }

      private firebaseErrorMessage(error: unknown, context: 'session' | 'message'): string {
        const code = typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : '';

        if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
          return 'El acceso anónimo está desactivado. Actívalo en Firebase Authentication.';
        }
        if (code === 'auth/unauthorized-domain') {
          return 'Este dominio no está autorizado en Firebase Authentication.';
        }
        if (code === 'permission-denied') {
          return 'La API local rechazó la operación. Comprueba la sesión y las reglas del backend.';
        }
        if (code === 'unavailable') {
          return 'PostgreSQL no está disponible. Comprueba que Docker y el API estén activos.';
        }
        if (code === 'auth/network-request-failed') {
          return 'No se pudo conectar con Firebase. Revisa la red y la configuración del proyecto.';
        }
        if (error instanceof Error && !code) return error.message;

        const operation = context === 'session' ? 'iniciar la sesión' : 'enviar el mensaje';
        return `No se pudo ${operation}${code ? ` (${code})` : ''}. Revisa la API local.`;
      }
}
