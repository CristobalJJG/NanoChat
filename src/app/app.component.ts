import { DatePipe } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, ElementRef, effect, inject, QueryList, signal, ViewChild, ViewChildren } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { User } from '@angular/fire/auth';
import { AdminUser, ChatConversation, ChatMessage, ChatService, ChatUserResult, GENERAL_CONVERSATION_ID, MediaAttachment, UserProfile } from './chat.service';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [DatePipe],
    template: `
    <main class="workspace">
      @if (authLoading()) {
        <div class="auth-loading" role="status"><span class="status-dot status-dot-online"></span> Cargando sesión...</div>
      } @else if (!currentUser() || accountFlow()) {
        <section class="auth-screen" aria-labelledby="auth-title">
          <div class="auth-panel">
            @if (currentUser()) {
              <button class="auth-back" type="button" (click)="closeAccountFlow()">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 18-6-6 6-6M8 12h12" /></svg>
                Volver al chat
              </button>
            }
            <a class="auth-brand" href="#conversation" aria-label="Echo">
              <img src="https://lh3.googleusercontent.com/aida/AEtjO1WAQK8bUEtvgexkHFXyNxEmM0UarEUM1pbe5SDuYEJcKGHlzvBu5Goym3fpZi32TXFkNKEJDcJLCRpr9AH75YfUH0tCwmlXwMw6Xm18BsikXoazbb8VpB08GBmxDrQrGADuRqH0CIFakl90NIxjk7h8etQQ9pB4Ped2zy6rjLqFxEtiiPVldI8pcgG6pxbBxr1wfgxwJ8oDA03qIvuTlTleZByI7V1_HJy5pTDUgXo3fYLRdLtoTJ7r5bY" alt="" />
              <span>PULSE / ECHO</span>
            </a>
            <p class="eyebrow">MENSAJERÍA EN TIEMPO REAL</p>
            <h1 id="auth-title">{{ authMode() === 'register' ? 'Crea tu cuenta' : 'Inicia sesión' }}</h1>
            <p class="auth-description">{{ authMode() === 'register' ? 'Regístrate para conservar tu acceso.' : 'Accede a tus conversaciones.' }}</p>

            <form class="auth-form" (submit)="submitAuth($event)">
              <label class="auth-field">
                <span>Correo electrónico</span>
                <input
                  type="email"
                  autocomplete="email"
                  name="email"
                  placeholder="nombre@correo.com"
                  required
                  [value]="authEmail()"
                  (input)="authEmail.set($any($event.target).value)"
                />
              </label>
              <label class="auth-field">
                <span>Contraseña</span>
                <input
                  type="password"
                  [attr.autocomplete]="authMode() === 'register' ? 'new-password' : 'current-password'"
                  name="password"
                  placeholder="Mínimo 6 caracteres"
                  minlength="6"
                  required
                  [value]="authPassword()"
                  (input)="authPassword.set($any($event.target).value)"
                />
              </label>
              @if (authError()) {
                <p class="auth-error" role="alert">{{ authError() }}</p>
              }
              <button class="auth-submit" type="submit" [disabled]="authBusy()">
                {{ authBusy() ? 'Procesando...' : authMode() === 'register' ? 'Crear cuenta' : 'Iniciar sesión' }}
              </button>
            </form>

            <div class="auth-switch">
              <span>{{ authMode() === 'register' ? '¿Ya tienes cuenta?' : '¿Primera vez aquí?' }}</span>
              <button type="button" (click)="switchAuthMode()">{{ authMode() === 'register' ? 'Inicia sesión' : 'Regístrate' }}</button>
            </div>

            @if (!currentUser()) {
              <div class="auth-divider"><span>O</span></div>
              <button class="guest-submit" type="button" [disabled]="authBusy()" (click)="continueAsGuest()">Continuar como invitado</button>
            } @else {
              <p class="auth-note">Tu cuenta conservará esta sesión y sus mensajes.</p>
            }
          </div>
        </section>
      } @else if (currentUser()?.isAnonymous === false && !profile()) {
        <section class="auth-screen profile-screen" aria-labelledby="profile-title">
          <div class="auth-panel profile-panel">
            <a class="auth-brand" href="#conversation" aria-label="Echo">
              <img src="https://lh3.googleusercontent.com/aida/AEtjO1WAQK8bUEJcKGHlzvBu5Goym3fpZi32TXFkNKEJDcJLCRpr9AH75YfUH0tCwmlXwMw6Xm18BsikXoazbb8VpB08GBmxDrQrGADuRqH0CIFakl90NIxjk7h8etQQ9pB4Ped2zy6rjLqFxEtiiPVldI8pcgG6pxbBxr1wfgxwJ8oDA03qIvuTlTleZByI7V1_HJy5pTDUgXo3fYLRdLtoTJ7r5bY" alt="" />
              <span>PULSE / ECHO</span>
            </a>
            <p class="eyebrow">CONFIGURACIÓN DE CUENTA</p>
            <h1 id="profile-title">Completa tu perfil</h1>
            <p class="auth-description">Estos datos aparecerán en tu identidad de chat. Tu edad se mantiene privada.</p>

            <form class="profile-form" (submit)="submitProfile($event)">
              <div class="profile-photo-row">
                @if (photoPreview()) {
                  <img class="profile-photo-preview" [src]="photoPreview()" alt="Vista previa de la foto de perfil" />
                } @else {
                  <span class="profile-photo-placeholder" aria-hidden="true">{{ userInitial() }}</span>
                }
                <label class="photo-picker">
                  <input class="photo-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Foto de perfil" (change)="selectProfilePhoto($event)" />
                  <span class="eyebrow">FOTO DE PERFIL</span>
                  <strong>{{ photoFile() ? photoFile()?.name : 'Elige una imagen' }}</strong>
                  <small>JPG, PNG o WebP · máximo 5 MB</small>
                </label>
              </div>

              <label class="auth-field">
                <span>Nombre de usuario</span>
                <input type="text" name="username" autocomplete="username" placeholder="ej. maria_27" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" required [value]="profileUsername()" (input)="profileUsername.set($any($event.target).value)" />
                <small class="field-hint">Único; 3-20 letras, números o guion bajo.</small>
              </label>
              <div class="profile-name-row">
                <label class="auth-field">
                  <span>Nombres</span>
                  <input type="text" name="firstName" autocomplete="given-name" maxlength="60" required [value]="profileFirstName()" (input)="profileFirstName.set($any($event.target).value)" />
                </label>
                <label class="auth-field">
                  <span>Apellidos</span>
                  <input type="text" name="lastName" autocomplete="family-name" maxlength="60" required [value]="profileLastName()" (input)="profileLastName.set($any($event.target).value)" />
                </label>
              </div>
              <label class="auth-field age-field">
                <span>Edad</span>
                <input type="number" name="age" min="1" max="120" step="1" inputmode="numeric" required [value]="profileAge()" (input)="profileAge.set($any($event.target).value)" />
              </label>
              <label class="auth-field">
                <span>Acerca de ti <small>(opcional)</small></span>
                <textarea name="bio" maxlength="160" rows="3" placeholder="Una breve presentación" [value]="profileBio()" (input)="profileBio.set($any($event.target).value)"></textarea>
                <small class="field-hint field-count">{{ profileBio().length }}/160</small>
              </label>
              @if (profileError()) {
                <p class="auth-error" role="alert">{{ profileError() }}</p>
              }
              <button class="auth-submit" type="submit" [disabled]="profileBusy()">
                {{ profileBusy() ? 'Guardando perfil...' : 'Guardar y entrar al chat' }}
              </button>
            </form>
            <p class="auth-note">El nombre, username y foto se comparten en el chat. Nombres completos y edad solo son visibles para ti.</p>
          </div>
        </section>
      } @else {
      <aside class="utility-rail" aria-label="Navegación principal">
        <a class="brand-link" href="#conversation" aria-label="Echo, ir al chat">
          <img src="https://lh3.googleusercontent.com/aida/AEtjO1WAQK8bUEtvgexkHFXyNxEmM0UarEUM1pbe5SDuYEJcKGHlzvBu5Goym3fpZi32TXFkNKEJDcJLCRpr9AH75YfUH0tCwmlXwMw6Xm18BsikXoazbb8VpB08GBmxDrQrGADuRqH0CIFakl90NIxjk7h8etQQ9pB4Ped2zy6rjLqFxEtiiPVldI8pcgG6pxbBxr1wfgxwJ8oDA03qIvuTlTleZByI7V1_HJy5pTDUgXo3fYLRdLtoTJ7r5bY" alt="" />
        </a>
        <nav class="rail-navigation" aria-label="Vistas">
          <a class="rail-link rail-link-active" href="#conversation" aria-label="Chats" aria-current="page" title="Chats">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-2 2v-7.5A7.5 7.5 0 1 1 20 11.5Z" /><path d="M8 11h.01M12 11h.01M16 11h.01" /></svg>
          </a>
        </nav>
        <div class="rail-bottom"><span class="guest-avatar" [attr.aria-label]="currentUser()?.email ?? 'Sesión anónima'">{{ userInitial() }}</span></div>
      </aside>

      <aside class="conversation-sidebar" [class.mobile-conversations-open]="mobileConversationsOpen()" aria-label="Lista de conversaciones" [attr.role]="mobileConversationsOpen() ? 'dialog' : null" [attr.aria-modal]="mobileConversationsOpen() ? 'true' : null">
        <header class="sidebar-header">
          <div>
            <p class="eyebrow">PULSE / ECHO</p>
            <h2>Mensajes</h2>
          </div>
          <div class="sidebar-header-actions">
            <span class="sidebar-count">{{ conversations().length }}</span>
            <button class="mobile-close-conversations" type="button" aria-label="Cerrar conversaciones" (click)="mobileConversationsOpen.set(false)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </header>
        <div class="sidebar-section-label"><span>CONVERSACIONES</span><span>{{ conversations().length }}</span></div>
        <label class="user-search">
          <span class="visually-hidden">Buscar usuarios</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.5 15.5 4.2 4.2" /></svg>
          <input type="search" placeholder="Buscar por username" autocomplete="off" [value]="userSearch()" (input)="onUserSearch($any($event.target).value)" />
        </label>
        @if (searchingUsers()) {
          <p class="search-status">Buscando...</p>
        } @else if (userSearch().trim().length >= 2 && searchResults().length === 0) {
          <p class="search-status">No se encontraron usuarios.</p>
        }
        @if (searchResults().length) {
          <div class="user-search-results" aria-label="Resultados de búsqueda">
            @for (user of searchResults(); track user.username) {
              <button class="user-result" type="button" (click)="startDirectConversation(user.username)">
                @if (user.photoURL) {
                  <img class="conversation-avatar" [src]="user.photoURL" [alt]="''" />
                } @else {
                  <span class="conversation-avatar" aria-hidden="true">{{ user.displayName.charAt(0).toUpperCase() }}</span>
                }
                <span class="conversation-copy"><strong>{{ user.displayName }}</strong><small>@{{ user.username }}</small></span>
              </button>
            }
          </div>
        }
        <div class="sidebar-section-label sidebar-section-conversations"><span>RECIENTES</span></div>
        @for (conversation of conversations(); track conversation.id) {
          <a class="conversation-item" href="#conversation" [class.conversation-item-active]="conversation.id === selectedConversationId()" [attr.aria-current]="conversation.id === selectedConversationId() ? 'page' : null" (click)="selectConversation(conversation)">
            @if (conversation.photoURL) {
              <img class="conversation-avatar" [src]="conversation.photoURL" [alt]="''" />
            } @else {
              <span class="conversation-avatar" aria-hidden="true">{{ conversation.title.charAt(0).toUpperCase() }}</span>
            }
            <span class="conversation-copy">
              <span class="conversation-title"><strong>{{ conversation.title }}</strong><span>{{ conversation.kind === 'direct' ? '@' + conversation.username : messages().length }}</span></span>
              <span class="conversation-preview">{{ conversation.lastMessage || (conversation.kind === 'general' ? 'La conversación comienza aquí' : 'Inicia la conversación') }}</span>
            </span>
            @if (conversation.kind === 'general') {
              <span class="conversation-live" aria-label="Canal general"></span>
            }
          </a>
        }
        <div class="sidebar-bottom">
          <span class="live-indicator"></span>
          <span>{{ connecting() ? 'Conectando' : error() ? 'Sin conexión' : 'En línea' }}</span>
        </div>
      </aside>
      @if (mobileConversationsOpen()) {
        <button class="mobile-conversations-backdrop" type="button" aria-label="Cerrar conversaciones" (click)="mobileConversationsOpen.set(false)"></button>
      }

      <section id="conversation" class="thread" [attr.aria-label]="'Conversación con ' + activeConversation().title">
        <header class="thread-header">
          <button class="mobile-chats-action" type="button" aria-label="Abrir conversaciones" title="Abrir conversaciones" (click)="mobileConversationsOpen.set(true)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-2 2v-7.5A7.5 7.5 0 1 1 20 11.5Z" /><path d="M8 11h.01M12 11h.01M16 11h.01" /></svg>
          </button>
          <div class="thread-heading">
            <span class="thread-avatar" aria-hidden="true">{{ activeConversation().title.charAt(0).toUpperCase() }}</span>
            <div>
              <p class="eyebrow">{{ activeConversation().kind === 'general' ? 'CONVERSACIÓN GLOBAL' : '@' + activeConversation().username }}</p>
              <h1>{{ activeConversation().title }}</h1>
            </div>
          </div>
          <div class="thread-status">
            <span class="status-dot" [class.status-dot-online]="!connecting() && !error()"></span>
            <span>{{ connecting() ? 'Conectando' : error() ? 'Sin conexión' : 'En vivo' }}</span>
          </div>
          <div class="thread-count"><span>{{ messages().length }}</span> MENSAJES</div>
          @if (profile()?.role === 'admin') {
            <button class="admin-open-action" type="button" (click)="openAdminPanel()" aria-label="Administrar usuarios" title="Administrar usuarios">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></svg>
              <span>Admin</span>
            </button>
          }
          <button class="session-action" type="button" (click)="handleSessionAction()" [disabled]="authBusy()" [attr.aria-label]="currentUser()?.isAnonymous ? 'Crear cuenta' : 'Cerrar sesión'" [title]="currentUser()?.isAnonymous ? 'Crear cuenta' : 'Cerrar sesión'">
            @if (currentUser()?.isAnonymous) {
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6" /></svg>
              <span>Crear cuenta</span>
            } @else {
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3M21 3v18" /></svg>
              <span>Salir</span>
            }
          </button>
        </header>

        <div #messageStream class="message-stream" aria-live="polite" aria-relevant="additions text">
          @if (messages().length === 0 && !connecting()) {
            <div class="empty-state">
              <span class="empty-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M4 12h3l2-6 4 12 2-6h5" /></svg>
              </span>
              <p>Sin mensajes todavía</p>
              <span>El canal está abierto.</span>
            </div>
          }
          @for (message of messages(); track message.id) {
            <article #messageRow class="message-row" [attr.data-message-id]="message.id" [class.message-row-mine]="isMine(message)">
              <div class="message-content">
                <div class="message-meta">
                  @if (message.senderPhotoURL) {
                    <img class="message-avatar" [src]="message.senderPhotoURL" [alt]="'Foto de ' + (message.senderName ?? 'usuario')" />
                  } @else {
                    <span class="message-avatar-placeholder" aria-hidden="true">{{ (message.senderName ?? 'I').charAt(0).toUpperCase() }}</span>
                  }
                  <span>{{ isMine(message) ? 'Tú' : message.senderName ?? 'Invitado' }}</span>
                  <time>{{ message.createdAt | date:'HH:mm' }}</time>
                </div>
                @if (message.text) {
                  <p class="message-bubble">{{ message.text }}</p>
                }
                @if (message.attachments?.length) {
                  <div class="message-attachments">
                    @for (attachment of message.attachments; track attachment.id) {
                      @if (attachment.contentType.startsWith('image/')) {
                        @if (attachmentUrls()[attachment.id]; as mediaUrl) {
                          <img class="message-image" [src]="mediaUrl" [alt]="attachment.fileName" loading="lazy" />
                        } @else {
                          <span class="media-loading">Cargando {{ attachment.fileName }}...</span>
                        }
                      } @else if (attachment.contentType.startsWith('audio/')) {
                        <div class="message-audio">
                          <span>{{ attachment.fileName }}</span>
                          @if (attachmentUrls()[attachment.id]; as mediaUrl) {
                            <audio controls preload="metadata">
                              <source [src]="mediaUrl" [type]="attachment.contentType" />
                            </audio>
                          } @else {
                            <span class="media-loading">Cargando audio...</span>
                          }
                        </div>
                      }
                    }
                  </div>
                }
              </div>
            </article>
          }
        </div>

        <form class="composer" (submit)="sendMessage($event)">
          @if (error()) {
            <p class="error-message" role="alert">{{ error() }}</p>
          }
          @if (saved()) {
            <p class="success-message" role="status">Mensaje guardado en PostgreSQL.</p>
          }
          @if (mediaFiles().length) {
            <div class="attachment-picks" aria-label="Archivos adjuntos seleccionados">
              @for (file of mediaFiles(); track $index) {
                <div class="attachment-pick">
                  <span>{{ file.name }}</span>
                  <button class="remove-attachment" type="button" [attr.aria-label]="'Quitar ' + file.name" (click)="removeMedia($index)">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                </div>
              }
            </div>
          }
          <div class="composer-row">
            <label class="composer-attach" title="Adjuntar imagen o audio">
              <input class="attachment-input" type="file" accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm" multiple aria-label="Adjuntar imágenes o audios" [disabled]="sending() || connecting()" (change)="selectMedia($event)" />
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </label>
            <input
              aria-label="Escribe un mensaje"
              autocomplete="off"
              maxlength="1000"
              name="message"
              placeholder="Escribe un mensaje..."
              [value]="draft()"
              (input)="onDraftInput($any($event.target).value)"
            />
            <button type="submit" aria-label="Enviar mensaje" title="Enviar mensaje" [disabled]="(!draft().trim() && !mediaFiles().length) || sending() || connecting()">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 8-16 8 3-8-3-8Zm3 8h13" /></svg>
            </button>
          </div>
          <div class="composer-footer"><span>{{ sending() ? 'Guardando...' : saved() ? 'Guardado en PostgreSQL' : 'Sesión anónima' }}</span><span>{{ draft().length }}/1000</span></div>
        </form>
      </section>

      @if (adminOpen()) {
        <div class="admin-overlay" role="presentation">
          <button class="admin-backdrop" type="button" aria-label="Cerrar administración" (click)="closeAdminPanel()"></button>
          <section class="admin-panel" role="dialog" aria-modal="true" aria-labelledby="admin-title">
            <header class="admin-header">
              <div><p class="eyebrow">CONTROL DE ACCESO</p><h2 id="admin-title">Usuarios</h2></div>
              <button class="admin-close" type="button" aria-label="Cerrar administración" (click)="closeAdminPanel()">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </header>
            @if (adminError()) { <p class="error-message" role="alert">{{ adminError() }}</p> }
            @if (adminNotice()) { <p class="success-message" role="status">{{ adminNotice() }}</p> }
            <label class="admin-search"><span class="visually-hidden">Buscar usuarios</span><input type="search" placeholder="Email, username o nombre" [value]="adminSearch()" (input)="adminSearch.set($any($event.target).value)" /></label>
            @if (adminUsersLoading()) {
              <p class="admin-empty">Cargando usuarios...</p>
            } @else if (!filteredAdminUsers().length) {
              <p class="admin-empty">No hay usuarios que coincidan.</p>
            } @else {
              <div class="admin-user-list">
                @for (user of filteredAdminUsers(); track user.uid) {
                  <article class="admin-user-row">
                    <header class="admin-user-heading">
                      <div class="admin-user-identity">
                        <strong>{{ user.displayName || user.email || user.uid }}</strong>
                        <span>{{ user.username ? '@' + user.username : 'Sin username' }} · {{ user.email || 'Sin correo' }}</span>
                      </div>
                      <button class="admin-edit-toggle" type="button" (click)="toggleAdminEdit(user)">{{ editingAdminUid() === user.uid ? 'Cancelar' : 'Editar perfil' }}</button>
                    </header>
                    <div class="admin-user-controls">
                      <label><span>Rol</span><select [value]="user.role" [disabled]="adminSavingUid() === user.uid" (change)="changeAdminRole(user, $any($event.target).value)"><option value="user">Usuario</option><option value="admin">Administrador</option></select></label>
                      <label class="admin-active-toggle"><input type="checkbox" [checked]="user.isActive" [disabled]="adminSavingUid() === user.uid" (change)="changeAdminActive(user, $any($event.target).checked)" /><span>{{ user.isActive ? 'Activo' : 'Bloqueado' }}</span></label>
                    </div>
                    @if (editingAdminUid() === user.uid) {
                      <form class="admin-profile-form" (submit)="saveAdminProfile($event, user)">
                        <label><span>Username</span><input name="username" minlength="3" maxlength="20" pattern="[a-z0-9_]{3,20}" required [value]="adminEditUsername()" (input)="adminEditUsername.set($any($event.target).value)" /></label>
                        <label><span>Nombres</span><input name="firstName" maxlength="60" required [value]="adminEditFirstName()" (input)="adminEditFirstName.set($any($event.target).value)" /></label>
                        <label><span>Apellidos</span><input name="lastName" maxlength="60" required [value]="adminEditLastName()" (input)="adminEditLastName.set($any($event.target).value)" /></label>
                        <label class="admin-bio-field"><span>Biografía</span><textarea name="bio" maxlength="160" rows="2" [value]="adminEditBio()" (input)="adminEditBio.set($any($event.target).value)"></textarea></label>
                        <button class="admin-save-profile" type="submit" [disabled]="adminSavingUid() === user.uid">{{ adminSavingUid() === user.uid ? 'Guardando...' : 'Guardar perfil' }}</button>
                      </form>
                    }
                  </article>
                }
              </div>
            }
          </section>
        </div>
      }

      <aside class="details-panel" aria-label="Detalles de la conversación">
        <header class="details-header"><p class="eyebrow">PANEL DE CONTEXTO</p><h2>Detalles</h2></header>
        <div class="details-room">
          <span class="details-avatar" aria-hidden="true">G</span>
          <h3>Chat general</h3>
          <p>Conversación compartida</p>
        </div>
        <section class="details-section">
          <p class="eyebrow">ESTADO</p>
          <div class="details-status"><span class="status-dot" [class.status-dot-online]="!connecting() && !error()"></span>{{ connecting() ? 'Conectando' : error() ? 'Sin conexión' : 'Conectado' }}</div>
        </section>
        <section class="details-section">
          <p class="eyebrow">IDENTIDAD</p>
          <div class="identity-row">
            @if (profile()?.photoURL) {
              <img class="identity-photo" [src]="profile()?.photoURL" alt="Foto de perfil" />
            } @else {
              <span class="guest-avatar">{{ userInitial() }}</span>
            }
            <span><strong>{{ profile()?.displayName ?? currentUser()?.email ?? 'Invitado' }}</strong><small>{{ profile() ? '@' + profile()?.username + ' · ' + profile()?.age + ' años' : 'Sesión anónima' }}</small></span>
          </div>
          @if (profile()?.bio) {
            <p class="profile-bio">{{ profile()?.bio }}</p>
          }
        </section>
        <div class="details-footer"><span class="footer-mark">E</span><span>Pulse / Echo</span></div>
      </aside>
      }
    </main>
  `,
    styles: [`
    :host { display: block; min-height: 100dvh; color-scheme: dark; }
    .workspace { display: grid; grid-template-columns: 72px 320px minmax(0, 1fr); width: 100%; height: 100dvh; overflow: hidden; background: #0a0a0c; color: #f8fafc; font-family: var(--font-geist); }
    .auth-screen { grid-column: 1 / -1; display: grid; min-height: 100dvh; place-items: center; padding: 24px; background-color: #0a0a0c; background-image: linear-gradient(#ffffff06 1px, transparent 1px), linear-gradient(90deg, #ffffff06 1px, transparent 1px); background-size: 48px 48px; }
    .auth-panel { width: min(100%, 420px); padding: 32px; background: #121316; border: 1px solid #2c2e35; border-radius: 4px; box-shadow: inset 0 1px #ffffff08; }
    .auth-loading { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; gap: 10px; color: #94a3b8; font-size: 13px; }
    .auth-brand { display: flex; align-items: center; gap: 10px; width: fit-content; margin-bottom: 30px; color: #e3e2e6; font-family: var(--font-space); font-size: 12px; font-weight: 600; text-decoration: none; }
    .auth-brand img { width: 30px; height: 30px; object-fit: contain; }
    .auth-panel > .eyebrow { color: #7bd0ff; }
    .auth-panel h1 { margin: 8px 0 6px; color: #f8fafc; font-family: var(--font-space); font-size: 26px; font-weight: 600; }
    .auth-description { margin: 0 0 24px; color: #94a3b8; font-size: 13px; }
    .auth-form { display: grid; gap: 16px; }
    .auth-field { display: grid; gap: 7px; color: #c7c4d8; font-size: 12px; }
    .auth-field input { width: 100%; height: 44px; padding: 0 12px; color: #f8fafc; border: 1px solid #2c2e35; border-radius: 4px; background: #1a1b20; font: inherit; font-size: 13px; }
    .auth-field input::placeholder { color: #475569; }
    .auth-field input:focus { border-color: #4f46e5; box-shadow: 0 0 0 2px #4f46e533; }
    .auth-submit, .guest-submit { width: 100%; height: 44px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .auth-submit { margin-top: 2px; background: #4f46e5; }
    .auth-submit:hover:not(:disabled) { background: #6366f1; }
    .guest-submit { color: #c7c4d8; border-color: #2c2e35; background: transparent; }
    .guest-submit:hover:not(:disabled) { color: #f8fafc; border-color: #464555; background: #1a1b20; }
    .auth-switch { display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; margin-top: 20px; color: #94a3b8; font-size: 12px; }
    .auth-switch button { width: auto; height: auto; padding: 0; color: #7bd0ff; border: 0; background: transparent; font: inherit; font-weight: 600; }
    .auth-switch button:hover { color: #c4e7ff; }
    .auth-divider { display: flex; align-items: center; gap: 12px; margin: 20px 0 14px; color: #64748b; font-size: 10px; }
    .auth-divider::before, .auth-divider::after { height: 1px; flex: 1; background: #2c2e35; content: ''; }
    .auth-error { margin: 0; padding: 10px 11px; color: #ffb4ab; border: 1px solid #93000a; border-radius: 4px; background: #93000a26; font-size: 12px; line-height: 1.45; }
    .auth-note { margin: 18px 0 0; color: #64748b; font-size: 11px; line-height: 1.5; text-align: center; }
    .profile-panel { width: min(100%, 520px); max-height: calc(100dvh - 32px); overflow-y: auto; }
    .profile-form { display: grid; gap: 14px; }
    .profile-photo-row { display: flex; align-items: center; gap: 14px; margin: 2px 0 4px; }
    .profile-photo-preview, .profile-photo-placeholder { width: 66px; height: 66px; flex: 0 0 auto; border: 1px solid #4f46e5; border-radius: 4px; object-fit: cover; }
    .profile-photo-placeholder { display: grid; place-items: center; color: #c3c0ff; background: #1a1b20; font-family: var(--font-space); font-size: 24px; }
    .photo-picker { position: relative; display: grid; gap: 4px; min-width: 0; cursor: pointer; }
    .photo-picker strong { overflow: hidden; color: #e3e2e6; font-size: 12px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
    .photo-picker small, .field-hint { color: #64748b; font-size: 10px; }
    .photo-file-input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .photo-picker:focus-within { outline: 2px solid #4f46e5; outline-offset: 4px; }
    .profile-name-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .age-field { max-width: 130px; }
    .auth-field textarea { width: 100%; min-height: 74px; resize: vertical; padding: 10px 12px; color: #f8fafc; border: 1px solid #2c2e35; border-radius: 4px; outline: 0; background: #1a1b20; font: inherit; font-size: 13px; }
    .auth-field textarea:focus { border-color: #4f46e5; box-shadow: 0 0 0 2px #4f46e533; }
    .field-count { justify-self: end; }
    .auth-back { width: auto; height: 32px; display: flex; gap: 7px; margin: -12px 0 18px; padding: 0 8px; color: #94a3b8; border: 1px solid #2c2e35; background: transparent; font-size: 11px; }
    .auth-back svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.6; }
    .utility-rail { display: flex; flex-direction: column; align-items: center; gap: 28px; padding: 18px 0; background: #0a0a0c; border-right: 1px solid #2c2e35; }
    .brand-link { width: 42px; height: 42px; display: grid; place-items: center; border: 1px solid #2c2e35; border-radius: 4px; background: #121316; }
    .brand-link img { width: 28px; height: 28px; object-fit: contain; }
    .rail-navigation { display: flex; flex-direction: column; gap: 8px; }
    .rail-link { width: 42px; height: 42px; display: grid; place-items: center; color: #94a3b8; border: 1px solid transparent; border-radius: 4px; transition: background .16s ease, color .16s ease, border-color .16s ease; }
    .rail-link:hover, .rail-link-active { color: #f8fafc; background: #1a1b20; border-color: #2c2e35; }
    .rail-link-active { box-shadow: inset 2px 0 #4f46e5; }
    .rail-link svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.6; }
    .rail-bottom { margin-top: auto; }
    .guest-avatar, .conversation-avatar, .thread-avatar, .details-avatar { display: grid; flex: 0 0 auto; place-items: center; color: #dad7ff; border: 1px solid #4f46e5; background: #1a1b20; font-family: var(--font-space); font-weight: 600; }
    .guest-avatar { width: 34px; height: 34px; border-radius: 4px; font-size: 13px; }
    .conversation-sidebar { display: flex; min-width: 0; flex-direction: column; overflow-y: auto; padding: 24px 16px 14px; background: #121316; border-right: 1px solid #2c2e35; }
    .sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 24px; }
    .sidebar-header-actions { display: flex; align-items: center; gap: 6px; }
    .mobile-close-conversations, .mobile-chats-action { display: none; }
    .mobile-conversations-backdrop { display: none; }
    .eyebrow { margin: 0; color: #64748b; font-size: 10px; font-weight: 600; line-height: 1.4; }
    .sidebar-header h2, .details-header h2 { margin: 6px 0 0; color: #f8fafc; font-family: var(--font-space); font-size: 21px; font-weight: 600; line-height: 1.2; }
    .sidebar-count { min-width: 28px; padding: 4px 6px; color: #c3c0ff; border: 1px solid #33315e; border-radius: 4px; background: #1a1b20; font-size: 11px; text-align: center; }
    .sidebar-section-label { display: flex; justify-content: space-between; padding: 0 8px 10px; color: #64748b; font-size: 10px; font-weight: 600; }
    .sidebar-section-label span:last-child { color: #475569; }
    .conversation-item { display: flex; align-items: center; gap: 11px; min-width: 0; padding: 11px 9px; color: inherit; border: 1px solid #343538; border-radius: 4px; background: #1a1b20; text-decoration: none; box-shadow: inset 0 1px #ffffff08; }
    .conversation-item-active { border-color: #4f46e5; background: #202027; }
    .user-search { display: flex; align-items: center; gap: 8px; min-width: 0; height: 40px; margin: 0 0 8px; padding: 0 10px; color: #64748b; border: 1px solid #2c2e35; border-radius: 4px; background: #0a0a0c; }
    .user-search svg { width: 16px; height: 16px; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 1.6; }
    .user-search input { height: 36px; padding: 0; font-size: 11px; }
    .user-search input::-webkit-search-cancel-button { cursor: pointer; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
    .search-status { margin: 4px 8px 10px; color: #64748b; font-size: 10px; }
    .user-search-results { display: grid; gap: 4px; margin: 0 0 12px; }
    .user-result { width: 100%; height: auto; display: flex; align-items: center; justify-content: flex-start; gap: 10px; padding: 7px; color: inherit; border-color: transparent; background: transparent; text-align: left; }
    .user-result:hover:not(:disabled) { border-color: #2c2e35; background: #1a1b20; }
    .user-result .conversation-copy { display: grid; gap: 3px; }
    .user-result .conversation-copy strong { overflow: hidden; color: #e3e2e6; font-size: 11px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
    .user-result .conversation-copy small { color: #64748b; font-size: 10px; }
    .sidebar-section-conversations { margin-top: 14px; }
    .conversation-avatar { width: 38px; height: 38px; border-radius: 4px; font-size: 15px; }
    .conversation-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 5px; }
    .conversation-title { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .conversation-title strong { overflow: hidden; color: #f8fafc; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .conversation-title span { color: #94a3b8; font-size: 10px; }
    .conversation-preview { overflow: hidden; color: #64748b; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    .conversation-live, .status-dot, .live-indicator { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: #475569; }
    .conversation-live, .status-dot-online, .live-indicator { background: #38bdf8; box-shadow: 0 0 8px #38bdf840; }
    .sidebar-bottom { display: flex; align-items: center; gap: 8px; margin-top: auto; padding: 14px 8px 2px; color: #94a3b8; border-top: 1px solid #2c2e35; font-size: 11px; }
    .live-indicator { width: 6px; height: 6px; }
    .thread { display: flex; min-width: 0; min-height: 0; flex-direction: column; background: #0a0a0c; }
    .thread-header { display: flex; min-height: 76px; align-items: center; gap: 14px; padding: 0 24px; background: #121316; border-bottom: 1px solid #2c2e35; }
    .thread-heading { display: flex; min-width: 0; flex: 1; align-items: center; gap: 12px; }
    .thread-avatar { width: 40px; height: 40px; border-radius: 4px; font-size: 16px; }
    .thread-heading h1 { margin: 3px 0 0; color: #f8fafc; font-family: var(--font-space); font-size: 17px; font-weight: 600; }
    .thread-status { display: flex; align-items: center; gap: 7px; color: #94a3b8; font-size: 11px; white-space: nowrap; }
    .thread-count { padding-left: 14px; color: #64748b; border-left: 1px solid #2c2e35; font-size: 10px; white-space: nowrap; }
    .thread-count span { margin-right: 5px; color: #7bd0ff; font-family: var(--font-space); font-size: 13px; font-weight: 600; }
    .session-action { width: auto; height: 34px; display: flex; align-items: center; gap: 7px; padding: 0 10px; color: #94a3b8; border-color: #2c2e35; background: transparent; font-size: 11px; }
    .session-action:hover:not(:disabled) { color: #f8fafc; background: #1a1b20; }
    .session-action svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.5; }
    .message-stream { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 18px; overflow-y: auto; padding: 28px clamp(16px, 4vw, 56px); scrollbar-color: #343538 #0a0a0c; }
    .empty-state { display: grid; align-content: center; justify-items: center; gap: 9px; flex: 1; color: #64748b; text-align: center; }
    .empty-mark { width: 42px; height: 42px; display: grid; place-items: center; margin-bottom: 4px; color: #7bd0ff; border: 1px solid #2c2e35; border-radius: 4px; background: #121316; }
    .empty-mark svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.5; }
    .empty-state p { margin: 0; color: #e3e2e6; font-family: var(--font-space); font-size: 16px; font-weight: 600; }
    .empty-state span:last-child { font-size: 12px; }
    .message-row { display: flex; justify-content: flex-start; }
    .message-row-mine { justify-content: flex-end; }
    .message-content { max-width: min(78%, 620px); }
    .message-row-mine .message-meta { justify-content: flex-end; }
    .message-meta { display: flex; align-items: center; gap: 8px; margin: 0 2px 6px; color: #64748b; font-size: 10px; }
    .message-meta span { color: #94a3b8; font-size: 11px; font-weight: 600; }
    .message-avatar, .message-avatar-placeholder { width: 22px; height: 22px; display: grid; flex: 0 0 auto; place-items: center; color: #c3c0ff; border: 1px solid #33315e; border-radius: 4px; background: #1a1b20; font-family: var(--font-space); font-size: 9px; object-fit: cover; }
    .message-bubble { position: relative; margin: 0; padding: 8px 12px; color: #f8fafc; border: 1px solid #2c2e35; border-radius: 4px; background: #1a1b20; font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; white-space: pre-wrap; }
    .message-row-mine .message-bubble { border-color: #6366f14d; background: #22252b; }
    .message-row-mine .message-bubble::after { position: absolute; top: 7px; right: -1px; bottom: 7px; width: 2px; border-radius: 2px; background: #4f46e5; content: ''; }
    .message-attachments { display: grid; gap: 8px; margin-top: 8px; }
    .message-image { display: block; width: auto; max-width: min(100%, 360px); max-height: 360px; border: 1px solid #2c2e35; border-radius: 4px; object-fit: contain; }
    .message-audio { display: grid; gap: 5px; min-width: 0; color: #94a3b8; font-size: 10px; }
    .message-audio span { overflow-wrap: anywhere; }
    .message-audio audio { width: min(320px, 100%); height: 40px; }
    .media-loading { color: #64748b; font-size: 10px; }
    .composer { padding: 14px 24px max(14px, env(safe-area-inset-bottom)); background: #121316; border-top: 1px solid #2c2e35; }
    .composer-row { display: flex; align-items: center; gap: 8px; padding: 5px; background: #1a1b20; border: 1px solid #2c2e35; border-radius: 4px; transition: border-color .16s ease, box-shadow .16s ease; }
    .composer-row:focus-within { border-color: #4f46e5; box-shadow: 0 0 0 2px #4f46e533; }
    .composer-attach { position: relative; width: 38px; height: 38px; display: grid; flex: 0 0 auto; place-items: center; color: #94a3b8; border: 1px solid transparent; border-radius: 4px; cursor: pointer; }
    .composer-attach:hover { color: #f8fafc; background: #2c2e35; }
    .composer-attach:focus-within { outline: 2px solid #7bd0ff; outline-offset: 2px; }
    .composer-attach svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 1.7; }
    .attachment-input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    input { min-width: 0; height: 42px; flex: 1; padding: 0 10px; color: #f8fafc; border: 0; outline: 0; background: transparent; font: inherit; font-size: 13px; }
    .attachment-picks { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 9px; }
    .attachment-pick { display: flex; align-items: center; gap: 5px; max-width: min(100%, 280px); padding: 3px 5px 3px 9px; color: #cbd5e1; border: 1px solid #343538; border-radius: 4px; background: #1a1b20; font-size: 10px; }
    .attachment-pick > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .remove-attachment { width: 22px; height: 22px; color: #94a3b8; border: 0; background: transparent; }
    .remove-attachment:hover:not(:disabled) { color: #f8fafc; background: #343538; }
    .remove-attachment svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 1.7; }
    input::placeholder { color: #64748b; }
    button { width: 38px; height: 38px; display: grid; flex: 0 0 auto; place-items: center; color: #f8fafc; border: 1px solid transparent; border-radius: 4px; background: #4f46e5; cursor: pointer; transition: background .16s ease, border-color .16s ease, opacity .16s ease; }
    button:hover:not(:disabled) { border-color: #ffffff26; background: #6366f1; }
    button:disabled { cursor: not-allowed; opacity: .45; }
    button svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.7; }
    .composer-footer { display: flex; justify-content: space-between; padding: 8px 2px 0; color: #64748b; font-size: 10px; }
    .error-message { margin: 0 0 8px; color: #ffb4ab; font-size: 12px; }
    .success-message { margin: 0 0 8px; color: #7bd0ff; font-size: 12px; }
    .details-panel { display: none; min-width: 0; flex-direction: column; padding: 24px 18px 14px; background: #121316; border-left: 1px solid #2c2e35; }
    .admin-open-action { width: auto; height: 34px; display: inline-flex; align-items: center; gap: 6px; padding: 0 9px; color: #cbd5e1; border-color: #343538; background: #1a1b20; font-size: 10px; }
    .admin-open-action:hover:not(:disabled) { background: #272832; }
    .admin-open-action svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.5; }
    .admin-overlay { position: fixed; z-index: 100; inset: 0; display: grid; place-items: center; padding: 24px; }
    .admin-backdrop { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; border-radius: 0; background: #000b; }
    .admin-panel { position: relative; z-index: 1; width: min(760px, 100%); max-height: min(820px, calc(100dvh - 48px)); display: flex; flex-direction: column; overflow: hidden; padding: 22px; border: 1px solid #343538; border-radius: 4px; background: #121316; box-shadow: 0 24px 80px #0009; }
    .admin-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 16px; border-bottom: 1px solid #2c2e35; }
    .admin-header h2 { margin: 5px 0 0; font-family: var(--font-space); font-size: 20px; }
    .admin-close { width: 34px; height: 34px; color: #cbd5e1; border-color: #343538; background: transparent; }
    .admin-close svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 1.6; }
    .admin-search { display: block; padding: 12px 0; }
    .admin-search input, .admin-user-controls select, .admin-profile-form input, .admin-profile-form textarea { width: 100%; min-width: 0; height: 38px; padding: 0 10px; color: #f8fafc; border: 1px solid #343538; border-radius: 4px; outline: 0; background: #0a0a0c; font: inherit; font-size: 12px; }
    .admin-profile-form textarea { height: auto; min-height: 56px; resize: vertical; padding: 8px 10px; }
    .admin-user-list { min-height: 0; overflow-y: auto; }
    .admin-user-row { padding: 14px 0; border-top: 1px solid #2c2e35; }
    .admin-user-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .admin-user-identity { display: grid; min-width: 0; gap: 4px; }
    .admin-user-identity strong { overflow: hidden; color: #f8fafc; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .admin-user-identity span { overflow: hidden; color: #64748b; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
    .admin-edit-toggle { width: auto; height: 30px; padding: 0 8px; color: #cbd5e1; border-color: #343538; background: transparent; font-size: 10px; }
    .admin-user-controls { display: flex; align-items: end; gap: 12px; margin-top: 12px; }
    .admin-user-controls > label:not(.admin-active-toggle), .admin-profile-form > label { display: grid; flex: 1; gap: 5px; color: #94a3b8; font-size: 10px; }
    .admin-user-controls select { height: 34px; }
    .admin-active-toggle { display: flex; height: 34px; align-items: center; gap: 7px; color: #cbd5e1; font-size: 11px; }
    .admin-active-toggle input { width: 16px; height: 16px; accent-color: #38bdf8; }
    .admin-profile-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; padding: 12px; border: 1px solid #2c2e35; border-radius: 4px; background: #0d0e10; }
    .admin-bio-field { grid-column: 1 / -1; }
    .admin-save-profile { width: auto; height: 34px; justify-self: start; padding: 0 11px; background: #4f46e5; font-size: 10px; }
    .admin-empty { margin: 24px 0; color: #94a3b8; font-size: 12px; text-align: center; }
    .details-header { padding-bottom: 22px; border-bottom: 1px solid #2c2e35; }
    .details-header h2 { margin-top: 6px; color: #f8fafc; font-family: var(--font-space); font-size: 17px; font-weight: 600; }
    .details-room { display: grid; justify-items: center; padding: 28px 0 24px; text-align: center; }
    .details-avatar { width: 54px; height: 54px; border-radius: 4px; font-size: 20px; }
    .details-room h3 { margin: 12px 0 4px; color: #f8fafc; font-family: var(--font-space); font-size: 15px; font-weight: 600; }
    .details-room > p { margin: 0; color: #64748b; font-size: 11px; }
    .details-section { padding: 16px 0; border-top: 1px solid #2c2e35; }
    .details-status { display: flex; align-items: center; gap: 8px; margin-top: 12px; color: #e3e2e6; font-size: 12px; }
    .identity-row { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
    .identity-row > span:last-child { display: grid; gap: 3px; }
    .identity-row strong { color: #e3e2e6; font-size: 12px; font-weight: 500; }
    .identity-row small { color: #64748b; font-size: 10px; }
    .identity-row strong { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .identity-photo { width: 34px; height: 34px; flex: 0 0 auto; border: 1px solid #4f46e5; border-radius: 4px; object-fit: cover; }
    .profile-bio { margin: 10px 0 0; color: #94a3b8; font-size: 11px; line-height: 1.5; }
    .details-footer { display: flex; align-items: center; gap: 8px; margin-top: auto; padding-top: 14px; color: #64748b; border-top: 1px solid #2c2e35; font-size: 10px; }
    .footer-mark { width: 22px; height: 22px; display: grid; place-items: center; color: #c3c0ff; border: 1px solid #33315e; border-radius: 4px; font-family: var(--font-space); font-size: 11px; }
    @media (min-width: 768px) and (max-width: 1023px) { .workspace { grid-template-columns: 64px 250px minmax(0, 1fr); } .thread-header { padding: 0 18px; } .thread-count { display: none; } }
    @media (min-width: 1280px) { .workspace { grid-template-columns: 72px 320px minmax(0, 1fr) 260px; } .details-panel { display: flex; } }
    @media (max-width: 767px) {
      .workspace { display: block; }
      .utility-rail, .conversation-sidebar { display: none; }
      .conversation-sidebar.mobile-conversations-open { position: fixed; z-index: 50; inset: 0 auto 0 0; width: min(88vw, 340px); height: 100dvh; display: flex; padding: 20px 16px max(14px, env(safe-area-inset-bottom)); box-shadow: 10px 0 36px #0008; }
      .mobile-chats-action { width: 36px; height: 36px; display: grid; color: #cbd5e1; border-color: #2c2e35; background: #121316; }
      .mobile-chats-action:hover:not(:disabled) { background: #1a1b20; }
      .mobile-chats-action svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.6; }
      .mobile-close-conversations { width: 32px; height: 32px; display: grid; color: #94a3b8; border-color: #2c2e35; background: transparent; }
      .mobile-close-conversations:hover:not(:disabled) { background: #1a1b20; }
      .mobile-close-conversations svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 1.6; }
      .mobile-conversations-backdrop { position: fixed; z-index: 40; inset: 0; width: 100%; height: 100%; display: block; padding: 0; border: 0; border-radius: 0; background: #0009; }
      .thread { width: 100%; height: 100dvh; }
      .thread-header { min-height: 68px; gap: 10px; padding: 0 16px; }
      .thread-avatar { width: 36px; height: 36px; }
      .thread-heading { gap: 9px; }
      .thread-heading h1 { font-size: 15px; }
      .thread-status { gap: 5px; font-size: 10px; }
      .thread-count { display: none; }
      .admin-open-action { width: 34px; height: 34px; justify-content: center; padding: 0; }
      .admin-open-action span { display: none; }
      .admin-overlay { padding: 0; }
      .admin-panel { width: 100%; max-height: 100dvh; height: 100dvh; padding: 18px 16px max(16px, env(safe-area-inset-bottom)); border: 0; border-radius: 0; }
      .admin-user-heading { align-items: flex-start; }
      .admin-user-controls { align-items: end; }
      .admin-profile-form { gap: 8px; padding: 10px; }
      .session-action { width: 36px; height: 36px; padding: 0; justify-content: center; }
      .session-action span { display: none; }
      .message-stream { gap: 14px; padding: 20px 16px; }
      .message-content { max-width: 86%; }
      .composer { padding: 10px 12px max(12px, env(safe-area-inset-bottom)); }
      .auth-screen { padding: 16px; }
      .auth-panel { padding: 24px 20px; }
      .profile-panel { max-height: calc(100dvh - 32px); padding: 20px 16px; }
      .profile-name-row { gap: 9px; }
      .profile-name-row .auth-field { min-width: 0; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; } }
  `]
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
    readonly adminUsers = signal<AdminUser[]>([]);
    readonly adminUsersLoading = signal(false);
    readonly adminSearch = signal('');
    readonly adminError = signal('');
    readonly adminNotice = signal('');
    readonly adminSavingUid = signal<string | null>(null);
    readonly editingAdminUid = signal<string | null>(null);
    readonly adminEditUsername = signal('');
    readonly adminEditFirstName = signal('');
    readonly adminEditLastName = signal('');
    readonly adminEditBio = signal('');
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
    private lastMessageId: string | null = null;
    private readonly requestedAttachments = new Set<string>();
    private destroyed = false;
    private mediaObserver: IntersectionObserver | null = null;
    private searchTimeout: ReturnType<typeof setTimeout> | null = null;
    private searchGeneration = 0;
    private adminLoadGeneration = 0;
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
      this.adminError.set('');
      this.adminNotice.set('');
      void this.loadAdminUsers();
    }

    closeAdminPanel(): void {
      this.adminOpen.set(false);
      this.editingAdminUid.set(null);
    }

    filteredAdminUsers(): AdminUser[] {
      const search = this.adminSearch().trim().toLowerCase();
      if (!search) return this.adminUsers();
      return this.adminUsers().filter(user =>
        [user.username, user.displayName, user.email].some(value => value?.toLowerCase().includes(search))
      );
    }

    private async loadAdminUsers(): Promise<void> {
      const generation = ++this.adminLoadGeneration;
      this.adminUsersLoading.set(true);
      try {
        const users = await this.chat.listAdminUsers();
        if (generation === this.adminLoadGeneration && this.profile()?.role === 'admin') {
          this.adminUsers.set(users);
        }
      } catch (error: unknown) {
        if (generation === this.adminLoadGeneration) {
          this.adminError.set(error instanceof Error ? error.message : 'No se pudieron cargar los usuarios.');
        }
      } finally {
        if (generation === this.adminLoadGeneration) this.adminUsersLoading.set(false);
      }
    }

    toggleAdminEdit(user: AdminUser): void {
      if (this.editingAdminUid() === user.uid) {
        this.editingAdminUid.set(null);
        return;
      }
      this.editingAdminUid.set(user.uid);
      this.adminEditUsername.set(user.username ?? '');
      this.adminEditFirstName.set(user.firstName ?? '');
      this.adminEditLastName.set(user.lastName ?? '');
      this.adminEditBio.set(user.bio ?? '');
      this.adminError.set('');
    }

    async saveAdminProfile(event: Event, user: AdminUser): Promise<void> {
      event.preventDefault();
      await this.updateAdminUser(user, {
        profile: {
          username: this.adminEditUsername(),
          firstName: this.adminEditFirstName(),
          lastName: this.adminEditLastName(),
          bio: this.adminEditBio()
        }
      }, 'Perfil actualizado.');
      if (!this.adminError()) this.editingAdminUid.set(null);
    }

    async changeAdminRole(user: AdminUser, role: string): Promise<void> {
      if (role !== 'user' && role !== 'admin') return;
      await this.updateAdminUser(user, { role }, role === 'admin' ? 'Permiso de administrador concedido.' : 'Permiso de administrador retirado.');
    }

    async changeAdminActive(user: AdminUser, isActive: boolean): Promise<void> {
      await this.updateAdminUser(user, { isActive }, isActive ? 'Cuenta activada.' : 'Cuenta bloqueada.');
    }

    private async updateAdminUser(
      user: AdminUser,
      changes: Parameters<ChatService['updateAdminUser']>[1],
      notice: string
    ): Promise<void> {
      this.adminSavingUid.set(user.uid);
      this.adminError.set('');
      this.adminNotice.set('');
      try {
        const updated = await this.chat.updateAdminUser(user.uid, changes);
        this.adminUsers.update(users => users.map(item => item.uid === updated.uid ? updated : item));
        this.adminNotice.set(notice);
        if (updated.uid === this.currentUser()?.uid) {
          this.profile.update(profile => profile ? { ...profile, role: updated.role, isActive: updated.isActive } : profile);
          if (updated.role !== 'admin' || !updated.isActive) this.closeAdminPanel();
        }
      } catch (error: unknown) {
        this.adminError.set(error instanceof Error ? error.message : 'No se pudo actualizar el usuario.');
        void this.loadAdminUsers();
      } finally {
        this.adminSavingUid.set(null);
      }
    }
    isMine(message: ChatMessage): boolean {
        return message.senderId === this.currentUserId();
    }

    activeConversation(): ChatConversation {
      return this.conversations().find(conversation => conversation.id === this.selectedConversationId())
          ?? { id: GENERAL_CONVERSATION_ID, kind: 'general', title: 'General', lastMessage: '' };
    }

    selectConversation(conversation: ChatConversation): void {
      this.selectedConversationId.set(conversation.id);
      this.chat.selectConversation(conversation.id);
      this.mobileConversationsOpen.set(false);
      this.error.set('');
      this.saved.set(false);
      this.lastMessageId = null;
      this.scrollToBottom();
    }

    onUserSearch(value: string): void {
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
      try {
        const conversations = await this.chat.listConversations();
        if (this.currentUser()?.uid !== uid) return;
        this.conversations.set(conversations);
        if (!conversations.some(conversation => conversation.id === this.selectedConversationId())) {
          const general = conversations.find(conversation => conversation.kind === 'general');
          if (general) this.selectConversation(general);
        }
      } catch (error: unknown) {
        if (this.currentUser()?.uid === uid) {
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
            await this.chat.sendMessage(text, user.uid, this.profile(), uploadedMedia.map(media => media.id), this.selectedConversationId());
            this.draft.set('');
        this.mediaFiles.set([]);
            this.saved.set(true);
            this.scrollToBottom();
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
