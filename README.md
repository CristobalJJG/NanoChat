# Nano Chat

Chat en Angular con autenticación Firebase y almacenamiento propio en PostgreSQL. Firebase se usa solo para iniciar sesión y emitir ID tokens; la API Node los valida antes de acceder a los datos locales.

## Autenticación Firebase

En Firebase Console, activa **Authentication > Sign-in method > Email/Password**. Activa también **Anonymous** si quieres permitir el acceso como invitado. Firebase se utiliza únicamente para autenticación; perfiles, mensajes y archivos se almacenan en PostgreSQL.

La pantalla inicial permite crear una cuenta, iniciar sesión o continuar como invitado. Después del registro, el perfil requiere username único, nombres, apellidos, edad y una foto JPG, PNG o WebP de hasta 5 MB; la biografía es opcional. Si un invitado se registra desde el chat, Firebase enlaza el correo y la contraseña a su sesión anónima actual para conservar su UID y sus mensajes. La edad y los datos completos del perfil solo son legibles por su propietario; el nombre y la foto se comparten en los mensajes. Al cerrar sesión, podrá volver a entrar con sus credenciales.

## Iniciar con Docker

1. Asegúrate de tener Docker Desktop iniciado.
2. Configura las claves web de Firebase en `.env` (consulta `.env.example`).
3. En Firebase Console, activa **Authentication > Sign-in method > Email/Password**. Activa **Anonymous** si quieres permitir invitados.
4. Ejecuta:

```bash
docker compose up --build
```

Abre `http://localhost:9001`. La API está en `http://localhost:3000/api` y PostgreSQL está disponible en el puerto configurado con `POSTGRES_PORT` (5432 en `.env.example`).

Los mensajes, perfiles y adjuntos se guardan en PostgreSQL. Los archivos se almacenan como `BYTEA` en la tabla `media`; se aceptan imágenes, audio, vídeo y PDF de hasta 25 MB. Las fotos de perfil se limitan a 5 MB. El username tiene índice único. La edad y los datos completos del perfil solo se devuelven al propietario; nombre y foto se incluyen en los mensajes.

Los datos sobreviven a reinicios en el volumen `postgres_data`. `docker compose down` conserva ese volumen. No uses las credenciales por defecto fuera de desarrollo local; puedes cambiarlas con `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`, `API_PORT` y `WEB_PORT` en `.env`.

## Desarrollo local

Con Docker Desktop iniciado, arranca PostgreSQL:

```bash
docker compose up -d postgres
```

En una terminal ejecuta la API y en otra Angular:

```bash
npm --prefix server run dev
npm start
```

El proxy de Angular envía `/api` a `localhost:3000`. La API carga `.env` desde la raíz del repositorio.

## Datos y arquitectura

- `server/schema.sql`: tablas e índices PostgreSQL. La API aplica el esquema al iniciar.
- `server/src/auth.js`: valida firma, emisor y audiencia de los tokens Firebase.
- `server/src/server.js`: API autenticada para perfiles, mensajes y archivos.
- `firestore` y Firebase Storage no se usan para guardar datos de la aplicación.

El registro desde una sesión invitada enlaza el correo/contraseña a la misma identidad Firebase. Después se solicita username, nombres, apellidos, edad, foto y biografía opcional.
