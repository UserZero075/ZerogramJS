const { EventEmitter } = require('events');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Button } = require('telegram/tl/custom/button');
const debug = require('debug')('zerogram');

const SessionManager = require('./Session');
const Router = require('./Router');
const ContextFactory = require('./Context');
const { FFMpegUtil } = require('../utils/ffmpeg');

/**
 * Clase principal de Zerogram
 * @extends EventEmitter
 */
class Zerogram extends EventEmitter {
    /**
     * @param {number} apiId - Telegram API ID
     * @param {string} apiHash - Telegram API Hash
     * @param {string} botToken - Bot token from @BotFather
     * @param {Object} opts - Opciones adicionales
     * @param {boolean} opts.debug - Activar modo debug
     * @param {string} opts.sessionsDir - Directorio para sesiones
     * @param {number} opts.maxRetries - Máximo de reintentos de conexión
     * @param {number} opts.retryDelay - Delay entre reintentos (ms)
     */
    constructor(apiId, apiHash, botToken, opts = {}) {
        super();

        this._validateConfig(apiId, apiHash, botToken);

        this.apiId = apiId;
        this.apiHash = apiHash;
        this.botToken = botToken;

        // Opciones
        this.options = {
            debug: !!opts.debug,
            sessionsDir: opts.sessionsDir || 'sessions',
            maxRetries: opts.maxRetries || 3,
            retryDelay: opts.retryDelay || 2000,
            connectionRetries: opts.connectionRetries || 3,
            useWSS: opts.useWSS !== false,
            maxConcurrentDownloads: opts.maxConcurrentDownloads || 1
        };

        // Componentes internos
        this.sessionManager = new SessionManager(this.botToken, this.options.sessionsDir);
        this.router = new Router();
        this.contextFactory = new ContextFactory(this);
        this.ffutil = FFMpegUtil.create();

        // Estado
        this.client = null;
        this._initialized = false;

        // Manejo de señales del sistema
        this._setupSignalHandlers();
    }

    /**
     * Valida la configuración inicial
     * @private
     */
    _validateConfig(apiId, apiHash, botToken) {
        if (!apiId || typeof apiId !== 'number') {
            throw new Error('apiId must be a valid number');
        }
        if (!apiHash || typeof apiHash !== 'string') {
            throw new Error('apiHash must be a valid string');
        }
        if (!botToken || typeof botToken !== 'string' || !botToken.includes(':')) {
            throw new Error('botToken must be a valid bot token');
        }
    }

