const { markdownToHtml, markdownToMarkdownV2 } = require('../utils/markdown');
const Downloader = require('./Downloader');
const debug = require('debug')('zerogram:context');

class ContextFactory {
    constructor(bot) {
        this.bot = bot;
        this.downloader = new Downloader(bot.client, bot.ffutil);
    }

    create(update) {
        const message = update.message ?? {};
        const peer = this._extractPeer(message, update);

        return {
            bot: this.bot,
            client: this.bot.client,
            update,
            message,

            reply: this._createReplyFn(peer, message.id),
            send: this._createSendFn(peer),
            sendFile: this._createSendFileFn(peer),

            getReplyMessage: this._createGetReplyMessageFn(peer, message),
            getMessages: this._createGetMessagesFn(peer),
            thumbFromVideo: (buf, opts) => this.bot.ffutil.thumbnail(buf, opts),

            // Descarga normal
            downloadMedia: (msg, opts) => this.downloader.downloadMedia(msg, opts),

            // ¡NUEVO! Descarga con streaming
            downloadMediaStream: (msg, opts) => this.downloader.downloadMediaStream(msg, opts),

            downloadMediaBatch: (msgs, opts) => this.downloader.downloadMediaBatch(msgs, opts),
            downloadControllers: this.downloader.controllers
        };
    }

    _extractPeer(message, update) {
        return message.peerId ?? update.peer ?? update.userId ?? null;
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
            let formattedText = mode === 'markdownv2'
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