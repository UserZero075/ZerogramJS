"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Zerogram = void 0;
const node_events_1 = require("node:events");
const telegram_1 = require("telegram");
const sessions_1 = require("telegram/sessions");
const button_1 = require("telegram/tl/custom/button");
const debug_1 = __importDefault(require("debug"));
const Session_js_1 = require("./Session.js");
const Router_js_1 = require("./Router.js");
const Context_js_1 = require("./Context.js");
const ffmpeg_js_1 = require("./utils/ffmpeg.js");
const RateLimiter_js_1 = require("./RateLimiter.js");
const loader_js_1 = require("./utils/loader.js");
const debug = (0, debug_1.default)('zerogram');
/**
 * Main Zerogram Bot Class.
 * High-performance, stable, typed Telegram MTProto Bot framework.
 */
class Zerogram extends node_events_1.EventEmitter {
    apiId;
    apiHash;
    botToken;
    options;
    sessionManager;
    router;
    contextFactory;
    ffutil;
    rateLimiter;
    client = null;
    me = null;
    _status = 'disconnected';
    _signalCleanup = null;
    constructor(apiId, apiHash, botToken, opts = {}) {
        super();
        this._validateConfig(apiId, apiHash, botToken);
        this.apiId = apiId;
        this.apiHash = apiHash;
        this.botToken = botToken;
        const rateLimiterOpt = opts.rateLimiter !== false;
        const rateLimiterConfig = typeof opts.rateLimiter === 'object' ? opts.rateLimiter : {};
        this.rateLimiter = rateLimiterOpt ? new RateLimiter_js_1.RateLimiter({
            enabled: true,
            ...rateLimiterConfig
        }) : null;
        this.options = {
            debug: !!opts.debug,
            sessionsDir: opts.sessionsDir || 'sessions',
            maxRetries: opts.maxRetries || 3,
            retryDelay: opts.retryDelay || 2000,
            connectionRetries: opts.connectionRetries || 3,
            useWSS: opts.useWSS !== false,
            maxConcurrentDownloads: opts.maxConcurrentDownloads || 1,
            autoShutdown: !!opts.autoShutdown,
            autoFloodWait: opts.autoFloodWait !== false,
            maxFloodWait: opts.maxFloodWait || 60,
            botUsername: opts.botUsername,
            sessionStorage: opts.sessionStorage
        };
        if (this.options.debug) {
            debug_1.default.enable('zerogram*');
        }
        // Session manager initialization
        this.sessionManager = opts.sessionStorage || new Session_js_1.FileSessionManager(this.botToken, this.options.sessionsDir);
        this.router = new Router_js_1.Router();
        this.contextFactory = new Context_js_1.ContextFactory(this);
        this.ffutil = ffmpeg_js_1.FFMpegUtil.create();
        if (this.options.autoShutdown) {
            this.setupGracefulShutdown();
        }
    }
    get status() {
        return this._status;
    }
    get isInitialized() {
        return this._status === 'connected';
    }
    _validateConfig(apiId, apiHash, botToken) {
        if (!apiId || typeof apiId !== 'number' || apiId <= 0) {
            throw new Error('apiId must be a positive number');
        }
        if (!apiHash || typeof apiHash !== 'string' || apiHash.trim() === '') {
            throw new Error('apiHash must be a non-empty string');
        }
        if (!botToken || typeof botToken !== 'string' || !botToken.includes(':')) {
            throw new Error('botToken must be a valid bot token (e.g. 123456:ABC-DEF...)');
        }
    }
    /**
     * Connects and initializes the Telegram MTProto client.
     */
    async init() {
        if (this._status === 'connected' || this._status === 'connecting') {
            debug('Client is already initialized or connecting');
            return;
        }
        this._status = 'connecting';
        try {
            const sessionData = await this.sessionManager.load();
            this.client = new telegram_1.TelegramClient(new sessions_1.StringSession(sessionData), this.apiId, this.apiHash, {
                connectionRetries: this.options.connectionRetries,
                useWSS: this.options.useWSS,
                retryDelay: this.options.retryDelay,
                maxConcurrentDownloads: this.options.maxConcurrentDownloads
            });
            // Connect with backoff and FloodWait retry
            await this._connectWithRetry();
            // Persist session string
            const savedSession = this.client.session.save();
            if (typeof savedSession === 'string') {
                await this.sessionManager.save(savedSession);
            }
            // Resolve bot username if not provided
            try {
                this.me = await this.client.getMe();
                if (this.me?.username && !this.options.botUsername) {
                    this.options.botUsername = this.me.username;
                    debug(`Auto-detected bot username: @${this.me.username}`);
                }
            }
            catch (err) {
                debug('Could not fetch getMe() on init:', err?.message);
            }
            // Register global update event handler
            this.client.addEventHandler((update) => {
                this._handleUpdate(update).catch((err) => {
                    debug('Error handling update:', err);
                    this.emit('error', err);
                });
            });
            this._status = 'connected';
            this.emit('ready');
            debug('Zerogram initialized and ready');
        }
        catch (error) {
            this._status = 'disconnected';
            debug('Initialization failed:', error);
            throw error;
        }
    }
    async _connectWithRetry() {
        const { maxRetries, retryDelay, maxFloodWait } = this.options;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                debug(`Connecting to Telegram MTProto (attempt ${attempt}/${maxRetries})...`);
                await this.client.start({ botAuthToken: this.botToken });
                debug('Connected successfully');
                return;
            }
            catch (error) {
                debug(`Connection attempt ${attempt} failed:`, error?.message);
                if (error?.errorMessage === 'FLOOD') {
                    const waitTime = error.seconds || 5;
                    this.emit('floodWait', waitTime);
                    debug(`FloodWait: waiting ${waitTime}s before retry...`);
                    if (waitTime <= maxFloodWait && attempt < maxRetries) {
                        await this._sleep(waitTime * 1000);
                        continue;
                    }
                    else {
                        throw new Error(`FloodWait: required wait of ${waitTime}s exceeds threshold.`);
                    }
                }
                if (attempt === maxRetries) {
                    throw error;
                }
                await this._sleep(retryDelay * attempt);
            }
        }
    }
    async _handleUpdate(update) {
        // Ignore bot's own outgoing messages
        if (update?.message?.out)
            return;
        const ctx = this.contextFactory.create(update);
        await this.router.route(ctx, update);
    }
    /**
     * Gracefully stops the Telegram bot client.
     */
    async stop() {
        if (!this.client || this._status !== 'connected') {
            debug('Client is not connected or already stopped');
            return;
        }
        this._status = 'stopping';
        try {
            const savedSession = this.client.session.save();
            if (typeof savedSession === 'string') {
                await this.sessionManager.save(savedSession);
            }
            await this.client.disconnect();
            this._status = 'stopped';
            this.emit('stopped');
            debug('Zerogram stopped cleanly');
        }
        catch (error) {
            this._status = 'disconnected';
            debug('Error during stop:', error);
            throw error;
        }
        finally {
            if (this._signalCleanup) {
                this._signalCleanup();
                this._signalCleanup = null;
            }
        }
    }
    /**
     * Registers a command handler. Supports array of aliases.
     */
    command(name, handler) {
        this.router.addCommand(name, handler);
        return this;
    }
    /**
     * Registers a callback query handler matching string or RegExp.
     */
    onCallback(actionOrPattern, handler) {
        this.router.addCallback(actionOrPattern, handler);
        return this;
    }
    /**
     * Registers a regex or text matching handler (hears).
     */
    hears(pattern, handler) {
        this.router.addHears(pattern, handler);
        return this;
    }
    /**
     * Registers an update event handler ('message', 'photo', 'document', etc.).
     */
    on(event, handler) {
        // If event is an EventEmitter event ('ready', 'error', 'stopped', 'floodWait'), register to emitter
        if (['ready', 'error', 'unhandled', 'stopped', 'floodWait'].includes(event)) {
            super.on(event, handler);
        }
        else {
            this.router.addOn(event, handler);
        }
        return this;
    }
    /**
     * Registers a middleware function.
     */
    use(middleware) {
        this.router.addMiddleware(middleware);
        return this;
    }
    /**
     * Helper to create inline callback buttons.
     */
    static createButton(text, callbackData) {
        const dataBuf = Buffer.isBuffer(callbackData)
            ? callbackData
            : Buffer.from(String(callbackData));
        return button_1.Button.inline(text, dataBuf);
    }
    /**
     * Helper to create URL buttons.
     */
    static urlButton(text, url) {
        return button_1.Button.url(text, url);
    }
    /**
     * Loads command or callback modules automatically from disk.
     */
    static async loadModules(dir, mode, inject) {
        return (0, loader_js_1.loadModules)(dir, mode, inject);
    }
    /**
     * Retrieves chat message history.
     */
    async getHistory(chatId, options = {}) {
        if (!this.client || this._status !== 'connected') {
            throw new Error('Client is not connected');
        }
        const { limit = 100, offset = 0, fromDate, toDate } = options;
        return this.client.getMessages(chatId, {
            limit,
            offsetId: offset,
            minId: fromDate ? Math.floor(fromDate.getTime() / 1000) : undefined,
            maxId: toDate ? Math.floor(toDate.getTime() / 1000) : undefined
        });
    }
    /**
     * Configures clean graceful shutdown on SIGINT and SIGTERM.
     */
    setupGracefulShutdown() {
        const onSignal = async (sig) => {
            debug(`Received ${sig}, shutting down Zerogram gracefully...`);
            try {
                await this.stop();
            }
            catch (err) {
                debug('Error during shutdown:', err);
            }
        };
        const sigintHandler = () => onSignal('SIGINT');
        const sigtermHandler = () => onSignal('SIGTERM');
        process.once('SIGINT', sigintHandler);
        process.once('SIGTERM', sigtermHandler);
        this._signalCleanup = () => {
            process.removeListener('SIGINT', sigintHandler);
            process.removeListener('SIGTERM', sigtermHandler);
        };
        return this._signalCleanup;
    }
    /**
     * Measures latency (ping) to Telegram servers in milliseconds.
     */
    async ping() {
        if (!this.client || this._status !== 'connected') {
            throw new Error('Client is not connected');
        }
        const start = Date.now();
        await this.client.getMe();
        return Date.now() - start;
    }
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.Zerogram = Zerogram;
exports.default = Zerogram;
//# sourceMappingURL=Zerogram.js.map