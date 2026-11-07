# 🚀 ZerogramJS 2.3

![Banner](banner.jpg)

> Modern, high-performance, and resilient Telegram MTProto Bot framework for Node.js and TypeScript.

[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)

ZerogramJS is an enterprise-grade framework designed for building scalable, secure, and production-ready Telegram bots using MTProto directly via GramJS. It delivers sub-millisecond routing, token-bucket rate limiting, automatic FloodWait backoff, atomic session persistence, safe entity escaping, and streaming media downloads up to 2GB.

---

## ✨ Características Principales

- 🟦 **TypeScript de Primer Nivel**: Tipado estricto completo, interfaces exportadas y soporte dual para CommonJS (`require`) y ESM (`import`).
- ⚡ **Rendimiento Extremo**: Router de alto rendimiento capaz de procesar **+20,000 actualizaciones/segundo**.
- 🛡️ **Seguridad y Sesiones Atómicas**: Persistencia atómica de sesiones (`rename` POSIX) con permisos restrictivos `0o600` / `0o700` y soporte para almacenamiento en memoria o personalizado (`SessionStorage`).
- 🚦 **Rate Limiter & Anti-FloodWait**: Cola token-bucket integrada (límites global y por chat) y reintento automático ante errores `FLOOD_WAIT` de Telegram.
- 🎯 **Enrutamiento Avanzado**: Soporte para menciones en grupos (`/command@botname`), alias de comandos, expresiones regulares (`bot.hears`), callbacks con regex y middleware en modelo cebolla.
- 🎨 **Markdown & HTML Seguro**: Conversor a HTML que sanitiza caracteres peligrosos (`<`, `>`, `&`) previniendo caídas por `can't parse entities`, con soporte para spoilers, bloques de código con lenguaje, tachado, etc.
- 📥 **Descargas y Streaming de Medios**: Streaming directo (`downloadMediaStream`), soporte de cabeceras HTTP `Range` para streaming/seeking de video, descargas concurrentes en lote y cancelación limpia con `AbortController`.
- 🩹 **safeEdit Inteligente**: Suprime silenciosamente errores `MESSAGE_NOT_MODIFIED` en barras de progreso y reintenta con backoff.
- 🎬 **FFmpeg Integrado**: Análisis de duración y generación de miniaturas desde Buffer, Stream o ruta en disco.

---

## 📦 Instalación

```bash
npm install zerogramjs
```

Dependencias del sistema opcionales (para video y audio):
- `ffmpeg` y `ffprobe` en el `PATH` del sistema.

---

## 🚀 Inicio Rápido

### En TypeScript / ESM:

```typescript
import { Zerogram, type Context } from 'zerogramjs';

const bot = new Zerogram(
    12345678,           // API ID (my.telegram.org)
    'your_api_hash',    // API Hash
    '123456:ABC-DEF...',// Bot Token (@BotFather)
    {
        debug: true,
        sessionsDir: './sessions',
        rateLimiter: true,      // Throttling inteligente activado
        autoFloodWait: true     // Manejo automático de esperas por flood
    }
);

// Middleware de autenticación / logging
bot.use(async (ctx, next) => {
    console.log(`[${new Date().toISOString()}] Mensaje de ${ctx.chatId}`);
    await next();
});

// Comando simple con Markdown enriquecido
bot.command('start', async (ctx: Context) => {
    await ctx.reply('👋 **¡Hola!** Soy tu bot profesional desarrollado con *ZerogramJS*.');
});

// Comando con argumentos
bot.command('echo', async (ctx: Context, args: string[]) => {
    const text = args.join(' ') || 'Envía texto después de /echo';
    await ctx.reply(text);
});

// Escuchar patrones de texto con expresiones regulares
bot.hears(/^ticket:(\d+)$/i, async (ctx: Context) => {
    const ticketId = ctx.match?.[1];
    await ctx.reply(`🔍 Consultando información del ticket #${ticketId}...`);
});

// Inicializar conexión
await bot.init();
```

### En CommonJS:

```javascript
const Zerogram = require('zerogramjs');

const bot = new Zerogram(12345678, 'your_api_hash', '123456:ABC-DEF...');

bot.command('start', async (ctx) => {
    await ctx.reply('¡Hola desde CommonJS!');
});

