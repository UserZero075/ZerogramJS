import { Api } from 'telegram/tl';
import bigInt from 'big-integer';
import createDebug from 'debug';
import { markdownToHtml, markdownToMarkdownV2 } from './utils/markdown.js';
import { Downloader, downloadControllers } from './Downloader.js';
import { executeWithFloodWait } from './RateLimiter.js';
import type {
    Context,
    NormalizedMessage,
    UserInfo,
    ChatInfo,
    SendOptions,
    EditOptions,
    SendFileOptions,
    AnswerCallbackOptions,
    ChatAction
} from './types/index.js';

const debug = createDebug('zerogram:context');

/**
 * Creates enriched Context instances for updates.
 */
export class ContextFactory {
    public readonly bot: any;
    private downloader: Downloader | null = null;
    private sessionStore = new Map<string, any>();

    constructor(bot: any) {
        this.bot = bot;
    }

    /**
     * Builds a Context object from a Telegram update.
     */
    create(update: any): Context {
        const rawMessage = update.message ?? update.channelPost ?? update.editMessage ?? {};
        const message: NormalizedMessage = {
            id: rawMessage.id || 0,
            ...rawMessage,
            text: rawMessage.message || rawMessage.text || ''
        };

        const isCallback = update?.className === 'UpdateBotCallbackQuery' || update?.className === 'UpdateInlineBotCallbackQuery';
        let callbackData: string | null = null;
        if (update?.data) {
            callbackData = Buffer.isBuffer(update.data) ? update.data.toString('utf8') : String(update.data);
        }

        let payload: string | null = null;
        if (callbackData) {
            const colonIdx = callbackData.indexOf(':');
            payload = colonIdx !== -1 ? callbackData.slice(colonIdx + 1) : '';
        }

        const peer = this._extractPeer(message, update);
        const chatId = this._resolveId(peer);
        const senderId = this._resolveId(message.fromId || update?.userId || update?.fromId);

        const from: UserInfo | null = senderId ? {
            id: senderId,
            firstName: message.from?.firstName || update.user?.firstName,
            lastName: message.from?.lastName || update.user?.lastName,
            username: message.from?.username || update.user?.username
        } : null;

        const chat: ChatInfo | null = chatId ? {
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

        const ctx: Context = {
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

    private _getDownloader(): Downloader {
        if (!this.bot.client) {
            throw new Error('Telegram client is not initialized yet');
        }

        if (!this.downloader || (this.downloader as any).client !== this.bot.client) {
            this.downloader = new Downloader(this.bot.client, this.bot.ffutil);
        }

        return this.downloader;
    }

    private _extractPeer(message: any, update: any): any {
        if (message.peerId) return message.peerId;
        if (message.peer) return message.peer;
        if (update?.peer) return update.peer;
        if (update?.chat) return update.chat;
        if (update?.userId) return update.userId;
        if (update?.fromId) return update.fromId;
        return null;
    }

    private _resolveId(entity: any): string | null {
        if (!entity) return null;
        if (typeof entity === 'string' || typeof entity === 'number') return String(entity);
        if (entity.userId) return String(entity.userId);
        if (entity.channelId) return String(entity.channelId);
        if (entity.chatId) return String(entity.chatId);
        if (typeof entity.toJSNumber === 'function') return String(entity.toJSNumber());
        if (typeof entity.toString === 'function') return entity.toString();
        return null;
    }

    private _resolveChatType(peer: any): 'private' | 'group' | 'supergroup' | 'channel' | 'unknown' {
        if (!peer) return 'unknown';
        if (peer.userId || peer.className === 'PeerUser') return 'private';
        if (peer.chatId || peer.className === 'PeerChat') return 'group';
        if (peer.channelId || peer.className === 'PeerChannel') return 'channel';
        return 'unknown';
    }

    private _formatText(text: string, parseMode?: string): { formattedText: string; mode: string } {
        const mode = (parseMode || 'html').toLowerCase();
        let formattedText = text;

        if (mode === 'html') {
            formattedText = markdownToHtml(text);
        } else if (mode === 'markdownv2') {
            formattedText = markdownToMarkdownV2(text);
        } else if (mode === 'raw') {
            formattedText = text;
        }

        return { formattedText, mode };
    }

    private _dispatchApiCall<T>(chatId: string | null, task: () => Promise<T>): Promise<T> {
        const execute = () => executeWithFloodWait(task, {
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

    private _createReplyFn(peer: any, messageId: number, chatId: string | null) {
        return (text: string, opts: SendOptions = {}) => {
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

                if (Array.isArray(msg)) msg = msg[0];

                // Decorate returned message with safeEdit
                if (msg) {
                    msg.safeEdit = (newText: string, editOpts: EditOptions = {}) => {
                        return this._safeEditCall(peer, msg.id, newText, editOpts, chatId);
                    };
                }

                return msg;
            });
        };
    }

    private _createSendFn(peer: any, chatId: string | null) {
        return (text: string, opts: SendOptions = {}) => {
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
                if (Array.isArray(msg)) msg = msg[0];
                return msg;
            });
        };
    }

    private _createSendFileFn(peer: any, chatId: string | null) {
        return (file: any, opts: SendFileOptions = {}) => {
            if (!peer) {
                return Promise.reject(new Error('NO_PEER: Cannot sendFile — no resolvable peer in this update.'));
            }

            let caption = opts.caption;
            let parseMode = opts.parseMode;
            if (caption) {
                const formatted = this._formatText(caption, parseMode);
                caption = formatted.formattedText;
                parseMode = formatted.mode as any;
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

    private _safeEditCall(peer: any, messageId: number, newText: string, opts: EditOptions, chatId: string | null): Promise<any> {
        const { formattedText, mode } = this._formatText(newText, opts.parseMode);

        return this._dispatchApiCall(chatId, async () => {
            try {
                return await this.bot.client.editMessage(peer, {
                    message: messageId,
                    text: formattedText,
                    parseMode: mode,
                    ...opts
                });
            } catch (err: any) {
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

    private _createSafeEditFn(peer: any, messageId: number, chatId: string | null) {
        return (newText: string, opts: EditOptions = {}) => {
            return this._safeEditCall(peer, messageId, newText, opts, chatId);
        };
    }

    private _createEditMessageTextFn(peer: any, messageId: number, chatId: string | null) {
        return (newText: string, opts: EditOptions = {}) => {
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

    private _createEditReplyMarkupFn(peer: any, messageId: number, chatId: string | null) {
        return (buttons: any) => {
            return this._dispatchApiCall(chatId, () => {
                return this.bot.client.editMessage(peer, {
                    message: messageId,
                    buttons
                });
            });
        };
    }

    private _createDeleteMessageFn(peer: any, currentId: number, chatId: string | null) {
        return (messageId?: number) => {
            const id = messageId ?? currentId;
            return this._dispatchApiCall(chatId, async () => {
                try {
                    await this.bot.client.deleteMessages(peer, [id], { revoke: true });
                    return true;
                } catch (err) {
                    debug('deleteMessage error:', err);
                    return false;
                }
            });
        };
    }

    private _createSendChatActionFn(peer: any, chatId: string | null) {
        return (_action: ChatAction) => {
            return this._dispatchApiCall(chatId, async () => {
                try {
                    // Send typing or upload status if client supports it
                    if (typeof this.bot.client.sendChatAction === 'function') {
                        await this.bot.client.sendChatAction(peer, _action);
                    }
                    return true;
                } catch {
                    return false;
                }
            });
        };
    }

    private _createAnswerCallbackFn(update: any) {
        return async (text: string = '', opts: AnswerCallbackOptions = {}) => {
            const rawQueryId = update?.queryId ?? update?.query_id;
            if (!rawQueryId) {
                debug('answerCallback called but no queryId was present in update');
                return null;
            }

            let queryIdBigInt: any;
            try {
                queryIdBigInt = bigInt(String(rawQueryId));
            } catch (e: any) {
                throw new Error(`Invalid queryId format: ${e.message}`);
            }

            try {
                return await this.bot.client.invoke(new Api.messages.SetBotCallbackAnswer({
                    queryId: queryIdBigInt,
                    message: text || '',
                    alert: !!opts.alert,
                    url: opts.url,
                    cacheTime: Number.isInteger(opts.cacheTime) ? opts.cacheTime : 0
                }));
            } catch (err: any) {
                // If query is expired or already answered, suppress to avoid breaking handler
                if (err?.errorMessage === 'QUERY_ID_INVALID') {
                    debug('answerCallback: QUERY_ID_INVALID suppressed');
                    return null;
                }
                throw err;
            }
        };
    }

    private _createGetReplyMessageFn(peer: any, message: any) {
        return async () => {
            if (!message.replyTo) return null;
            const id = message.replyTo.replyToMsgId ?? message.replyTo.msgId ?? null;
            if (!id) return null;

            try {
                const [msg] = await this.bot.client.getMessages(peer, { ids: [id] });
                return msg || null;
            } catch (error) {
                debug('Error getting reply message:', error);
                return null;
            }
        };
    }

    private _createGetMessagesFn(peer: any) {
        return async (ids: number | number[]) => {
            const idArray = Array.isArray(ids) ? ids : [ids];
            try {
                return await this.bot.client.getMessages(peer, { ids: idArray });
            } catch (error) {
                debug('Error getting messages:', error);
                throw error;
            }
        };
    }
}

export default ContextFactory;
