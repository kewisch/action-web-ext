import type { Callback, Disposer } from '../types';
declare class Interceptor {
    private callbacks;
    constructor();
    exit: () => void;
    hook: () => void;
    register: (callback: Callback) => Disposer;
}
declare const _default: Interceptor;
export default _default;
