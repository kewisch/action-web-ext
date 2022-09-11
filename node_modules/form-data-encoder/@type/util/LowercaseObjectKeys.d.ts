/*! Based on @types/lowercase-object-keys. MIT License. See: https://github.com/DefinitelyTyped/DefinitelyTyped/blob/5336057c43fcd14eabe7ae8536b51a7c7b2b21bf/types/lowercase-object-keys/index.d.ts */
export declare type LowercaseObjectKeys<T extends object> = {
    [K in keyof T as K extends string ? Lowercase<K> : K]: T[K];
};
