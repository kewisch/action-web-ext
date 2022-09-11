/// <reference types="node" />
import type { URL, UrlWithStringQuery } from 'node:url';
export declare type LegacyUrlOptions = {
    protocol: string;
    hostname: string;
    host: string;
    hash: string | null;
    search: string | null;
    pathname: string;
    href: string;
    path: string;
    port?: number;
    auth?: string;
};
export default function urlToOptions(url: URL | UrlWithStringQuery): LegacyUrlOptions;
