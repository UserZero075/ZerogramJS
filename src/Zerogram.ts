import { EventEmitter } from 'node:events';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Button } from 'telegram/tl/custom/button';
import createDebug from 'debug';

import { FileSessionManager } from './Session.js';
import { Router } from './Router.js';
import { ContextFactory } from './Context.js';
import { FFMpegUtil } from './utils/ffmpeg.js';
import { RateLimiter, executeWithFloodWait } from './RateLimiter.js';
import { loadModules } from './utils/loader.js';
import type {
    ZerogramOptions,
    ZerogramStatus,
    SessionStorage,
    CommandHandler,
    CallbackHandler,
    HearsHandler,
    EventHandler,
    Middleware
} from './types/index.js';

const debug = createDebug('zerogram');

/**
 * Main Zerogram Bot Class.
 * High-performance, stable, typed Telegram MTProto Bot framework.
 */
export class Zerogram extends EventEmitter {
    public readonly apiId: number;
    public readonly apiHash: string;
    public readonly botToken: string;
    public readonly options: Required<Omit<ZerogramOptions, 'sessionStorage' | 'rateLimiter' | 'botUsername'>> & {
        sessionStorage?: SessionStorage;
        rateLimiter?: RateLimiter;
        botUsername?: string;
    };

    public readonly sessionManager: SessionStorage;
    public readonly router: Router;
    public readonly contextFactory: ContextFactory;
    public readonly ffutil: FFMpegUtil;
    public readonly rateLimiter: RateLimiter | null;

    public client: TelegramClient | null = null;
    public me: any = null;
    private _status: ZerogramStatus = 'disconnected';
    private _signalCleanup: (() => void) | null = null;

    constructor(apiId: number, apiHash: string, botToken: string, opts: ZerogramOptions = {}) {
        super();

        this._validateConfig(apiId, apiHash, botToken);

        this.apiId = apiId;
        this.apiHash = apiHash;
        this.botToken = botToken;

        const rateLimiterOpt = opts.rateLimiter !== false;
        const rateLimiterConfig = typeof opts.rateLimiter === 'object' ? opts.rateLimiter : {};

        this.rateLimiter = rateLimiterOpt ? new RateLimiter({
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
            createDebug.enable('zerogram*');
        }

        // Session manager initialization
        this.sessionManager = opts.sessionStorage || new FileSessionManager(this.botToken, this.options.sessionsDir);
        this.router = new Router();
        this.contextFactory = new ContextFactory(this);
        this.ffutil = FFMpegUtil.create();

        if (this.options.autoShutdown) {
            this.setupGracefulShutdown();
        }
    }

    get status(): ZerogramStatus {
        return this._status;
    }

    get isInitialized(): boolean {
        return this._status === 'connected';
    }

    private _validateConfig(apiId: number, apiHash: string, botToken: string): void {
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
    async init(): Promise<void> {
        if (this._status === 'connected' || this._status === 'connecting') {
            debug('Client is already initialized or connecting');
            return;
        }

        this._status = 'connecting';

        try {
            const sessionData = await this.sessionManager.load();

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
            } catch (err: any) {
                debug('Could not fetch getMe() on init:', err?.message);
            }

            // Register global update event handler
            this.client.addEventHandler((update: any) => {
                this._handleUpdate(update).catch((err: any) => {
                    debug('Error handling update:', err);
                    this.emit('error', err);
                });
            });

            this._status = 'connected';
            this.emit('ready');
            debug('Zerogram initialized and ready');
        } catch (error) {
            this._status = 'disconnected';
            debug('Initialization failed:', error);
            throw error;
        }
    }

    private async _connectWithRetry(): Promise<void> {
        const { maxRetries, retryDelay, maxFloodWait } = this.options;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                debug(`Connecting to Telegram MTProto (attempt ${attempt}/${maxRetries})...`);
                await this.client!.start({ botAuthToken: this.botToken });
                debug('Connected successfully');
                return;
            } catch (error: any) {
                debug(`Connection attempt ${attempt} failed:`, error?.message);

                if (error?.errorMessage === 'FLOOD') {
                    const waitTime = error.seconds || 5;
                    this.emit('floodWait', waitTime);
                    debug(`FloodWait: waiting ${waitTime}s before retry...`);

                    if (waitTime <= maxFloodWait && attempt < maxRetries) {
                        await this._sleep(waitTime * 1000);
                        continue;
                    } else {
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

    private async _handleUpdate(update: any): Promise<void> {
        // Ignore bot's own outgoing messages
        if (update?.message?.out) return;

        const ctx = this.contextFactory.create(update);
        await this.router.route(ctx, update);
    }

    /**
     * Gracefully stops the Telegram bot client.
     */
    async stop(): Promise<void> {
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
        } catch (error) {
            this._status = 'disconnected';
            debug('Error during stop:', error);
            throw error;
        } finally {
            if (this._signalCleanup) {
                this._signalCleanup();
                this._signalCleanup = null;
            }
        }
    }

    /**
     * Registers a command handler. Supports array of aliases.
     */
    command(name: string | string[], handler: CommandHandler): this {
        this.router.addCommand(name, handler);
        return this;
    }

    /**
     * Registers a callback query handler matching string or RegExp.
     */
    onCallback(actionOrPattern: string | RegExp, handler: CallbackHandler): this {
        this.router.addCallback(actionOrPattern, handler);
        return this;
    }

    /**
     * Registers a regex or text matching handler (hears).
     */
    hears(pattern: string | RegExp, handler: HearsHandler): this {
        this.router.addHears(pattern, handler);
        return this;
    }

    /**
     * Registers an update event handler ('message', 'photo', 'document', etc.).
     */
    on(event: string, handler: EventHandler): this {
        // If event is an EventEmitter event ('ready', 'error', 'stopped', 'floodWait'), register to emitter
        if (['ready', 'error', 'unhandled', 'stopped', 'floodWait'].includes(event)) {
            super.on(event, handler as any);
        } else {
            this.router.addOn(event, handler);
        }
        return this;
    }

    /**
     * Registers a middleware function.
     */
    use(middleware: Middleware): this {
        this.router.addMiddleware(middleware);
        return this;
    }

    /**
     * Helper to create inline callback buttons.
     */
    static createButton(text: string, callbackData: string | Buffer): any {
        const dataBuf = Buffer.isBuffer(callbackData)
            ? callbackData
            : Buffer.from(String(callbackData));
        return Button.inline(text, dataBuf);
    }

    /**
     * Helper to create URL buttons.
     */
    static urlButton(text: string, url: string): any {
        return Button.url(text, url);
    }

    /**
     * Loads command or callback modules automatically from disk.
     */
    static async loadModules(dir: string, mode: 'command' | 'callback', inject: (name: string, handler: any) => void): Promise<{ loaded: string[]; failed: string[] }> {
        return loadModules(dir, mode, inject);
    }

    /**
     * Retrieves chat message history.
     */
    async getHistory(chatId: string | number, options: { limit?: number; offset?: number; fromDate?: Date; toDate?: Date } = {}): Promise<any[]> {
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
    setupGracefulShutdown(): () => void {
        const onSignal = async (sig: string) => {
            debug(`Received ${sig}, shutting down Zerogram gracefully...`);
            try {
                await this.stop();
            } catch (err) {
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
    async ping(): Promise<number> {
        if (!this.client || this._status !== 'connected') {
            throw new Error('Client is not connected');
        }
        const start = Date.now();
        await this.client.getMe();
        return Date.now() - start;
    }

    private _sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default Zerogram;
