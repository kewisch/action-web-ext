/* --------------------
 * yauzl-promise module
 * `Entry` class
 * ------------------*/

'use strict';

// Modules
const {createInflateRaw} = require('zlib'),
	{Transform: TransformStream, pipeline} = require('stream'),
	calculateCrc32 = require('@node-rs/crc32').crc32,
	{isObject, isBoolean, isPositiveInteger, isPositiveIntegerOrZero} = require('is-it-type'),
	assert = require('simple-invariant');

// Imports
const {INTERNAL_SYMBOL, uncertainUncompressedSizeEntriesRegistry} = require('./shared.js'),
	{dosDateTimeToDate} = require('./utils.js');

// Exports

const MAC_LFH_EXTRA_FIELDS_LENGTH = 16,
	FOUR_GIB = 0x100000000; // Math.pow(2, 32)

class Entry {
	/**
	 * Class representing ZIP file entry.
	 * Class is exported in public interface, for purpose of `instanceof` checks, but constructor cannot
	 * be called by user. This is enforced by use of private symbol `INTERNAL_SYMBOL`.
	 * @class
	 * @param {Object} testSymbol - Must be `INTERNAL_SYMBOL`
	 * @param {Object} props - Entry properties (see `Zip` class's `_readEntryAt()` method)
	 */
	constructor(testSymbol, props) {
		assert(testSymbol === INTERNAL_SYMBOL, 'Entry class cannot be instantiated directly');
		Object.assign(this, props);
	}

	/**
	 * Get last modified date as JS `Date` object.
	 * @returns {Date} - Date
	 */
	getLastMod() {
		return dosDateTimeToDate(this.lastModDate, this.lastModTime);
	}

	/**
	 * Get if entry is encrypted.
	 * @returns {boolean} - `true` if is encrypted
	 */
	isEncrypted() {
		return (this.generalPurposeBitFlag & 0x1) !== 0; // eslint-disable-line no-bitwise
	}

	/**
	 * Get if file data is compressed.
	 * Differs slightly from Yauzl's implementation, which only returns `true` if compression method
	 * is deflate. This returns `true` if it's compressed with *any* compression method.
	 * @returns {boolean} - `true` if file data is compressed
	 */
	isCompressed() {
		return this.compressionMethod !== 0;
	}

