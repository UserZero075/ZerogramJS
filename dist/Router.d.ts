import type { Context, Middleware, CommandHandler, CallbackHandler, HearsHandler, EventHandler } from './types/index.js';
/**
 * Handles routing of commands, callbacks, regex/text patterns, events and middlewares.
 */
export declare class Router {
    private commands;
    private callbacks;
    private hearsRules;
    private eventHandlers;
    private middlewares;
    constructor();
    /**
     * Registers a command or list of command aliases.
     * Commands are case-insensitive and support group mentions (/command@botname).
     */
    addCommand(name: string | string[], handler: CommandHandler): void;
    /**
     * Registers a callback query handler matching an exact string, prefix, or RegExp.
     */
    addCallback(actionOrPattern: string | RegExp, handler: CallbackHandler): void;
    /**
     * Registers a text matching handler (hears) via string or RegExp.
     */
    addHears(pattern: string | RegExp, handler: HearsHandler): void;
    /**
     * Registers an event handler for generic update types ('message', 'photo', etc.).
     */
    addOn(event: string, handler: EventHandler): void;
    /**
     * Registers a middleware in the execution chain.
     */
    addMiddleware(middleware: Middleware): void;
    /**
     * Dispatches an incoming context through middlewares and matching handlers.
     */
    route(ctx: Context, update: any): Promise<any>;
    private _isCommand;
    private _isCallback;
    private _handleCommand;
    private _handleCallback;
    private _handleHears;
    private _handleEvents;
    private _runMiddlewares;
}
export default Router;
//# sourceMappingURL=Router.d.ts.map