/* This file is a part of @mdn/browser-compat-data
 * See LICENSE file for more information. */

import { CompatData } from "./types";

import bcd from "./data.json";

// XXX The cast to "any" mitigates a TS definition issue.
// This is a longstanding TypeScript issue; see https://github.com/microsoft/TypeScript/issues/17867.
export default bcd as any as CompatData;
export * from "./types";