	/**
	 * Get readable stream for file data.
	 * @async
	 * @param {Object} [options] - Options
	 * @param {boolean} [options.decompress=true] - `false` to output raw data without decompression
	 * @param {boolean} [options.decrypt=true] - `false` to disable decryption if is encrypted
	 *   and output raw encrypted data
	 * @param {boolean} [options.validateCrc32=true] - `false` to skip CRC32 validation
	 * @param {number} [options.start] - Start offset (only valid if not decompressing)
	 * @param {number} [options.end] - End offset (only valid if not decompressing)
	 * @returns {Object} - Readable stream
	 */
	async openReadStream(options) {
		// Validate options
		let decompress, decrypt, validateCrc32, start, end;
		if (options != null) {
			assert(isObject(options), '`options` must be an object if provided');
			const unknownKey = Object.keys(options).find(
				key => !['decompress', 'decrypt', 'validateCrc32', 'start', 'end'].includes(key)
			);
			assert(unknownKey === undefined, `Unknown option '${unknownKey}'`);

			({decompress, decrypt, validateCrc32, start, end} = options);
		}

		if (decrypt == null) {
			decrypt = this.isEncrypted();
		} else {
			assert(isBoolean(decrypt), '`options.decrypt` must be a boolean if provided');
			if (!this.isEncrypted()) decrypt = false;
		}
		assert(!decrypt, 'Decryption is not supported');

		if (decompress == null) {
			decompress = this.isCompressed();
		} else {
			assert(isBoolean(decompress), '`options.decompress` must be a boolean if provided');
			if (!this.isCompressed()) decompress = false;
		}
		assert(
			!decompress || this.compressionMethod === 8,
			`Unsupported compression method ${this.compressionMethod}`
		);
		assert(!decompress || !this.isEncrypted(), 'Cannot decompress encrypted data');

		if (validateCrc32 == null) {
			validateCrc32 = decompress || !this.isCompressed();
		} else if (validateCrc32 === true) {
			assert(!decompress || !this.isCompressed(), 'Cannot validate CRC32 for uncompressed data');
		} else {
			assert(validateCrc32 === false, '`options.validateCrc32` must be a boolean if provided');
		}
		assert(!validateCrc32 || !this.isEncrypted(), 'Cannot validate CRC32 of encrypted data');

		if (start == null) {
			start = 0;
		} else if (start !== 0) {
			assert(isPositiveInteger(start), '`options.start` must be a positive integer if provided');
			assert(!decompress, 'Cannot stream a section of file if decompressing');
			assert(!validateCrc32, 'Cannot validate CRC32 for a section of file');
			assert(start <= this.compressedSize, '`start` is after end of file data');
		}

		if (end == null) {
			end = this.compressedSize;
		} else {
			assert(isPositiveIntegerOrZero(end), '`options.end` must be a positive integer if provided');
			assert(!decompress, 'Cannot stream a section of file if decompressing');
			assert(!validateCrc32, 'Cannot validate CRC32 for a section of file');
			assert(end <= this.compressedSize, '`end` is after end of file data');
			assert(end >= start, '`end` is before `start`');
		}

		// Read Local File Header.
		// Have already checked this read is in bounds in `readEntry()`.
		const buffer = await this.zip.reader.read(this.fileHeaderOffset, 30);
		// Bytes 0-3: Local File Header signature = 0x04034b50
		assert(buffer.readUInt32LE(0) === 0x04034b50, 'Invalid Local File Header signature');
		// All this should be redundant
		// Bytes 4-5: Version needed to extract (minimum)
		// Bytes 6-7: General Purpose Bit Flag
		// Bytes 8-9: Compression method
		// Bytes 10-11: File last modification time
		// Bytes 12-13: File last modification date
		// Bytes 14-17: CRC32
		const localCrc32 = buffer.readUInt32LE(14);
		// Bytes 18-21: Compressed size
		const localCompressedSize = buffer.readUInt32LE(18);
		// Bytes 22-23: Uncompressed size
		const localUncompressedSize = buffer.readUInt32LE(22);
		// Bytes 26-27: Filename length
		const filenameLength = buffer.readUInt16LE(26);
		// Bytes 28-29: Extra Fields length
		const extraFieldsLength = buffer.readUInt16LE(28);
		// Bytes 30-... - Filename + Extra Fields

		const fileDataOffset = this.fileHeaderOffset + 30 + filenameLength + extraFieldsLength;
		this.fileDataOffset = fileDataOffset;

		if (this.zip.isMacArchive || this.zip.isMaybeMacArchive) {
			// Check properties match Mac ZIP signature
			const matchesMacSignature = localCrc32 === 0
				&& localCompressedSize === 0
				&& localUncompressedSize === 0
				&& filenameLength === this.filenameLength
				&& extraFieldsLength === this.extraFields.length * MAC_LFH_EXTRA_FIELDS_LENGTH;
			if (this.zip.isMacArchive) {
				assert(matchesMacSignature, 'Misidentified Mac OS Archive Utility ZIP');
			} else if (!matchesMacSignature) {
				// Doesn't fit signature of Mac OS Archive Utility ZIP, so can't be one
				this.zip._setAsNotMacArchive();
			}
		}

		if (this.compressedSize !== 0) {
			assert(
				fileDataOffset + this.compressedSize <= this.zip.footerOffset,
				'File data overflows file bounds: '
				+ `${fileDataOffset} + ${this.compressedSize} > ${this.zip.footerOffset}`
			);
		}

		// Get stream
		let stream = this.zip.reader.createReadStream(fileDataOffset + start, end - start);

		// Pipe stream through decompress, CRC32 validation, and/or uncompressed size check transform streams
		const streams = [stream];
		if (decompress) {
			streams.push(createInflateRaw());
			// eslint-disable-next-line no-use-before-define
			if (this.zip.validateEntrySizes) streams.push(new ValidateUncompressedSizeStream(this));
		}

		// eslint-disable-next-line no-use-before-define
		if (validateCrc32) streams.push(new ValidateCrc32Stream(this.crc32));

		if (streams.length > 1) {
			pipeline(streams, () => {});
			stream = streams[streams.length - 1];
		}

		// Return stream
		return stream;
	}
}

