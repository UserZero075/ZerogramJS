export interface LoaderOptions {
    recursive?: boolean;
    extensions?: string[];
}
/**
 * Loads modules (commands or callbacks) automatically from a directory.
 */
export declare function loadModules(dir: string, mode: 'command' | 'callback', inject: (name: string, handler: any) => void, opts?: LoaderOptions): Promise<{
    loaded: string[];
    failed: string[];
}>;
declare const _default: {
    loadModules: typeof loadModules;
};
export default _default;
//# sourceMappingURL=loader.d.ts.map