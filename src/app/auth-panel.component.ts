import { Component, input, output } from '@angular/core';

@Component({
    selector: 'app-auth-panel',
    standalone: true,
    styleUrl: './auth-panel.component.css',
    template: `
      <div class="auth-panel" [class.profile-panel]="profileSetup()">
        @if (showBack()) {
          <button class="auth-back" type="button" (click)="close.emit()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 18-6-6 6-6M8 12h12" /></svg>
            Volver al chat
          </button>
        }
        <a class="auth-brand" href="#conversation" aria-label="Echo">
          <img src="https://lh3.googleusercontent.com/aida/AEtjO1WAQK8bUEtvgexkHFXyNxEmM0UarEUM1pbe5SDuYEJcKGHlzvBu5Goym3fpZi32TXFkNKEJDcJLCRpr9AH75YfUH0tCwmlXwMw6Xm18BsikXoazbb8VpB08GBmxDrQrGADuRqH0CIFakl90NIxjk7h8etQQ9pB4Ped2zy6rjLqFxEtiiPVldI8pcgG6pxbBxr1wfgxwJ8oDA03qIvuTlTleZByI7V1_HJy5pTDUgXo3fYLRdLtoTJ7r5bY" alt="" />
          <span>PULSE / ECHO</span>
        </a>

        @if (profileSetup()) {
          <p class="eyebrow">CONFIGURACIÓN DE CUENTA</p>
          <h1 id="profile-title">Completa tu perfil</h1>
          <p class="auth-description">Estos datos aparecerán en tu identidad de chat. Tu edad se mantiene privada.</p>

          <form class="profile-form" (submit)="profileSubmit.emit($event)">
            <div class="profile-photo-row">
              @if (photoPreview()) {
                <img class="profile-photo-preview" [src]="photoPreview()" alt="Vista previa de la foto de perfil" />
              } @else {
                <span class="profile-photo-placeholder" aria-hidden="true">{{ userInitial() }}</span>
              }
              <label class="photo-picker">
                <input class="photo-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Foto de perfil" (change)="photoSelected.emit($event)" />
                <span class="eyebrow">FOTO DE PERFIL</span>
                <strong>{{ photoFileName() || 'Elige una imagen' }}</strong>
                <small>JPG, PNG o WebP · máximo 5 MB</small>
              </label>
            </div>

            <label class="auth-field">
              <span>Nombre de usuario</span>
              <input type="text" name="username" autocomplete="username" placeholder="ej. maria_27" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" required [value]="profileUsername()" (input)="profileUsernameChange.emit($any($event.target).value)" />
              <small class="field-hint">Único; 3-20 letras, números o guion bajo.</small>
            </label>
            <div class="profile-name-row">
              <label class="auth-field">
                <span>Nombres</span>
                <input type="text" name="firstName" autocomplete="given-name" maxlength="60" required [value]="profileFirstName()" (input)="profileFirstNameChange.emit($any($event.target).value)" />
              </label>
              <label class="auth-field">
                <span>Apellidos</span>
                <input type="text" name="lastName" autocomplete="family-name" maxlength="60" required [value]="profileLastName()" (input)="profileLastNameChange.emit($any($event.target).value)" />
              </label>
            </div>
            <label class="auth-field age-field">
              <span>Edad</span>
              <input type="number" name="age" min="1" max="120" step="1" inputmode="numeric" required [value]="profileAge()" (input)="profileAgeChange.emit($any($event.target).value)" />
            </label>
            <label class="auth-field">
              <span>Acerca de ti <small>(opcional)</small></span>
              <textarea name="bio" maxlength="160" rows="3" placeholder="Una breve presentación" [value]="profileBio()" (input)="profileBioChange.emit($any($event.target).value)"></textarea>
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
        } @else {
          <p class="eyebrow">MENSAJERÍA EN TIEMPO REAL</p>
          <h1 id="auth-title">{{ authMode() === 'register' ? 'Crea tu cuenta' : 'Inicia sesión' }}</h1>
          <p class="auth-description">{{ authMode() === 'register' ? 'Regístrate para conservar tu acceso.' : 'Accede a tus conversaciones.' }}</p>

          <form class="auth-form" (submit)="authSubmit.emit($event)">
            <label class="auth-field">
              <span>Correo electrónico</span>
              <input type="email" autocomplete="email" name="email" placeholder="nombre@correo.com" required [value]="authEmail()" (input)="authEmailChange.emit($any($event.target).value)" />
            </label>
            <label class="auth-field">
              <span>Contraseña</span>
              <input type="password" [attr.autocomplete]="authMode() === 'register' ? 'new-password' : 'current-password'" name="password" placeholder="Mínimo 6 caracteres" minlength="6" required [value]="authPassword()" (input)="authPasswordChange.emit($any($event.target).value)" />
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
            <button type="button" (click)="switchMode.emit()">{{ authMode() === 'register' ? 'Inicia sesión' : 'Regístrate' }}</button>
          </div>

          @if (!hasUser()) {
            <div class="auth-divider"><span>O</span></div>
            <button class="guest-submit" type="button" [disabled]="authBusy()" (click)="continueAsGuest.emit()">Continuar como invitado</button>
          } @else {
            <p class="auth-note">Tu cuenta conservará esta sesión y sus mensajes.</p>
          }
        }
      </div>
    `
})
export class AuthPanelComponent {
    readonly profileSetup = input(false);
    readonly showBack = input(false);
    readonly hasUser = input(false);
    readonly authMode = input<'login' | 'register'>('login');
    readonly authEmail = input('');
    readonly authPassword = input('');
    readonly authBusy = input(false);
    readonly authError = input('');
    readonly profileUsername = input('');
    readonly profileFirstName = input('');
    readonly profileLastName = input('');
    readonly profileAge = input('');
    readonly profileBio = input('');
    readonly profileError = input('');
    readonly profileBusy = input(false);
    readonly photoPreview = input('');
    readonly photoFileName = input<string | null>(null);
    readonly userInitial = input('A');

    readonly authEmailChange = output<string>();
    readonly authPasswordChange = output<string>();
    readonly profileUsernameChange = output<string>();
    readonly profileFirstNameChange = output<string>();
    readonly profileLastNameChange = output<string>();
    readonly profileAgeChange = output<string>();
    readonly profileBioChange = output<string>();
    readonly authSubmit = output<Event>();
    readonly profileSubmit = output<Event>();
    readonly photoSelected = output<Event>();
    readonly switchMode = output<void>();
    readonly continueAsGuest = output<void>();
    readonly close = output<void>();
}
