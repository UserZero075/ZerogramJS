"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextFactory = void 0;
const tl_1 = require("telegram/tl");
const big_integer_1 = __importDefault(require("big-integer"));
const debug_1 = __importDefault(require("debug"));
const markdown_js_1 = require("./utils/markdown.js");
const Downloader_js_1 = require("./Downloader.js");
const RateLimiter_js_1 = require("./RateLimiter.js");
const debug = (0, debug_1.default)('zerogram:context');
/**
 * Creates enriched Context instances for updates.
 */
class ContextFactory {
    bot;
    downloader = null;
    sessionStore = new Map();
    constructor(bot) {
        this.bot = bot;
    }
    /**
     * Builds a Context object from a Telegram update.
     */
    create(update) {
        const rawMessage = update.message ?? update.channelPost ?? update.editMessage ?? {};
        const message = {
            id: rawMessage.id || 0,
            ...rawMessage,
            text: rawMessage.message || rawMessage.text || ''
        };
        const isCallback = update?.className === 'UpdateBotCallbackQuery' || update?.className === 'UpdateInlineBotCallbackQuery';
        let callbackData = null;
        if (update?.data) {
            callbackData = Buffer.isBuffer(update.data) ? update.data.toString('utf8') : String(update.data);
        }
        let payload = null;
        if (callbackData) {
            const colonIdx = callbackData.indexOf(':');
            payload = colonIdx !== -1 ? callbackData.slice(colonIdx + 1) : '';
        }
        const peer = this._extractPeer(message, update);
        const chatId = this._resolveId(peer);
        const senderId = this._resolveId(message.fromId || update?.userId || update?.fromId);
        const from = senderId ? {
            id: senderId,
            firstName: message.from?.firstName || update.user?.firstName,
            lastName: message.from?.lastName || update.user?.lastName,
            username: message.from?.username || update.user?.username
        } : null;
        const chat = chatId ? {
            id: chatId,
            type: this._resolveChatType(peer)
        } : null;
        // Session lookup
        const sessionKey = chatId || senderId || 'global';
        if (!this.sessionStore.has(sessionKey)) {
            this.sessionStore.set(sessionKey, {});
        }
        const session = this.sessionStore.get(sessionKey);
        const downloader = this._getDownloader();
        const ctx = {
            bot: this.bot,
            client: this.bot.client,
            update,
            message,
            from,
            chat,
            chatId,
            senderId,
            isCallback,
            callbackData,
            payload,
            match: null,
            session,
            reply: this._createReplyFn(peer, message.id, chatId),
            send: this._createSendFn(peer, chatId),
            sendFile: this._createSendFileFn(peer, chatId),
            safeEdit: this._createSafeEditFn(peer, message.id, chatId),
            editMessageText: this._createEditMessageTextFn(peer, message.id, chatId),
            editMessageReplyMarkup: this._createEditReplyMarkupFn(peer, message.id, chatId),
            deleteMessage: this._createDeleteMessageFn(peer, message.id, chatId),
            sendChatAction: this._createSendChatActionFn(peer, chatId),
            answerCallback: this._createAnswerCallbackFn(update),
            getReplyMessage: this._createGetReplyMessageFn(peer, message),
            getMessages: this._createGetMessagesFn(peer),
            thumbFromVideo: (buf, opts) => this.bot.ffutil?.thumbnail(buf, opts),
            downloadMedia: (msg, opts) => downloader.downloadMedia(msg || message, opts),
            downloadMediaStream: (msg, opts) => downloader.downloadMediaStream(msg || message, opts),
            downloadStream: (msg, range, controller, opts) => downloader.downloadStream(msg || message, range, controller, opts),
            downloadMediaBatch: (msgs, opts) => downloader.downloadMediaBatch(msgs, opts),
            downloadControllers: downloader.controllers
        };
        return ctx;
    }
    _getDownloader() {
        if (!this.bot.client) {
            throw new Error('Telegram client is not initialized yet');
        }
        if (!this.downloader || this.downloader.client !== this.bot.client) {
            this.downloader = new Downloader_js_1.Downloader(this.bot.client, this.bot.ffutil);
        }
        return this.downloader;
    }
    _extractPeer(message, update) {
        if (message.peerId)
            return message.peerId;
        if (message.peer)
            return message.peer;
        if (update?.peer)
            return update.peer;
        if (update?.chat)
            return update.chat;
        if (update?.userId)
            return update.userId;
        if (update?.fromId)
            return update.fromId;
        return null;
    }
    _resolveId(entity) {
        if (!entity)
            return null;
        if (typeof entity === 'string' || typeof entity === 'number')
            return String(entity);
        if (entity.userId)
            return String(entity.userId);
        if (entity.channelId)
            return String(entity.channelId);
        if (entity.chatId)
            return String(entity.chatId);
        if (typeof entity.toJSNumber === 'function')
            return String(entity.toJSNumber());
        if (typeof entity.toString === 'function')
            return entity.toString();
        return null;
    }
    _resolveChatType(peer) {
        if (!peer)
            return 'unknown';
        if (peer.userId || peer.className === 'PeerUser')
            return 'private';
        if (peer.chatId || peer.className === 'PeerChat')
            return 'group';
        if (peer.channelId || peer.className === 'PeerChannel')
            return 'channel';
        return 'unknown';
    }
    _formatText(text, parseMode) {
        const mode = (parseMode || 'html').toLowerCase();
        let formattedText = text;
        if (mode === 'html') {
            formattedText = (0, markdown_js_1.markdownToHtml)(text);
        }
        else if (mode === 'markdownv2') {
            formattedText = (0, markdown_js_1.markdownToMarkdownV2)(text);
        }
        else if (mode === 'raw') {
            formattedText = text;
        }
        return { formattedText, mode };
    }
    _dispatchApiCall(chatId, task) {
        const execute = () => (0, RateLimiter_js_1.executeWithFloodWait)(task, {
            autoFloodWait: this.bot?.options?.autoFloodWait !== false,
            maxFloodWait: this.bot?.options?.maxFloodWait || 60,
            onFloodWait: (sec) => {
                if (typeof this.bot?.emit === 'function') {
                    this.bot.emit('floodWait', sec);
                }
            }
        });
        if (this.bot?.rateLimiter && typeof this.bot.rateLimiter.enqueue === 'function') {
            return this.bot.rateLimiter.enqueue(chatId, execute);
        }
        return execute();
    }
    _createReplyFn(peer, messageId, chatId) {
        return (text, opts = {}) => {
            if (!peer) {
                return Promise.reject(new Error('NO_REPLY_PEER: Cannot reply — no resolvable sender/peer in this update.'));
            }
            const { formattedText, mode } = this._formatText(text, opts.parseMode);
            return this._dispatchApiCall(chatId, async () => {
                let msg = await this.bot.client.sendMessage(peer, {
                    message: formattedText,
                    parseMode: mode,
                    replyTo: opts.replyTo ?? messageId,
                    ...opts
                });
                if (Array.isArray(msg))
                    msg = msg[0];
                // Decorate returned message with safeEdit
                if (msg) {
                    msg.safeEdit = (newText, editOpts = {}) => {
                        return this._safeEditCall(peer, msg.id, newText, editOpts, chatId);
                    };
                }
                return msg;
            });
        };
    }
    _createSendFn(peer, chatId) {
        return (text, opts = {}) => {
            if (!peer) {
                return Promise.reject(new Error('NO_PEER: Cannot send — no resolvable peer in this update.'));
            }
            const { formattedText, mode } = this._formatText(text, opts.parseMode);
            return this._dispatchApiCall(chatId, async () => {
                let msg = await this.bot.client.sendMessage(peer, {
                    message: formattedText,
                    parseMode: mode,
                    ...opts
                });
                if (Array.isArray(msg))
                    msg = msg[0];
                return msg;
            });
        };
    }
    _createSendFileFn(peer, chatId) {
        return (file, opts = {}) => {
            if (!peer) {
                return Promise.reject(new Error('NO_PEER: Cannot sendFile — no resolvable peer in this update.'));
            }
            let caption = opts.caption;
            let parseMode = opts.parseMode;
            if (caption) {
                const formatted = this._formatText(caption, parseMode);
                caption = formatted.formattedText;
                parseMode = formatted.mode;
            }
            return this._dispatchApiCall(chatId, async () => {
                return this.bot.client.sendFile(peer, {
                    file,
                    ...opts,
                    caption,
                    parseMode
                });
            });
        };
    }
    _safeEditCall(peer, messageId, newText, opts, chatId) {
        const { formattedText, mode } = this._formatText(newText, opts.parseMode);
        return this._dispatchApiCall(chatId, async () => {
            try {
                return await this.bot.client.editMessage(peer, {
                    message: messageId,
                    text: formattedText,
                    parseMode: mode,
                    ...opts
                });
            }
            catch (err) {
                // Silently ignore MESSAGE_NOT_MODIFIED (common during progress bar updates)
                const isNotModified = err?.errorMessage === 'MESSAGE_NOT_MODIFIED' ||
                    (typeof err?.message === 'string' && err.message.includes('MESSAGE_NOT_MODIFIED'));
                if (isNotModified) {
                    debug('safeEdit: MESSAGE_NOT_MODIFIED suppressed cleanly');
                    return { id: messageId, notModified: true };
                }
                debug('safeEdit error:', err);
                return null;
            }
        });
    }
    _createSafeEditFn(peer, messageId, chatId) {
        return (newText, opts = {}) => {
            return this._safeEditCall(peer, messageId, newText, opts, chatId);
        };
    }
    _createEditMessageTextFn(peer, messageId, chatId) {
        return (newText, opts = {}) => {
            const { formattedText, mode } = this._formatText(newText, opts.parseMode);
            return this._dispatchApiCall(chatId, () => {
                return this.bot.client.editMessage(peer, {
                    message: messageId,
                    text: formattedText,
                    parseMode: mode,
                    ...opts
                });
            });
        };
    }
    _createEditReplyMarkupFn(peer, messageId, chatId) {
        return (buttons) => {
            return this._dispatchApiCall(chatId, () => {
                return this.bot.client.editMessage(peer, {
                    message: messageId,
                    buttons
                });
            });
        };
    }
    _createDeleteMessageFn(peer, currentId, chatId) {
        return (messageId) => {
            const id = messageId ?? currentId;
            return this._dispatchApiCall(chatId, async () => {
                try {
                    await this.bot.client.deleteMessages(peer, [id], { revoke: true });
                    return true;
                }
                catch (err) {
                    debug('deleteMessage error:', err);
                    return false;
                }
            });
        };
    }
    _createSendChatActionFn(peer, chatId) {
        return (_action) => {
            return this._dispatchApiCall(chatId, async () => {
                try {
                    // Send typing or upload status if client supports it
                    if (typeof this.bot.client.sendChatAction === 'function') {
                        await this.bot.client.sendChatAction(peer, _action);
                    }
                    return true;
                }
                catch {
                    return false;
                }
            });
        };
    }
    _createAnswerCallbackFn(update) {
        return async (text = '', opts = {}) => {
            const rawQueryId = update?.queryId ?? update?.query_id;
            if (!rawQueryId) {
                debug('answerCallback called but no queryId was present in update');
                return null;
            }
            let queryIdBigInt;
            try {
                queryIdBigInt = (0, big_integer_1.default)(String(rawQueryId));
            }
            catch (e) {
                throw new Error(`Invalid queryId format: ${e.message}`);
            }
            try {
                return await this.bot.client.invoke(new tl_1.Api.messages.SetBotCallbackAnswer({
                    queryId: queryIdBigInt,
                    message: text || '',
                    alert: !!opts.alert,
                    url: opts.url,
                    cacheTime: Number.isInteger(opts.cacheTime) ? opts.cacheTime : 0
                }));
            }
            catch (err) {
                // If query is expired or already answered, suppress to avoid breaking handler
                if (err?.errorMessage === 'QUERY_ID_INVALID') {
                    debug('answerCallback: QUERY_ID_INVALID suppressed');
                    return null;
                }
                throw err;
            }
        };
    }
    _createGetReplyMessageFn(peer, message) {
        return async () => {
            if (!message.replyTo)
                return null;
            const id = message.replyTo.replyToMsgId ?? message.replyTo.msgId ?? null;
            if (!id)
                return null;
            try {
                const [msg] = await this.bot.client.getMessages(peer, { ids: [id] });
                return msg || null;
            }
            catch (error) {
                debug('Error getting reply message:', error);
                return null;
            }
        };
    }
    _createGetMessagesFn(peer) {
        return async (ids) => {
            const idArray = Array.isArray(ids) ? ids : [ids];
            try {
                return await this.bot.client.getMessages(peer, { ids: idArray });
            }
            catch (error) {
                debug('Error getting messages:', error);
                throw error;
            }
        };
    }
}
exports.ContextFactory = ContextFactory;
exports.default = ContextFactory;
//# sourceMappingURL=Context.js.map