await bot.init();
```

---

## 📚 Arquitectura y API

### Constructor `new Zerogram(apiId, apiHash, botToken, options)`

| Parámetro | Tipo | Descripción | Default |
| :--- | :--- | :--- | :--- |
| `apiId` | `number` | API ID de Telegram MTProto | **Requerido** |
| `apiHash` | `string` | API Hash de Telegram | **Requerido** |
| `botToken` | `string` | Token del bot de BotFather | **Requerido** |
| `options.debug` | `boolean` | Activa logs detallados de depuración | `false` |
| `options.sessionsDir` | `string` | Directorio local de persistencia | `'sessions'` |
| `options.sessionStorage`| `SessionStorage` | Proveedor personalizado de sesión | `FileSessionManager` |
| `options.rateLimiter` | `boolean \| RateLimiterOptions` | Control de tasa global y por chat | `true` (30 req/s, 1 chat/s) |
| `options.autoFloodWait` | `boolean` | Reintenta automáticamente tras `FLOOD_WAIT` | `true` |
| `options.maxFloodWait` | `number` | Tiempo máximo de espera en segundos | `60` |
| `options.botUsername` | `string` | Username del bot para comandos grupales | Auto-detectado con `getMe()` |
| `options.autoShutdown` | `boolean` | Registra handlers SIGINT/SIGTERM | `false` |

---

## 🎯 Context (`ctx`)

Cada actualización entrante entrega una instancia tipada de `Context` con información normalizada y helpers robustos:

### Propiedades:
- `ctx.bot`: Instancia de `Zerogram`.
- `ctx.client`: Cliente MTProto subyacente (`TelegramClient`).
- `ctx.message`: Mensaje normalizado (`{ id, text, peerId, replyTo, media }`).
- `ctx.from`: `{ id, firstName, lastName, username }`.
- `ctx.chat`: `{ id, type: 'private' | 'group' | 'supergroup' | 'channel' }`.
- `ctx.chatId`: ID del chat en formato string.
- `ctx.senderId`: ID del remitente en formato string.
- `ctx.isCallback`: `true` si es una pulsación de botón inline.
- `ctx.callbackData`: Cadena raw recibida en el botón.
- `ctx.payload`: Payload posterior al delimitador `:` en callbacks.
- `ctx.match`: Resultado de la captura RegExp en `hears` o `onCallback`.
- `ctx.session`: Estado local aislado en memoria por chat/usuario.

### Métodos:

#### `ctx.reply(text, options)`
Responde al mensaje actual. Formatea automáticamente Markdown a HTML seguro y retorna el mensaje enviado decorado con el helper `msg.safeEdit(...)`.
```typescript
const msg = await ctx.reply('⏳ Procesando tarea...');
await msg.safeEdit('✅ Tarea completada con éxito.');
```

#### `ctx.safeEdit(newText, options)`
Edita el mensaje mitigando de forma nativa el error `MESSAGE_NOT_MODIFIED` de Telegram:
```typescript
await ctx.safeEdit('Progreso: 50%');
```

#### `ctx.sendFile(file, options)`
Envía fotos, documentos o videos con soporte para caption formateado y streaming:
```typescript
await ctx.sendFile('./video.mp4', {
    caption: '🎬 **Video Renderizado**',
    supportsStreaming: true
});
```

#### `ctx.answerCallback(text?, options?)`
Responde a un callback query convirtiendo de forma segura el ID a BigInt y evitando excepciones por queries expiradas:
```typescript
bot.onCallback('agree', async (ctx) => {
    await ctx.answerCallback('¡Aceptado!', { alert: false });
});
```

---

## 📥 Descargas y Streaming de Alta Eficiencia

### 1. Descarga con Progreso y Cancelación:
```typescript
const controller = new AbortController();
ctx.downloadControllers.set(ctx.senderId!, controller);

try {
    const buffer = await ctx.downloadMedia(replyMsg, {
        filePath: './downloads/archivo.zip',
        controller,
        onProgress: (p) => {
            console.log(`${p.percent.toFixed(1)}% a ${(p.speed / 1024 / 1024).toFixed(2)} MB/s`);
        }
    });
} catch (err: any) {
    if (err.message === 'DOWNLOAD_CANCELLED') {
        await ctx.reply('Descarga cancelada.');
    }
} finally {
    ctx.downloadControllers.delete(ctx.senderId!);
}
```

### 2. Streaming HTTP y Range (Video Seeking):
Ideal para servidores Fastify / Express que sirven videos de Telegram a la web:
```typescript
app.get('/stream/:id', async (req, res) => {
    const msg = await client.getMessages(channelId, { ids: [Number(req.params.id)] });
    
    // Soporte para cabeceras Range
    const range = req.headers.range ? parseRange(req.headers.range) : null;
    const stream = bot.contextFactory.create({ message: msg[0] }).downloadStream(msg[0], range);

    stream.pipe(res);
});
```

---

## 🛡️ Benchmark de Rendimiento & Test de Impacto

Ejecutado bajo Node.js con el runner nativo `--test`:

```bash
npm run test:stress
```

Resultados obtenidos en pruebas de estrés bajo uso intensivo:
- **Throughput**: **+21,000 actualizaciones/segundo** en pipeline completo (middlewares + router + parsing).
- **Concurrencia**: 1,000 callbacks en ráfaga paralela resueltos en **52 ms** sin bloqueos ni condiciones de carrera.
- **Estabilidad de Memoria**: Delta de memoria < 13 MB tras 5,000 ciclos continuos de actualización y recolección limpia.
- **Resiliencia de Streams**: 50 streams concurrentes con 50% de abortos instantáneos terminados con **0 conexiones huérfanas**.

---

## 📄 Licencia

MIT © [UserZero075](https://github.com/UserZero075)
