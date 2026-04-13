
# 🚀 ZerogramJS 2.1

![Banner](banner.jpg)

Framework moderno y elegante para crear bots de Telegram con Node.js.

## ✨ Características

- 🎯 **API Simple**: Sintaxis clara y expresiva
- 📦 **Modular**: Arquitectura bien organizada
- ⚡ **Descargas Avanzadas**: Con progreso, lotes y cancelación
- 🎨 **Markdown Personalizado**: Soporte para formateo rico
- 🎬 **FFmpeg Integrado**: Generación de thumbnails y análisis de videos
- 🔄 **Middleware**: Sistema de middlewares tipo Express
- 💾 **Sesiones**: Persistencia automática
- 🛡️ **Robusto**: Manejo de errores y reintentos automáticos

---

## 📦 Instalación

```bash
npm install telegram debug
```

Copia la carpeta `zerogram/` a tu proyecto.

---

## 🚀 Inicio Rápido

```javascript
const Zerogram = require('./zerogram');

const bot = new Zerogram(
    12345678,           // API ID
    'your_api_hash',    // API Hash
    'bot:token',        // Bot Token
    {
        debug: true,
        sessionsDir: './sessions'
    }
);

// Inicializar
await bot.init();

// Comando simple
bot.command('start', async (ctx) => {
    await ctx.reply('¡Hola! Soy tu bot 🤖');
});

// Comando con argumentos
bot.command('echo', async (ctx, args) => {
    await ctx.reply(args.join(' ') || 'Envía algo para hacer echo');
});
```

---

## 📚 API Reference

### Constructor

```javascript
new Zerogram(apiId, apiHash, botToken, options)
```

**Parámetros:**
- `apiId` (number): Tu API ID de Telegram
- `apiHash` (string): Tu API Hash
- `botToken` (string): Token del bot de @BotFather
- `options` (object):
  - `debug` (boolean): Activar logs de debug
  - `sessionsDir` (string): Directorio para sesiones
  - `maxRetries` (number): Reintentos de conexión (default: 3)
  - `retryDelay` (number): Delay entre reintentos en ms (default: 2000)

### Métodos Principales

#### `bot.init()`
Inicializa la conexión con Telegram.

```javascript
await bot.init();
```

#### `bot.command(name, handler)`
Registra un comando.

```javascript
bot.command('help', async (ctx, args) => {
    await ctx.reply('**Comandos disponibles:**\n/start\n/help');
});
```

#### `bot.onCallback(action, handler)`
Registra un callback para botones inline.

```javascript
bot.onCallback('like', async (ctx) => {
    await ctx.client.sendMessage(ctx.userId, {
        message: '¡Te gustó! ❤️'
    });
});
```

#### `bot.use(middleware)`
Registra un middleware.

```javascript
bot.use(async (ctx, next) => {
    console.log('Nueva actualización:', ctx.update);
    await next();
});
```

#### `bot.stop()`
Detiene el bot de forma segura.

```javascript
await bot.stop();
```

---

## 🎯 Context (ctx)

Cada handler recibe un objeto `ctx` enriquecido:

### Propiedades

- `ctx.bot`: Instancia del bot
- `ctx.client`: Cliente de Telegram
- `ctx.update`: Actualización raw de Telegram
- `ctx.message`: Objeto del mensaje

### Métodos

#### `ctx.reply(text, options)`
Responde al mensaje actual.

```javascript
await ctx.reply('**Negrita**, __cursiva__, `código`');
```

#### `ctx.send(text, options)`
Envía un mensaje al chat actual.

```javascript
await ctx.send('Hola mundo', { parseMode: 'html' });
```

#### `ctx.sendFile(file, options)`
Envía un archivo.

```javascript
await ctx.sendFile('./photo.jpg', {
    caption: 'Mira esta foto'
});
```

#### `ctx.getReplyMessage()`
Obtiene el mensaje al que se está respondiendo.

```javascript
const replyMsg = await ctx.getReplyMessage();
if (replyMsg) {
    console.log('Respondiendo a:', replyMsg.text);
}
```

#### `ctx.downloadMedia(message, options)`
Descarga medios con progreso.

```javascript
const buffer = await ctx.downloadMedia(message, {
    filePath: './downloads/video.mp4',
    onProgress: (progress) => {
        console.log(`${progress.percent.toFixed(1)}% - ${progress.speed} bytes/s`);
    }
});
```

#### `ctx.downloadMediaBatch(messages, options)`
Descarga múltiples archivos.

