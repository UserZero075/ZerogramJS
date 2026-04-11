const { Api } = require('telegram/tl');
const { markdownToHtml, markdownToMarkdownV2 } = require('../utils/markdown');
const Downloader = require('./Downloader');
const debug = require('debug')('zerogram:context');

class ContextFactory {
    constructor(bot) {
        this.bot = bot;
        this.downloader = null;
    }

    create(update) {
        const message = update.message ?? {};
        const peer = this._extractPeer(message, update);
        const isCallback = update?.className === 'UpdateBotCallbackQuery' || update?.className === 'UpdateInlineBotCallbackQuery';
        const callbackData = Buffer.isBuffer(update?.data)
            ? update.data.toString('utf8')
            : (update?.data ?? null);
        const payload = callbackData ? callbackData.split(':')[0] : null;
        const downloader = this._getDownloader();

        return {
            bot: this.bot,
            client: this.bot.client,
            update,
            message,
            isCallback,
            callbackData,

            reply: this._createReplyFn(peer, message.id),
            send: this._createSendFn(peer),
            sendFile: this._createSendFileFn(peer),
            answerCallback: this._createAnswerCallbackFn(update),

            getReplyMessage: this._createGetReplyMessageFn(peer, message),
            getMessages: this._createGetMessagesFn(peer),
            thumbFromVideo: (buf, opts) => this.bot.ffutil.thumbnail(buf, opts),

            downloadMedia: (msg, opts) => downloader.downloadMedia(msg, opts),
            downloadMediaStream: (msg, opts) => downloader.downloadMediaStream(msg, opts),
            downloadMediaBatch: (msgs, opts) => downloader.downloadMediaBatch(msgs, opts),
            downloadControllers: downloader.controllers
        };
    }

    _getDownloader() {
        if (!this.bot.client) {
            throw new Error('Telegram client no está inicializado todavía');
        }

        if (!this.downloader || this.downloader.client !== this.bot.client) {
            this.downloader = new Downloader(this.bot.client, this.bot.ffutil);
        }

        return this.downloader;
    }

    _extractPeer(message, update) {
        return message.peerId ?? update.peer ?? update.userId ?? null;
    }

    _createAnswerCallbackFn(update) {
        return async (text = '', opts = {}) => {
            // GramJS usa snake_case en los updates
            const queryId = update?.queryId ?? update?.query_id;

            if (!queryId) {
                console.log('DEBUG: update structure:', Object.keys(update || {}));
                throw new Error('answerCallback() solo está disponible en callbacks con queryId');
            }

            // Convertir a BigInt de forma segura
            let queryIdBigInt;
            try {
                if (typeof queryId === 'bigint') {
                    queryIdBigInt = queryId;
                } else if (typeof queryId === 'string') {
                    queryIdBigInt = BigInt(queryId);
                } else if (typeof queryId === 'number') {
                    queryIdBigInt = BigInt(queryId);
                } else {
                    // Puede ser un objeto con toString
                    queryIdBigInt = BigInt(queryId.toString());
                }
            } catch (e) {
                console.log('DEBUG: queryId value:', queryId, 'type:', typeof queryId);
                throw new Error(`Invalid queryId format: ${e.message}`);
            }

            console.log('DEBUG: Answering callback with queryId:', queryIdBigInt.toString());

            return this.bot.client.invoke(new Api.messages.SetBotCallbackAnswer({
                queryId: queryIdBigInt,
                message: text || '',
                alert: !!opts.alert,
                url: opts.url,
                cacheTime: Number.isInteger(opts.cacheTime) ? opts.cacheTime : 0
            }));
        };
    }

    _createReplyFn(peer, messageId) {
        return (text, opts = {}) => {
            const htmlText = markdownToHtml(text);

            return (async () => {
                let msg = await this.bot.client.sendMessage(peer, {
                    message: htmlText,
                    parseMode: 'html',
                    replyTo: messageId,
                    ...opts
                });

                if (Array.isArray(msg)) msg = msg[0];

                msg.safeEdit = (newText, editOpts = {}) => {
                    const htmlNewText = markdownToHtml(newText);
                    return this.bot.client.editMessage(peer, {
                        message: msg.id,
                        text: htmlNewText,
                        parseMode: 'html',
                        ...editOpts
                    }).catch((err) => {
                        debug('safeEdit error:', err);
                        return null;
                    });
                };

                return msg;
            })();
        };
    }

    _createSendFn(peer) {
        return (text, opts = {}) => {
            const mode = opts.parseMode || 'html';
            const formattedText = mode === 'markdownv2'
                ? markdownToMarkdownV2(text)
                : markdownToHtml(text);

            return this.bot.client.sendMessage(peer, {
                message: formattedText,
                parseMode: mode,
                ...opts
            });
        };
    }

    _createSendFileFn(peer) {
        return (file, opts = {}) => {
            return this.bot.client.sendFile(peer, { file, ...opts });
        };
    }

    _createGetReplyMessageFn(peer, message) {
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

    _createGetMessagesFn(peer) {
        return async (ids) => {
            try {
                if (!Array.isArray(ids)) ids = [ids];
                return await this.bot.client.getMessages(peer, { ids });
            } catch (error) {
                debug('Error getting messages:', error);
                throw error;
            }
        };
    }
}

module.exports = ContextFactory;
