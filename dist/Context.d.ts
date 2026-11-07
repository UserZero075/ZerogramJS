import type { Context } from './types/index.js';
/**
 * Creates enriched Context instances for updates.
 */
export declare class ContextFactory {
    readonly bot: any;
    private downloader;
    private sessionStore;
    constructor(bot: any);
    /**
     * Builds a Context object from a Telegram update.
     */
    create(update: any): Context;
    private _getDownloader;
    private _extractPeer;
    private _resolveId;
    private _resolveChatType;
    private _formatText;
    private _dispatchApiCall;
    private _createReplyFn;
    private _createSendFn;
    private _createSendFileFn;
    private _safeEditCall;
    private _createSafeEditFn;
    private _createEditMessageTextFn;
    private _createEditReplyMarkupFn;
    private _createDeleteMessageFn;
    private _createSendChatActionFn;
    private _createAnswerCallbackFn;
    private _createGetReplyMessageFn;
    private _createGetMessagesFn;
}
export default ContextFactory;
//# sourceMappingURL=Context.d.ts.map