# Gimnasio Seguro

Sistema web seguro para un gimnasio: clientes, membresías y asistencia.
Proyecto 2 de ISW-622 Pruebas de Software (UTN, Sede San Carlos), III Cuatrimestre 2026.

**Integrantes:** Daniela Rojas Chaves y Brandon Prado Mora.

## Tecnología

| Capa | Herramienta | Por qué |
|---|---|---|
| Backend | Node.js + Express 5 | Ya lo usamos en Programación Web II |
| Vistas | EJS | `<%= %>` escapa HTML automáticamente (XSS) |
| Base de datos | PostgreSQL | Relacional; consultas parametrizadas con `pg` |
| Contraseñas | Argon2id (`argon2`) | Aceptado por UTN-02 |
| Sesión | `express-session` + `connect-pg-simple` | Sesión en el servidor, cookie solo con un id |
| Encabezados HTTP | `helmet` | CSP, X-Frame-Options, nosniff, HSTS |
| CSRF | `csrf-sync` | Token sincronizado guardado en la sesión |
| Pruebas | Playwright | Un comando (`npm test`) y reporte HTML/XML |

## Instalación local (Windows)

1. Instalar dependencias: `npm install`
2. En pgAdmin crear una base vacía llamada `gimnasio_seguro`.
3. Copiar `.env.example` como `.env` y poner la contraseña de PostgreSQL en `DATABASE_URL`.
4. Crear tablas y datos de ejemplo: `npm run db:init`
5. Arrancar: `npm start` y abrir http://localhost:3000

## Variables de entorno

| Variable | Ejemplo | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto de la app |
| `DATABASE_URL` | `postgresql://postgres:clave@localhost:5432/gimnasio_seguro` | Conexión a PostgreSQL |
| `DB_SSL` | `false` | `true` si la base está en la nube |
| `SESSION_SECRET` | (cadena aleatoria de 32+ caracteres) | Firma la cookie de sesión |
| `SESSION_TIMEOUT_SECONDS` | `60` | Inactividad máxima (UTN-07c) |
| `NODE_ENV` | `development` / `production` | En producción la cookie es `Secure` |

## Credenciales de prueba (datos ficticios)

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `Admin#Gym2026` | SuperAdmin |
| `auditor` | `Auditor#Gym2026` | Auditor |
| `recepcion` | `Recepcion#Gym2026` | Recepción |

## Scripts de base de datos

- `db/01_schema.sql`: tablas, llaves y restricciones.
- `db/02_seed.sql`: roles, permisos, usuarios y clientes de ejemplo (fechas relativas al día de carga).

## Ambiente publicado

- Aplicación: https://gimnasio-seguro-utn.onrender.com (HTTPS)
- Hosting: Render, plan gratuito. `render.yaml` crea la base PostgreSQL y la aplicación web (New + → Blueprint).
- Al arrancar, `npm run start:render` crea las tablas y los datos de ejemplo solo si la base está vacía.
- Tras unos 15 minutos sin uso la app se suspende y la primera carga tarda cerca de un minuto.
- Secretos (`DATABASE_URL`, `SESSION_SECRET`) solo en las variables de entorno de Render, nunca en el repositorio.

## Pruebas automatizadas de seguridad (UTN-10)

Requisitos: `npm install` y una sola vez `npx playwright install chromium`.

| Comando | Qué hace |
|---|---|
| `npm test` | Corre los 15 casos contra http://localhost:3000 (levanta la app si no está corriendo) |
| `$env:BASE_URL="https://..."; npm test` | Corre los casos contra el sistema publicado |
| `npm run test:reporte` | Abre el reporte HTML (`playwright-report/`). El XML queda en `test-results/resultados.xml` |

| Caso | Requerimiento | Qué valida |
|---|---|---|
| TC-01 | UTN-07a | Login con `' OR '1'='1` es rechazado |
| TC-02 | UTN-07a | Búsqueda con `UNION SELECT` no expone datos |
| TC-03 | UTN-07b | XSS reflejado en la URL no se ejecuta |
| TC-04 | UTN-07b | XSS almacenado (`<img onerror>`) no se ejecuta |
| TC-05 | UTN-07c | La sesión se cierra tras más de 60 s sin actividad |
| TC-06 | UTN-06 | Auditor recibe 403 en la URL de roles, sin trazas |
| TC-07 | UTN-05 | Recepción recibe 403 al borrar un usuario por la API |
| TC-08 | UTN-07d | Formulario sin token o con token falso es rechazado |
| TC-09 | UTN-07c | Cookie HttpOnly, SameSite y sin datos del usuario |
| TC-10 | UTN-08 | CSP, X-Frame-Options y nosniff presentes |
| TC-11 | UTN-07c | Sin sesión ninguna ruta privada responde |
| TC-12 | UTN-09 | El 403 a la bitácora queda registrado |
| TC-13 | UTN-05 | Auditor no puede vender (falta permiso Crear) |
| TC-14 | Dato sensible | Auditor no ve el contacto de emergencia |
| TC-15 | UTN-02 | Mismo mensaje para usuario inexistente y clave incorrecta |
