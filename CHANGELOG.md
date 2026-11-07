# Changelog

Todas las novedades y cambios notables de este proyecto están documentados en este archivo.

## [2.3.0] - 2026-11-07

### Añadido
- **Migración integral a TypeScript**: Tipado estricto completo (`src/`), generación de tipos `.d.ts`, sourcemaps y build optimizado en `dist/`.
- **Soporte Híbrido CJS y ESM**: Empaquetado dual sin breaking changes con shims en `lib/`, `shared/` y `utils/`.
- **RateLimiter (Token-Bucket)**: Cola de control de tasa con límites configurables global (30 req/s) y por chat (1 req/s) para evitar bloqueos de la API MTProto.
- **Manejo automático de FloodWait**: Interceptación y reintento automático con backoff ante errores `FLOOD` / `FLOOD_WAIT_X` de Telegram (`autoFloodWait`, `maxFloodWait`).
- **Persistencia atómica de sesiones**: `FileSessionManager` mediante escritura en archivo temporal y renombrado atómico POSIX (`fs.rename`) con permisos restrictivos `0o600` / `0o700` y sanitización contra path traversal.
- **Abstracción `SessionStorage`**: Soporte para almacenamiento personalizado o en memoria (`MemorySessionStorage`).
- **Comandos grupales con mención**: Reconocimiento de `/command@botname` y filtrado selectivo según el bot de destino.
- **Alias de comandos**: Admite arrays de nombres en `bot.command(['start', 'help'], handler)`.
- **Expresiones regulares en texto (`bot.hears`)**: Matching con RegExp y parámetros capturados en `ctx.match`.
- **Callbacks con Regex**: Soporte para matching por expresión regular en `bot.onCallback`.
- **safeEdit con supresión de `MESSAGE_NOT_MODIFIED`**: Edición segura sin excepciones al enviar contenidos idénticos en barras de progreso.
- **Suite de pruebas y test de estrés**: 33 pruebas unitarias y benchmarks de alto impacto bajo uso intensivo (`npm run test:stress`).

### Mejoras & Correcciones
- **Sanitización HTML en Markdown**: Corrección de fallos por entidades no escapadas (`<`, `>`, `&`) manteniendo formato en código, enlaces y spoilers.
- **Resiliencia en Streaming**: Cierre inmediato y descarte de conexiones huérfanas en `downloadMediaStream` y `downloadStream` ante desconexión del consumidor o aborto por señal.
- **Descargas por lotes concurrentes**: `downloadMediaBatch` ahora soporta control de concurrencia mediante worker pool.

---

## [2.2.0] - 2026-06-05

### Añadido
- Método `downloadStream()` con soporte de cabeceras HTTP Range (`{ start, end }`) para streaming de medios y video seeking.
- `downloadStream` expuesto directamente en el `Context`.
- Manejo de offsets con `big-integer`.

### Correcciones
- Guardas para peers nulos (`NO_REPLY_PEER`) en `reply()`, `send()` y `sendFile()`.

---

## [2.1.0] - 2026-04-11

- Versión base inicial con enrutamiento de comandos, callbacks, middlewares, sesiones locales y utilidades de FFmpeg.