module.exports = Entry;

class ValidateUncompressedSizeStream extends TransformStream {
	/**
	 * Transform stream to compare size of uncompressed stream to expected.
	 * If `entry.uncompressedSizeIsCertain === false`, only checks actual byte count is accurate
	 * in lower 32 bits. `entry.uncompressedSize` can be inaccurate in faulty Mac OS ZIPs where
	 * uncompressed size reported by ZIP is truncated to lower 32 bits.
	 * If it proves inaccurate, `entry.uncompressedSize` is updated,
	 * and ZIP is flagged as being Mac OS ZIP if it isn't already.
	 * @class
	 * @param {Object} entry - Entry object
	 */
	constructor(entry) {
		super();
		this.byteCount = 0;
		this.expectedByteCount = entry.uncompressedSize;
		this.entry = entry;
	}

	_transform(chunk, encoding, cb) {
		this.byteCount += chunk.length;
		if (this.byteCount > this.expectedByteCount) {
			if (this.entry.uncompressedSizeIsCertain) {
				cb(new Error(
					`Too many bytes in the stream. Expected ${this.expectedByteCount}, `
					+ `got at least ${this.byteCount}.`
				));
				return;
			}

			// Entry must be at least 4 GiB larger. ZIP must be faulty Mac OS ZIP.
			if (this.entry.uncompressedSize === this.expectedByteCount) {
				this.expectedByteCount += FOUR_GIB;
				this.entry.uncompressedSize = this.expectedByteCount;
				const {zip} = this.entry;
				if (!zip.isMacArchive) {
					if (!zip.isMaybeMacArchive) {
						// It shouldn't be possible for `isMaybeMacArchive` to be `false`.
						// But check here as failsafe, as the logic around handling maybe-Mac ZIPs is complex.
						// If there's a mistake in logic which does cause us to get here, `_setAsMacArchive()`
						// below could throw an error which would crash the whole process. Contain the damage.
						cb(new Error('Logic failure. Please raise an issue.'));
						return;
					}
					zip._setAsMacArchive(zip.numEntriesRead, zip._entryCursor);
				}
			} else {
				// Same entry must be being streamed simultaneously on another "thread",
				// and other stream overtook this one, and already increased size
				this.expectedByteCount = this.entry.uncompressedSize;
			}
		}

		cb(null, chunk);
	}

	_flush(cb) {
		if (this.byteCount < this.expectedByteCount) {
			cb(new Error(
				`Not enough bytes in the stream. Expected ${this.expectedByteCount}, got only ${this.byteCount}.`
			));
		} else {
			if (!this.entry.uncompressedSizeIsCertain) {
				// Uncompressed size was uncertain, but is now known.
				// Record size as certain, and remove from list of uncertain-sized entries.
				this.entry.uncompressedSizeIsCertain = true;
				const ref = this.entry._ref;
				if (ref) {
					this.entry._ref = null;
					this.entry.zip._uncertainUncompressedSizeEntryRefs.delete(ref);
					uncertainUncompressedSizeEntriesRegistry.unregister(ref);
				}
			}
			cb();
		}
	}
}

/**
 * Transform stream to calculate CRC32 of data and compare to expected.
 * @class
 */
class ValidateCrc32Stream extends TransformStream {
	constructor(crc32) {
		super();
		this.crc32 = 0;
		this.expectedCrc32 = crc32;
	}

	_transform(chunk, encoding, cb) {
		this.crc32 = calculateCrc32(chunk, this.crc32);
		cb(null, chunk);
	}

	_flush(cb) {
		if (this.crc32 !== this.expectedCrc32) {
			cb(new Error(`CRC32 validation failed. Expected ${this.expectedCrc32}, received ${this.crc32}.`));
		} else {
			cb();
		}
	}
}
