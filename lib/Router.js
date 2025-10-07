const debug = require('debug')('zerogram:router');

/**
 * Maneja el enrutamiento de comandos y callbacks
 */
class Router {
    constructor() {
        this.commands = new Map();
        this.callbacks = new Map();
        this.middlewares = [];
    }

    /**
     * Registra un comando
     */
    addCommand(name, handler) {
        this.commands.set(name, handler);
    }

    /**
     * Registra un callback
     */
    addCallback(action, handler) {
        this.callbacks.set(action, handler);
    }

    /**
     * Registra un middleware
     */
    addMiddleware(middleware) {
        this.middlewares.push(middleware);
    }

    /**
     * Procesa una actualización
     */
    async route(ctx, update) {
        // Ejecutar middlewares
        await this._runMiddlewares(ctx);

        // Detectar tipo de update
        if (this._isCommand(ctx)) {
            return this._handleCommand(ctx);
        }

        if (this._isCallback(update)) {
            return this._handleCallback(ctx, update);
        }

        // Evento no manejado
        ctx.bot.emit('unhandled', ctx);
    }

    /**
     * Verifica si es un comando
     * @private
     */
    _isCommand(ctx) {
        const text = ctx.message.text || ctx.message.message || '';
        return text.startsWith('/');
    }

    /**
     * Verifica si es un callback
     * @private
     */
    _isCallback(update) {
        return update?.className === 'UpdateBotCallbackQuery';
    }

    /**
     * Maneja comandos
     * @private
     */
    async _handleCommand(ctx) {
        const text = ctx.message.text || ctx.message.message || '';
        const [cmd, ...args] = text.slice(1).split(/\s+/);
        
        const handler = this.commands.get(cmd);
        if (handler) {
            debug(`Executing command: /${cmd}`);
            return handler(ctx, args);
        }
    }

    /**
     * Maneja callbacks
     * @private
     */
    async _handleCallback(ctx, update) {
        const data = update.data.toString('utf8');
        const [action, ...payloadParts] = data.split(':');
        const payload = payloadParts.join(':'); // Permitir : en el payload
        
        debug(`Callback received - action: ${action}, payload: ${payload}`);
        
        const handler = this.callbacks.get(action);
        if (handler) {
            debug(`Executing callback handler: ${action}`);
            return handler({
                ...ctx,
                action,
                payload,
                queryId: update.queryId,
                userId: update.userId?.toString()
            });
        } else {
            debug(`No handler found for callback: ${action}`);
        }
    }

    /**
     * Ejecuta middlewares en cadena
     * @private
     */
    async _runMiddlewares(ctx) {
        let index = -1;

        const dispatch = async (i) => {
            if (i <= index) {
                throw new Error('next() called multiple times');
            }
            
            index = i;
            const middleware = this.middlewares[i];
            
            if (!middleware) return;
            
            await middleware(ctx, () => dispatch(i + 1));
        };

        await dispatch(0);
    }
}

module.exports = Router;