```javascript
const results = await ctx.downloadMediaBatch(messages, {
    dir: './downloads',
    onProgress: (p) => {
        console.log(`Archivo ${p.index}/${p.total}: ${p.percent.toFixed(1)}%`);
    }
});
```

#### `ctx.thumbFromVideo(buffer, options)`
Genera un thumbnail de un video.

```javascript
const thumbnail = await ctx.thumbFromVideo(videoBuffer, {
    seek: 1.5,   // Segundo 1.5
    width: 320
});
```

---

## 🎨 Formato de Texto

Zerogram soporta markdown personalizado:

```javascript
await ctx.reply('**Negrita**');
await ctx.reply('__Cursiva__');
await ctx.reply('`Código`');
await ctx.reply('[Link](https://example.com)');
```

---

## 🔘 Botones

### Inline Buttons

```javascript
const Zerogram = require('./zerogram');

// Crear botones
const buttons = [
    [
        Zerogram.createButton('👍 Like', 'like:123'),
        Zerogram.createButton('👎 Dislike', 'dislike:123')
    ],
    [
        Zerogram.urlButton('🌐 Website', 'https://example.com')
    ]
];

await ctx.reply('¿Te gusta?', { buttons });

// Manejar callback
bot.onCallback('like', async (ctx) => {
    await ctx.client.answerCallbackQuery(ctx.queryId, {
        message: '¡Gracias!',
        alert: false
    });
});
```

---

## 🔄 Middlewares

Los middlewares se ejecutan antes de los handlers:

```javascript
// Logger
bot.use(async (ctx, next) => {
    console.log(`[${new Date().toISOString()}] Update received`);
    await next();
});

// Auth
bot.use(async (ctx, next) => {
    const userId = ctx.message?.peerId?.userId;
    if (!isAllowed(userId)) {
        await ctx.reply('No autorizado');
        return; // No llamar a next()
    }
    await next();
});

// Error handler
bot.use(async (ctx, next) => {
    try {
        await next();
    } catch (error) {
        console.error('Error:', error);
        await ctx.reply('❌ Ocurrió un error');
    }
});
```

---

## 📥 Descargas Avanzadas

### Con Cancelación

```javascript
const controller = new AbortController();

// Guardar en map global
ctx.downloadControllers.set(userId, controller);

try {
    const buffer = await ctx.downloadMedia(message, {
        controller,
        onProgress: (p) => {
            statusMsg.safeEdit(`Descargando: ${p.percent.toFixed(1)}%`);
        }
    });
} catch (error) {
    if (error.message === 'DOWNLOAD_CANCELLED') {
        await ctx.reply('⚠️ Descarga cancelada');
    }
}

// Para cancelar:
const controller = ctx.downloadControllers.get(userId);
if (controller) {
    controller.abort();
}
```

### Descarga en Lote

```javascript
const messages = await ctx.client.getMessages(chatId, { limit: 10 });

const results = await ctx.downloadMediaBatch(messages, {
    dir: './downloads',
    onProgress: (p) => {
        statusMsg.safeEdit(
            `📥 Descargando archivo ${p.index}/${p.total}\n` +
            `Progreso: ${p.overallPercent.toFixed(1)}%\n` +
            `Velocidad: ${formatSpeed(p.speed)}`
        );
    }
});

console.log('Descargados:', results.map(r => r.filePath));
```

---

## 🎬 FFmpeg

Zerogram incluye utilidades para trabajar con videos:

```javascript
// Generar thumbnail
const thumbnail = await ctx.thumbFromVideo(videoBuffer, {
    seek: 2.5,      // Capturar en el segundo 2.5
    width: 320,     // Ancho del thumbnail
    timeout: 10000  // Timeout en ms
});

await ctx.sendFile(thumbnail, {
    caption: 'Thumbnail del video'
});

// Obtener duración
const duration = await ctx.bot.ffutil.duration(videoBuffer);
console.log(`Duración: ${duration}s`);
```

---

## 📁 Carga Automática de Módulos

### Estructura de carpetas

```
my-bot/
├── commands/
│   ├── start.js
│   ├── help.js
│   └── download.js
├── callbacks/
│   └── actions.js
└── index.js
```

### commands/start.js

```javascript
module.exports = async (ctx) => {
    await ctx.reply('¡Bienvenido! 👋');
};
```

### callbacks/actions.js