    /**
     * Configura manejadores de señales del sistema
     * @private
     */
    _setupSignalHandlers() {
        const shutdown = async (signal) => {
            debug(`Received ${signal}, shutting down gracefully...`);
            await this.stop();
            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
    }

    /**
     * Inicializa el cliente de Telegram
     * @returns {Promise<void>}
     */
    async init() {
        if (this._initialized) {
            debug('Client already initialized');
            return;
        }

        try {
            // Cargar sesión existente
            const sessionData = await this.sessionManager.load();

            // Crear cliente
            this.client = new TelegramClient(
                new StringSession(sessionData),
                this.apiId,
                this.apiHash,
                {
                    connectionRetries: this.options.connectionRetries,
                    useWSS: this.options.useWSS,
                    retryDelay: this.options.retryDelay,
                    maxConcurrentDownloads: this.options.maxConcurrentDownloads
                }
            );

            // Conectar con reintentos
            await this._connectWithRetry();

            // Guardar sesión
            await this.sessionManager.save(this.client.session.save());

            // Configurar router
            this.client.addEventHandler((update) =>
                this._handleUpdate(update).catch((err) => {
                    debug('Error handling update:', err);
                    this.emit('error', err);
                })
            );

            this._initialized = true;
            this.emit('ready');
            debug('Client initialized successfully');
        } catch (error) {
            debug('Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Conecta al cliente con manejo de reintentos y FloodWait
     * @private
     */
    async _connectWithRetry() {
        const { maxRetries, retryDelay } = this.options;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                debug(`Connection attempt ${attempt}/${maxRetries}`);
                await this.client.start({ botAuthToken: this.botToken });
                debug('Connection successful');
                return;
            } catch (error) {
                debug(`Connection attempt ${attempt} failed:`, error.message);

                // Manejo de FloodWait
                if (error.errorMessage === 'FLOOD') {
                    const waitTime = error.seconds || 300;
                    console.warn(`⏰ FloodWait: waiting ${waitTime}s before retry...`);

                    if (attempt < maxRetries) {
                        await this._sleep(waitTime * 1000);
                        continue;
                    } else {
                        throw new Error(`FloodWait: Must wait ${waitTime}s. Try again later.`);
                    }
                }

                // Último intento fallido
                if (attempt === maxRetries) {
                    throw error;
                }

                // Esperar antes del siguiente intento
                await this._sleep(retryDelay * attempt);
            }
        }
    }

    /**
     * Maneja actualizaciones de Telegram
     * @private
     */
    async _handleUpdate(update) {
        // Ignorar mensajes salientes
        if (update?.message?.out) return;

        const ctx = this.contextFactory.create(update);
        await this.router.route(ctx, update);
    }

    /**
     * Detiene el cliente
     * @returns {Promise<void>}
     */
    async stop() {
        if (!this.client || !this._initialized) {
            debug('Client not initialized or already stopped');
            return;
        }

        try {
            await this.sessionManager.save(this.client.session.save());
            await this.client.disconnect();
            this._initialized = false;
            this.emit('stopped');
            debug('Client stopped successfully');
        } catch (error) {
            debug('Error during stop:', error);
            throw error;
        }
    }

    /**
     * Registra un comando
     * @param {string} name - Nombre del comando (sin /)
     * @param {Function} handler - Función manejadora (ctx, args) => {}
     */
    command(name, handler) {
        if (typeof name !== 'string' || !name) {
            throw new Error('Command name must be a non-empty string');
        }
        if (typeof handler !== 'function') {
            throw new Error('Command handler must be a function');
        }
        this.router.addCommand(name, handler);
        debug(`Command registered: ${name}`);
    }

    /**
     * Registra un callback handler
     * @param {string} action - Nombre de la acción
     * @param {Function} handler - Función manejadora
     */
    onCallback(action, handler) {
        if (typeof action !== 'string' || !action) {
            throw new Error('Callback action must be a non-empty string');
        }
        if (typeof handler !== 'function') {
            throw new Error('Callback handler must be a function');
        }
        this.router.addCallback(action, handler);
        debug(`Callback registered: ${action}`);
    }

    /**
     * Registra un middleware
     * @param {Function} middleware - Función middleware (ctx, next) => {}
     */
    use(middleware) {
        if (typeof middleware !== 'function') {
            throw new Error('Middleware must be a function');
        }
        this.router.addMiddleware(middleware);
        debug('Middleware registered');
    }

    /**
     * Helper para crear botones inline
     * @static
     */
    static createButton(text, callbackData) {
        const dataBuf = Buffer.isBuffer(callbackData)
            ? callbackData
            : Buffer.from(String(callbackData));
        return Button.inline(text, dataBuf);
    }

    /**
     * Helper para crear botones URL
     * @static
     */
    static urlButton(text, url) {
        return Button.url(text, url);
    }

    /**
     * Obtiene el historial de mensajes de un chat
     * @param {string|number} chatId - ID del chat
     * @param {Object} options - Opciones
     * @param {number} options.limit - Número máximo de mensajes (default: 100)
     * @param {number} options.offset - Offset para paginación
     * @param {Date} options.fromDate - Fecha desde la cual obtener mensajes
     * @param {Date} options.toDate - Fecha hasta la cual obtener mensajes
     * @returns {Promise<Array>} Array de mensajes
     */
    async getHistory(chatId, options = {}) {
        if (!this.client || !this._initialized) {
            throw new Error('Client not initialized');
        }

        const {
            limit = 100,
            offset = 0,
            fromDate,
            toDate
        } = options;

        try {
            const messages = await this.client.getMessages(chatId, {
                limit,
                offsetId: offset,
                minId: fromDate ? Math.floor(fromDate.getTime() / 1000) : undefined,
                maxId: toDate ? Math.floor(toDate.getTime() / 1000) : undefined
            });

            return messages;
        } catch (error) {
            debug('Error getting history:', error);
            throw error;
        }
    }

    /**
     * Utilidad para sleep
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = Zerogram;