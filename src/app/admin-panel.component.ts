import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { AdminUser, ChatService } from './chat.service';

@Component({
    selector: 'app-admin-panel',
    standalone: true,
    template: `
      <div class="admin-overlay" role="presentation">
        <button class="admin-backdrop" type="button" aria-label="Cerrar administración" (click)="close.emit()"></button>
        <section class="admin-panel" role="dialog" aria-modal="true" aria-labelledby="admin-title">
          <header class="admin-header">
            <div><p class="eyebrow">CONTROL DE ACCESO</p><h2 id="admin-title">Usuarios</h2></div>
            <button class="admin-close" type="button" aria-label="Cerrar administración" (click)="close.emit()">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>
          @if (error()) { <p class="error-message" role="alert">{{ error() }}</p> }
          @if (notice()) { <p class="success-message" role="status">{{ notice() }}</p> }
          <label class="admin-search"><span class="visually-hidden">Buscar usuarios</span><input type="search" placeholder="Email, username o nombre" [value]="search()" (input)="search.set($any($event.target).value)" /></label>
          @if (loading()) {
            <p class="admin-empty">Cargando usuarios...</p>
          } @else if (!filteredUsers().length) {
            <p class="admin-empty">No hay usuarios que coincidan.</p>
          } @else {
            <div class="admin-user-list">
              @for (user of filteredUsers(); track user.uid) {
                <article class="admin-user-row">
                  <header class="admin-user-heading">
                    <div class="admin-user-identity">
                      <strong>{{ user.displayName || user.email || user.uid }}</strong>
                      <span>{{ user.username ? '@' + user.username : 'Sin username' }} · {{ user.email || 'Sin correo' }}</span>
                    </div>
                    <button class="admin-edit-toggle" type="button" (click)="toggleEdit(user)">{{ editingUid() === user.uid ? 'Cancelar' : 'Editar perfil' }}</button>
                  </header>
                  <div class="admin-user-controls">
                    <label><span>Rol</span><select [value]="user.role" [disabled]="savingUid() === user.uid" (change)="changeRole(user, $any($event.target).value)"><option value="user">Usuario</option><option value="admin">Administrador</option></select></label>
                    <label class="admin-active-toggle"><input type="checkbox" [checked]="user.isActive" [disabled]="savingUid() === user.uid" (change)="changeActive(user, $any($event.target).checked)" /><span>{{ user.isActive ? 'Activo' : 'Bloqueado' }}</span></label>
                  </div>
                  @if (editingUid() === user.uid) {
                    <form class="admin-profile-form" (submit)="saveProfile($event, user)">
                      <label><span>Username</span><input name="username" minlength="3" maxlength="20" pattern="[a-z0-9_]{3,20}" required [value]="editUsername()" (input)="editUsername.set($any($event.target).value)" /></label>
                      <label><span>Nombres</span><input name="firstName" maxlength="60" required [value]="editFirstName()" (input)="editFirstName.set($any($event.target).value)" /></label>
                      <label><span>Apellidos</span><input name="lastName" maxlength="60" required [value]="editLastName()" (input)="editLastName.set($any($event.target).value)" /></label>
                      <label class="admin-bio-field"><span>Biografía</span><textarea name="bio" maxlength="160" rows="2" [value]="editBio()" (input)="editBio.set($any($event.target).value)"></textarea></label>
                      <button class="admin-save-profile" type="submit" [disabled]="savingUid() === user.uid">{{ savingUid() === user.uid ? 'Guardando...' : 'Guardar perfil' }}</button>
                    </form>
                  }
                </article>
              }
            </div>
          }
        </section>
      </div>
    `,
    styles: [':host { display: contents; }']
})
export class AdminPanelComponent implements OnInit {
    private readonly chat = inject(ChatService);
    readonly currentUserId = input<string | null>(null);
    readonly close = output<void>();
    readonly profileUpdated = output<AdminUser>();

    readonly users = signal<AdminUser[]>([]);
    readonly loading = signal(true);
    readonly search = signal('');
    readonly error = signal('');
    readonly notice = signal('');
    readonly savingUid = signal<string | null>(null);
    readonly editingUid = signal<string | null>(null);
    readonly editUsername = signal('');
    readonly editFirstName = signal('');
    readonly editLastName = signal('');
    readonly editBio = signal('');
    readonly filteredUsers = computed(() => {
        const query = this.search().trim().toLowerCase();
        if (!query) return this.users();
        return this.users().filter(user =>
            [user.username, user.displayName, user.email].some(value => value?.toLowerCase().includes(query))
        );
    });

    private loadGeneration = 0;

    ngOnInit(): void {
        void this.loadUsers();
    }

    toggleEdit(user: AdminUser): void {
        if (this.editingUid() === user.uid) {
            this.editingUid.set(null);
            return;
        }
        this.editingUid.set(user.uid);
        this.editUsername.set(user.username ?? '');
        this.editFirstName.set(user.firstName ?? '');
        this.editLastName.set(user.lastName ?? '');
        this.editBio.set(user.bio ?? '');
        this.error.set('');
    }

    async saveProfile(event: Event, user: AdminUser): Promise<void> {
        event.preventDefault();
        await this.updateUser(user, {
            profile: {
                username: this.editUsername(),
                firstName: this.editFirstName(),
                lastName: this.editLastName(),
                bio: this.editBio()
            }
        }, 'Perfil actualizado.');
        if (!this.error()) this.editingUid.set(null);
    }

    async changeRole(user: AdminUser, role: string): Promise<void> {
        if (role !== 'user' && role !== 'admin') return;
        await this.updateUser(user, { role }, role === 'admin'
            ? 'Permiso de administrador concedido.'
            : 'Permiso de administrador retirado.');
    }

    async changeActive(user: AdminUser, isActive: boolean): Promise<void> {
        await this.updateUser(user, { isActive }, isActive ? 'Cuenta activada.' : 'Cuenta bloqueada.');
    }

    private async loadUsers(): Promise<void> {
        const generation = ++this.loadGeneration;
        this.loading.set(true);
        try {
            const users = await this.chat.listAdminUsers();
            if (generation === this.loadGeneration) this.users.set(users);
        } catch (error: unknown) {
            if (generation === this.loadGeneration) {
                this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar los usuarios.');
            }
        } finally {
            if (generation === this.loadGeneration) this.loading.set(false);
        }
    }

    private async updateUser(
        user: AdminUser,
        changes: Parameters<ChatService['updateAdminUser']>[1],
        notice: string
    ): Promise<void> {
        this.savingUid.set(user.uid);
        this.error.set('');
        this.notice.set('');
        try {
            const updated = await this.chat.updateAdminUser(user.uid, changes);
            this.users.update(users => users.map(item => item.uid === updated.uid ? updated : item));
            this.notice.set(notice);
            if (updated.uid === this.currentUserId()) this.profileUpdated.emit(updated);
        } catch (error: unknown) {
            this.error.set(error instanceof Error ? error.message : 'No se pudo actualizar el usuario.');
            void this.loadUsers();
        } finally {
            this.savingUid.set(null);
        }
    }
}
