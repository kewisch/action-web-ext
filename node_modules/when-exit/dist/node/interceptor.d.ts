import type { Callback, Disposer } from '../types';
declare class Interceptor {
    private callbacks;
    private exited;
    constructor();
    exit: (signal?: string) => void;
    hook: () => void;
    register: (callback: Callback) => Disposer;
}
declare const _default: Interceptor;
export default _default;
