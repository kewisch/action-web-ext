/* --------------------
 * yauzl-promise module
 * Shared objects
 * ------------------*/

/* global FinalizationRegistry */

'use strict';

// Exports

// Object used as private symbol to ensure `Zip` and `Entry` classes cannot be constructed by user
const INTERNAL_SYMBOL = {};

// Finalization registry for entries with uncertain uncompressed size
const uncertainUncompressedSizeEntriesRegistry = new FinalizationRegistry(
	({zip, ref}) => zip._uncertainUncompressedSizeEntryRefs?.delete(ref)
);

module.exports = {INTERNAL_SYMBOL, uncertainUncompressedSizeEntriesRegistry};
