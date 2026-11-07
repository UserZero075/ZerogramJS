import createDebug from 'debug';
import type {
    Context,
    Middleware,
    CommandHandler,
    CallbackHandler,
    HearsHandler,
    EventHandler
} from './types/index.js';

const debug = createDebug('zerogram:router');

interface CallbackRegistration {
    pattern: string | RegExp;
    handler: CallbackHandler;
}

interface HearsRegistration {
    pattern: string | RegExp;
    handler: HearsHandler;
}

/**
 * Handles routing of commands, callbacks, regex/text patterns, events and middlewares.
 */
export class Router {
    private commands: Map<string, CommandHandler>;
    private callbacks: CallbackRegistration[];
    private hearsRules: HearsRegistration[];
    private eventHandlers: Map<string, EventHandler[]>;
    private middlewares: Middleware[];

    constructor() {
        this.commands = new Map();
        this.callbacks = [];
        this.hearsRules = [];
        this.eventHandlers = new Map();
        this.middlewares = [];
    }

    /**
     * Registers a command or list of command aliases.
     * Commands are case-insensitive and support group mentions (/command@botname).
     */
    addCommand(name: string | string[], handler: CommandHandler): void {
        const names = Array.isArray(name) ? name : [name];
        for (const n of names) {
            const clean = n.replace(/^\//, '').toLowerCase().trim();
            if (!clean) continue;
            this.commands.set(clean, handler);
            debug(`Command registered: /${clean}`);
        }
    }

    /**
     * Registers a callback query handler matching an exact string, prefix, or RegExp.
     */
    addCallback(actionOrPattern: string | RegExp, handler: CallbackHandler): void {
        this.callbacks.push({
            pattern: actionOrPattern,
            handler
        });
        debug(`Callback registered for pattern: ${actionOrPattern}`);
    }

    /**
     * Registers a text matching handler (hears) via string or RegExp.
     */
    addHears(pattern: string | RegExp, handler: HearsHandler): void {
        this.hearsRules.push({
            pattern,
            handler
        });
        debug(`Hears rule registered for: ${pattern}`);
    }

    /**
     * Registers an event handler for generic update types ('message', 'photo', etc.).
     */
    addOn(event: string, handler: EventHandler): void {
        const normalized = event.toLowerCase();
        const existing = this.eventHandlers.get(normalized) || [];
        existing.push(handler);
        this.eventHandlers.set(normalized, existing);
        debug(`Event handler registered for: ${normalized}`);
    }

    /**
     * Registers a middleware in the execution chain.
     */
    addMiddleware(middleware: Middleware): void {
        if (typeof middleware !== 'function') {
            throw new Error('Middleware must be a function');
        }
        this.middlewares.push(middleware);
        debug('Middleware registered');
    }

    /**
     * Dispatches an incoming context through middlewares and matching handlers.
     */
    async route(ctx: Context, update: any): Promise<any> {
        let routed = false;

        // Core handler executed at the bottom of the middleware stack
        const finalHandler = async () => {
            // 1. Check for command
            if (this._isCommand(ctx)) {
                const handled = await this._handleCommand(ctx);
                if (handled !== false) {
                    routed = true;
                    return handled;
                }
            }

            // 2. Check for callback query
            if (ctx.isCallback || this._isCallback(update)) {
                const handled = await this._handleCallback(ctx, update);
                if (handled !== false) {
                    routed = true;
                    return handled;
                }
            }

            // 3. Check for text/hears pattern
            const text = ctx.message?.text || ctx.message?.message || '';
            if (text) {
                const handled = await this._handleHears(ctx, text);
                if (handled !== false) {
                    routed = true;
                    return handled;
                }
            }

            // 4. Check for event handlers
            const handledEvent = await this._handleEvents(ctx, update);
            if (handledEvent !== false) {
                routed = true;
                return handledEvent;
            }

            // 5. Unhandled update
            if (!routed && ctx.bot && typeof ctx.bot.emit === 'function') {
                ctx.bot.emit('unhandled', ctx);
            }
        };

        // Run middleware onion chain
        return this._runMiddlewares(ctx, finalHandler);
    }

    private _isCommand(ctx: Context): boolean {
        const text = ctx.message?.text || ctx.message?.message || '';
        return typeof text === 'string' && text.startsWith('/');
    }

    private _isCallback(update: any): boolean {
        const name = update?.className;
        return name === 'UpdateBotCallbackQuery' || name === 'UpdateInlineBotCallbackQuery';
    }

    private async _handleCommand(ctx: Context): Promise<any> {
        const text = ctx.message?.text || ctx.message?.message || '';
        // Extract command, optional bot mention (/cmd@BotName), and arguments
        const match = text.slice(1).match(/^([a-zA-Z0-9_]+)(?:@([a-zA-Z0-9_]+))?(?:\s+([\s\S]*))?$/);
        if (!match) return false;

        const cmdName = match[1].toLowerCase();
        const botMention = match[2];
        const rawArgs = match[3];

        // If command targeted another bot specifically, ignore
        if (botMention && ctx.bot?.options?.botUsername) {
            const expected = ctx.bot.options.botUsername.replace(/^@/, '').toLowerCase();
            if (botMention.toLowerCase() !== expected) {
                debug(`Ignoring command /${cmdName}@${botMention} intended for another bot`);
                return false;
            }
        }

        const handler = this.commands.get(cmdName);
        if (!handler) {
            debug(`No command handler registered for: /${cmdName}`);
            return false;
        }

        const args = rawArgs ? rawArgs.trim().split(/\s+/) : [];
        debug(`Executing command: /${cmdName} with ${args.length} args`);
        return handler(ctx, args);
    }

    private async _handleCallback(ctx: Context, update: any): Promise<any> {
        let rawData = ctx.callbackData;
        if (!rawData && update?.data) {
            rawData = Buffer.isBuffer(update.data) ? update.data.toString('utf8') : String(update.data);
        }
        if (!rawData) rawData = '';

        debug(`Processing callback query data: "${rawData}"`);

        // Iterate registered callback handlers
        for (const reg of this.callbacks) {
            let matched = false;
            let matchResult: RegExpMatchArray | null = null;
            let payload: string | null = null;

            if (typeof reg.pattern === 'string') {
                if (rawData === reg.pattern) {
                    matched = true;
                    payload = '';
                } else if (rawData.startsWith(`${reg.pattern}:`)) {
                    matched = true;
                    payload = rawData.slice(reg.pattern.length + 1);
                } else if (rawData.startsWith(`${reg.pattern}_`)) {
                    matched = true;
                    payload = rawData.slice(reg.pattern.length + 1);
                }
            } else if (reg.pattern instanceof RegExp) {
                const match = rawData.match(reg.pattern);
                if (match) {
                    matched = true;
                    matchResult = match;
                    payload = match[1] || match[0];
                }
            }

            if (matched) {
                ctx.match = matchResult;
                ctx.payload = payload;
                debug(`Executing callback handler for: ${reg.pattern}`);
                return reg.handler(ctx);
            }
        }

        debug(`No matching callback handler found for: "${rawData}"`);
        return false;
    }

    private async _handleHears(ctx: Context, text: string): Promise<any> {
        for (const rule of this.hearsRules) {
            let matched = false;
            let matchResult: RegExpMatchArray | null = null;

            if (typeof rule.pattern === 'string') {
                if (text === rule.pattern || text.includes(rule.pattern)) {
                    matched = true;
                }
            } else if (rule.pattern instanceof RegExp) {
                const match = text.match(rule.pattern);
                if (match) {
                    matched = true;
                    matchResult = match;
                }
            }

            if (matched) {
                ctx.match = matchResult;
                debug(`Executing hears handler for pattern: ${rule.pattern}`);
                return rule.handler(ctx);
            }
        }
        return false;
    }

    private async _handleEvents(ctx: Context, update: any): Promise<any> {
        const detectedEvents: string[] = [];

        if (ctx.message?.media) {
            const media = ctx.message.media;
            if (media.photo) detectedEvents.push('photo');
            if (media.document) {
                detectedEvents.push('document');
                const mime = media.document.mimeType || '';
                if (mime.startsWith('video/')) detectedEvents.push('video');
                if (mime.startsWith('audio/')) detectedEvents.push('audio');
            }
        }

        if (update.className === 'UpdateEditMessage' || update.className === 'UpdateEditChannelMessage') {
            detectedEvents.push('edit');
        }

        if (update.className === 'UpdateNewChannelMessage') {
            detectedEvents.push('channel_post');
        }

        if (detectedEvents.length === 0 && ctx.message?.text) {
            detectedEvents.push('message');
        }

        for (const evt of detectedEvents) {
            const handlers = this.eventHandlers.get(evt);
            if (handlers && handlers.length > 0) {
                for (const h of handlers) {
                    await h(ctx);
                }
                return true;
            }
        }

        return false;
    }

    private async _runMiddlewares(ctx: Context, finalHandler: () => Promise<any>): Promise<any> {
        let index = -1;

        const dispatch = async (i: number): Promise<any> => {
            if (i <= index) {
                throw new Error('next() called multiple times');
            }
            index = i;

            if (i < this.middlewares.length) {
                const middleware = this.middlewares[i];
                return middleware(ctx, () => dispatch(i + 1));
            } else {
                return finalHandler();
            }
        };

        return dispatch(0);
    }
}

export default Router;
