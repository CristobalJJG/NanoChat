# Guía de Desarrollo

## Objetivo
Aplicación de chat Angular Nano con estética Pulse de Stitch. Firebase se usa exclusivamente para autenticación; perfiles, mensajes y archivos viven en PostgreSQL local.

## Stack
- **Frontend:** Angular standalone, Signals y Tailwind CSS.
- **API:** Node.js, Express y PostgreSQL (`pg`).
- **Autenticación:** Firebase Auth en cliente; la API verifica los ID tokens con las claves públicas de Firebase.
- **Multimedia:** fotos, audio, vídeo y PDF se almacenan como `BYTEA` en PostgreSQL.
- **Desarrollo/producción local:** Docker Compose con `web`, `api` y `postgres`.

## Seguridad
1. Nunca aceptar un UID enviado por el cliente como identidad; obtenerlo del token Firebase validado por la API.
2. Validar tipo real, tamaño y contenido de archivos en el backend, además de las restricciones de interfaz.
3. Usar consultas SQL parametrizadas y restricciones de PostgreSQL para username único y propiedad de archivos.
4. No exponer edad ni datos de perfil privados en endpoints públicos o mensajes.
5. Mantener credenciales PostgreSQL en `.env`; no copiar `.env` a imágenes Docker ni al bundle Angular.

## Comandos
- `docker compose up --build`: inicia la aplicación completa.
- `npm run build`: compila Angular.
- `npm --prefix server run dev`: inicia la API local para desarrollo.