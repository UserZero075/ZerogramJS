import { EventEmitter } from 'node:events';
import { TelegramClient } from 'telegram';
import { Router } from './Router.js';
import { ContextFactory } from './Context.js';
import { FFMpegUtil } from './utils/ffmpeg.js';
import { RateLimiter } from './RateLimiter.js';
import type { ZerogramOptions, ZerogramStatus, SessionStorage, CommandHandler, CallbackHandler, HearsHandler, EventHandler, Middleware } from './types/index.js';
/**
 * Main Zerogram Bot Class.
 * High-performance, stable, typed Telegram MTProto Bot framework.
 */
export declare class Zerogram extends EventEmitter {
    readonly apiId: number;
    readonly apiHash: string;
    readonly botToken: string;
    readonly options: Required<Omit<ZerogramOptions, 'sessionStorage' | 'rateLimiter' | 'botUsername'>> & {
        sessionStorage?: SessionStorage;
        rateLimiter?: RateLimiter;
        botUsername?: string;
    };
    readonly sessionManager: SessionStorage;
    readonly router: Router;
    readonly contextFactory: ContextFactory;
    readonly ffutil: FFMpegUtil;
    readonly rateLimiter: RateLimiter | null;
    client: TelegramClient | null;
    me: any;
    private _status;
    private _signalCleanup;
    constructor(apiId: number, apiHash: string, botToken: string, opts?: ZerogramOptions);
    get status(): ZerogramStatus;
    get isInitialized(): boolean;
    private _validateConfig;
    /**
     * Connects and initializes the Telegram MTProto client.
     */
    init(): Promise<void>;
    private _connectWithRetry;
    private _handleUpdate;
    /**
     * Gracefully stops the Telegram bot client.
     */
    stop(): Promise<void>;
    /**
     * Registers a command handler. Supports array of aliases.
     */
    command(name: string | string[], handler: CommandHandler): this;
    /**
     * Registers a callback query handler matching string or RegExp.
     */
    onCallback(actionOrPattern: string | RegExp, handler: CallbackHandler): this;
    /**
     * Registers a regex or text matching handler (hears).
     */
    hears(pattern: string | RegExp, handler: HearsHandler): this;
    /**
     * Registers an update event handler ('message', 'photo', 'document', etc.).
     */
    on(event: string, handler: EventHandler): this;
    /**
     * Registers a middleware function.
     */
    use(middleware: Middleware): this;
    /**
     * Helper to create inline callback buttons.
     */
    static createButton(text: string, callbackData: string | Buffer): any;
    /**
     * Helper to create URL buttons.
     */
    static urlButton(text: string, url: string): any;
    /**
     * Loads command or callback modules automatically from disk.
     */
    static loadModules(dir: string, mode: 'command' | 'callback', inject: (name: string, handler: any) => void): Promise<{
        loaded: string[];
        failed: string[];
    }>;
    /**
     * Retrieves chat message history.
     */
    getHistory(chatId: string | number, options?: {
        limit?: number;
        offset?: number;
        fromDate?: Date;
        toDate?: Date;
    }): Promise<any[]>;
    /**
     * Configures clean graceful shutdown on SIGINT and SIGTERM.
     */
    setupGracefulShutdown(): () => void;
    /**
     * Measures latency (ping) to Telegram servers in milliseconds.
     */
    ping(): Promise<number>;
    private _sleep;
}
export default Zerogram;
//# sourceMappingURL=Zerogram.d.ts.map