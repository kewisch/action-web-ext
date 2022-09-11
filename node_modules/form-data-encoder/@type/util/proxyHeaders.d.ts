import type { LowercaseObjectKeys } from "./LowercaseObjectKeys.js";
declare type AnyObject = Record<string | symbol, string>;
export declare const proxyHeaders: <T extends AnyObject>(object: T) => T & LowercaseObjectKeys<T>;
export {};
