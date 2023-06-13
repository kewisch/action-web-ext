/* --------------------
 * yauzl-promise module
 * Entry point
 * ------------------*/

'use strict';

// Modules
const {fstat} = require('fs'),
	{promisify} = require('util'),
	{isObject, isString, isBoolean, isInteger, isPositiveInteger} = require('is-it-type'),
	assert = require('simple-invariant');

const fstatAsync = promisify(fstat);

// Imports
const Zip = require('./zip.js'),
	Entry = require('./entry.js'),
	{Reader, FileReader, FdReader, BufferReader} = require('./reader.js'),
	{dosDateTimeToDate, validateFilename} = require('./utils.js'),
	{INTERNAL_SYMBOL} = require('./shared.js');

// Exports

module.exports = {
	Zip,
	Entry,
	open,
	fromFd,
	fromBuffer,
	fromReader,
	Reader,
	dosDateTimeToDate,
	validateFilename
};

/**
 * Create `Zip` from file.
 * @param {string} path - ZIP file path
 * @param {Object} [options] - Options
 * @param {boolean} [options.decodeStrings=true] - Decode filenames and comments to strings
 * @param {boolean} [options.validateEntrySizes=true] - Validate entry sizes
 * @param {boolean} [options.validateFilenames=true] - Validate filenames
 * @param {boolean} [options.strictFilenames=false] - Don't allow backslashes (`\`) in filenames
 * @param {boolean} [options.supportMacArchive=true] - Support Mac OS Archive Utility faulty ZIP files
 * @returns {Zip} - `Zip` class instance
 */
async function open(path, options) {
	assert(isString(path), '`path` must be a string');
	options = validateOptions(options);

	const reader = new FileReader(path);
	await reader.open();
	const {size} = await fstatAsync(reader.fd);

	const zip = new Zip(INTERNAL_SYMBOL, reader, size, options);
	await zip._init();
	return zip;
}

/**
 * Create `Zip` from file descriptor.
 * @param {number} fd - ZIP file descriptor
 * @param {Object} [options] - Options
 * @param {boolean} [options.decodeStrings=true] - Decode filenames and comments to strings
 * @param {boolean} [options.validateEntrySizes=true] - Validate entry sizes
 * @param {boolean} [options.validateFilenames=true] - Validate filenames
 * @param {boolean} [options.strictFilenames=false] - Don't allow backslashes (`\`) in filenames
 * @param {boolean} [options.supportMacArchive=true] - Support Mac OS Archive Utility faulty ZIP files
 * @returns {Zip} - `Zip` class instance
 */
async function fromFd(fd, options) {
	assert(isInteger(fd), '`fd` must be an integer');
	options = validateOptions(options);

	const reader = new FdReader(fd);
	await reader.open();
	const {size} = await fstatAsync(fd);

	const zip = new Zip(INTERNAL_SYMBOL, reader, size, options);
	await zip._init();
	return zip;
}

/**
 * Create `Zip` from `Buffer`.
 * @param {Buffer} buffer - Buffer containing ZIP file
 * @param {Object} [options] - Options
 * @param {boolean} [options.decodeStrings=true] - Decode filenames and comments to strings
 * @param {boolean} [options.validateEntrySizes=true] - Validate entry sizes
 * @param {boolean} [options.validateFilenames=true] - Validate filenames
 * @param {boolean} [options.strictFilenames=false] - Don't allow backslashes (`\`) in filenames
 * @param {boolean} [options.supportMacArchive=true] - Support Mac OS Archive Utility faulty ZIP files
 * @returns {Zip} - `Zip` class instance
 */
async function fromBuffer(buffer, options) {
	assert(buffer instanceof Buffer, '`buffer` must be a Buffer');
	options = validateOptions(options);

	const reader = new BufferReader(buffer);
	await reader.open();
	const zip = new Zip(INTERNAL_SYMBOL, reader, buffer.length, options);
	await zip._init();
	return zip;
}

/**
 * Create `Zip` from `Reader`.
 * @param {Object} reader - `Reader` object
 * @param {number} size - Size of ZIP file
 * @param {Object} [options] - Options
 * @param {boolean} [options.decodeStrings=true] - Decode filenames and comments to strings
 * @param {boolean} [options.validateEntrySizes=true] - Validate entry sizes
 * @param {boolean} [options.validateFilenames=true] - Validate filenames
 * @param {boolean} [options.strictFilenames=false] - Don't allow backslashes (`\`) in filenames
 * @param {boolean} [options.supportMacArchive=true] - Support Mac OS Archive Utility faulty ZIP files
 * @returns {Zip} - `Zip` class instance
 */
async function fromReader(reader, size, options) {
	assert(reader instanceof Reader, '`reader` must be an instance of `Reader` class');
	assert(isPositiveInteger(size), '`size` must be a positive integer');
	options = validateOptions(options);

	await reader.open();
	const zip = new Zip(INTERNAL_SYMBOL, reader, size, options);
	await zip._init();
	return zip;
}

/**
 * Validate and conform `Zip` creation options.
 * @param {Object} [inputOptions] - Input options object
 * @returns {Object} - Conformed options object
 */
function validateOptions(inputOptions) {
	const options = {
		decodeStrings: true,
		validateEntrySizes: true,
		validateFilenames: true,
		strictFilenames: false,
		supportMacArchive: true
	};

	if (inputOptions != null) {
		assert(isObject(inputOptions), '`options` must be an object if provided');

		for (const [key, value] of Object.entries(inputOptions)) {
			assert(Object.hasOwn(options, key), `Unknown option '${key}'`);
			assert(isBoolean(value), `\`options.${key}\` must be a boolean if provided`);
			options[key] = value;
		}
	}

	return options;
}