```javascript
module.exports = {
    like: async (ctx) => {
        await ctx.reply('¡Te gustó! ❤️');
    },
    
    dislike: async (ctx) => {
        await ctx.reply('No te gustó 💔');
    }
};
```

### index.js

```javascript
const Zerogram = require('./zerogram');
const path = require('path');

const bot = new Zerogram(apiId, apiHash, botToken);
await bot.init();

// Cargar comandos
await Zerogram.loadModules(
    path.join(__dirname, 'commands'),
    'command',
    (name, handler) => bot.command(name, handler)
);

// Cargar callbacks
await Zerogram.loadModules(
    path.join(__dirname, 'callbacks'),
    'callback',
    (name, handler) => bot.onCallback(name, handler)
);
```

---

## 🛡️ Manejo de Errores

### FloodWait Automático

Zerogram maneja automáticamente los errores de FloodWait:

```javascript
// Se reintentará automáticamente después del tiempo requerido
await bot.init();
```

### Eventos

```javascript
bot.on('ready', () => {
    console.log('✅ Bot iniciado');
});

bot.on('error', (error) => {
    console.error('❌ Error:', error);
});

bot.on('unhandled', (ctx) => {
    console.log('⚠️ Update no manejado:', ctx.update);
});

bot.on('stopped', () => {
    console.log('🛑 Bot detenido');
});
```

---

## 📝 Ejemplos Completos

### Bot de Descargas

```javascript
const Zerogram = require('./zerogram');
const path = require('path');

const bot = new Zerogram(apiId, apiHash, botToken);
await bot.init();

bot.command('download', async (ctx) => {
    const replyMsg = await ctx.getReplyMessage();
    
    if (!replyMsg?.media) {
        return ctx.reply('❌ Responde a un archivo para descargarlo');
    }

    const statusMsg = await ctx.reply('📥 Descargando...');
    const userId = ctx.message.peerId.userId.toString();
    const controller = new AbortController();
    
    ctx.downloadControllers.set(userId, controller);

    try {
        await ctx.downloadMedia(replyMsg, {
            filePath: path.join('./downloads', `file_${Date.now()}`),
            controller,
            onProgress: (p) => {
                statusMsg.safeEdit(
                    `📥 Descargando: ${p.percent.toFixed(1)}%\n` +
                    `Velocidad: ${(p.speed / 1024 / 1024).toFixed(2)} MB/s`
                );
            }
        });

        await statusMsg.safeEdit('✅ Descarga completada');
    } catch (error) {
        if (error.message === 'DOWNLOAD_CANCELLED') {
            await statusMsg.safeEdit('⚠️ Descarga cancelada');
        } else {
            await statusMsg.safeEdit('❌ Error en la descarga');
        }
    } finally {
        ctx.downloadControllers.delete(userId);
    }
});

bot.command('cancel', async (ctx) => {
    const userId = ctx.message.peerId.userId.toString();
    const controller = ctx.downloadControllers.get(userId);
    
    if (controller) {
        controller.abort();
        await ctx.reply('🛑 Cancelando descarga...');
    } else {
        await ctx.reply('⚠️ No hay descargas en curso');
    }
});
```

---

## 🔧 Configuración Avanzada

### Variables de Entorno

```bash
# FFmpeg paths (opcional)
export FFMPEG_PATH=/usr/bin/ffmpeg
export FFPROBE_PATH=/usr/bin/ffprobe

# Debug
export DEBUG=zerogram*
```

### Opciones de Cliente

```javascript
const bot = new Zerogram(apiId, apiHash, botToken, {
    debug: true,
    sessionsDir: './sessions',
    maxRetries: 5,
    retryDelay: 3000,
    connectionRetries: 3,
    useWSS: true,
    maxConcurrentDownloads: 2
});
```

---

## 📄 Licencia

MIT

---

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

---

## 💡 Tips

1. **Usa `safeEdit`** para editar mensajes sin errores si el mensaje ya fue eliminado
2. **Cancela descargas** guardando el `AbortController` en un Map global
3. **Middlewares** son perfectos para logging, auth y error handling
4. **Carga automática** mantiene tu código organizado en archivos separados
5. **FFmpeg** requiere tener instalado ffmpeg y ffprobe en tu sistema

---

## 📞 Soporte

- Issues: [GitHub Issues]
- Telegram: [https://t.me/Projects0075]
- Docs: [https://userzero075.github.io/zerogramjs-web/docs/]

---

**Made with ❤️ for the Telegram Bot community**
```
