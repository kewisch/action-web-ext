/* --------------------
 * yauzl-promise module
 * Reader classes
 * ------------------*/

'use strict';

// Modules
const fs = require('fs'),
	{PassThrough: PassThroughStream, Readable: ReadableStream} = require('stream'),
	{promisify} = require('util'),
	{isPositiveIntegerOrZero} = require('is-it-type'),
	assert = require('simple-invariant');

const openAsync = promisify(fs.open),
	closeAsync = promisify(fs.close);

// Imports
const {streamToBuffer} = require('./utils.js');

// Exports

/**
 * `Reader` class.
 * `FileReader`, `FdReader` and `BufferReader` subclass this.
 *
 * Users can create custom `Reader`s by subclassing and implementing the following methods:
 *   - `_createReadStream(start, length)` (required)
 *   - `_read(start, length)` (optional)
 *   - `_open()` (optional)
 *   - `_close()` (optional)
 */
class Reader {
	constructor() {
		this.isOpen = false;
		this.readCount = 0;
	}

	/**
	 * Open reader.
	 * Calls `._open()` method defined by subclass.
	 * If already open, does nothing.
	 * @async
	 * @returns {undefined}
	 */
	async open() {
		if (this.isOpen) return;
		this.isOpen = true;
		await this._open();
	}

	/**
	 * Close reader.
	 * Calls `._close()` method defined by subclass.
	 * If already closed, does nothing.
	 * @async
	 * @returns {undefined}
	 * @throws {Error} - If Reader is currently being read from
	 */
	async close() {
		if (!this.isOpen) return;
		assert(this.readCount === 0, 'Cannot close while reading in progress');
		this.isOpen = false;
		await this._close();
	}

	/**
	 * Read bytes into Buffer.
	 * @async
	 * @param {number} start - Starting position to read at
	 * @param {number} length - Number of bytes to read
	 * @returns {Buffer} - Buffer
	 * @throws {Error} - If Reader is not open
	 */
	async read(start, length) {
		// Don't validate `start` + `length` because this is called so often
		assert(this.isOpen, 'Cannot call `read()` on a reader which is not open');

		if (length === 0) return Buffer.allocUnsafe();

		this.readCount++;
		try {
			return await this._read(start, length);
		} finally {
			this.readCount--;
		}
	}

	/**
	 * Create readable stream to read from Reader.
	 * @param {number} start - Position to start reading at
	 * @param {number} length - Number of bytes to read
	 * @returns {Object} - Readable stream
	 * @throws {Error} - If arguments invalid or reader is not open
	 */
	createReadStream(start, length) {
		// Validate input
		assert(isPositiveIntegerOrZero(start), '`start` must be a positive integer or zero');
		assert(isPositiveIntegerOrZero(length), '`length` must be a positive integer or zero');

		// Error if not open
		assert(this.isOpen, 'Cannot call `createReadStream()` on a reader which is not open');

		// Return empty stream for zero-size request
		if (length === 0) {
			const emptyStream = new PassThroughStream();
			setImmediate(() => emptyStream.end());
			return emptyStream;
		}

		// Get stream
		this.readCount++;
		try {
			const stream = this._createReadStream(start, length);

			// Mark stream as ended on an `end`, `error` or  `close` event.
			// In Node v16, these events don't reliably fire if stream is destroyed with `.destroy()`
			// so capture that too.
			let isEnded = false;
			const onEnd = () => {
				if (isEnded) return;
				isEnded = true;
				this.readCount--;
			};

			const originalDestroy = stream.destroy;
			stream.destroy = function(err) {
				onEnd();
				return originalDestroy.call(this, err);
			};

			stream.on('end', onEnd);
			stream.on('error', onEnd);
			stream.on('close', onEnd);

			return stream;
		} catch (err) {
			this.readCount--;
			throw err;
		}
	}

	/**
	 * Open Reader.
	 * Default implementation does nothing. Subclasses can optionally implement this.
	 * @async
	 * @returns {undefined}
	 */
	async _open() {} // eslint-disable-line class-methods-use-this, no-empty-function

	/**
	 * Close Reader.
	 * Default implementation does nothing. Subclasses can optionally implement this.
	 * @async
	 * @returns {undefined}
	 */
	async _close() {} // eslint-disable-line class-methods-use-this, no-empty-function

	/**
	 * Read bytes from Reader into a Buffer.
	 * Subclasses can override this.
	 * @async
	 * @param {number} start - Starting position to read at
	 * @param {number} length - Number of bytes to read
	 * @returns {Buffer} - Buffer
	 */
	async _read(start, length) {
		const stream = this._createReadStream(start, length);
		const buffer = await streamToBuffer(stream);
		assert(buffer.length === length, 'Unexpected end of file');
		return buffer;
	}

	// eslint-disable-next-line jsdoc/require-returns-check
	/**
	 * Create readable stream to read from Reader.
	 * Subclasses must implement this.
	 * @param {number} start - Position to start reading at
	 * @param {number} length - Number of bytes to read
	 * @returns {Object} - Readable stream
	 * @throws {Error} - If fail to create stream
	 */
	_createReadStream(start, length) { // eslint-disable-line class-methods-use-this, no-unused-vars
		throw new Error('Not implemented');
	}
}

// Shim of `fs` module to prevent file descriptor being closed if stream is destroyed
const shimmedFs = {
	open() {
		throw new Error(
			'Shimmed FS `open` method should not be called. If you get this error, please raise an issue.'
		);
	},
	read(...args) {
		return fs.read(...args);
	},
	close(fd, cb) {
		setImmediate(() => cb(null));
	}
};

class FdReader extends Reader {
	/**
	 * Create `FdReader`.
	 * @param {number} fd - File descriptor
	 */
	constructor(fd) {
		super();
		this.fd = fd;
	}

	_close() {
		return closeAsync(this.fd);
	}

	_read(start, length) {
		return new Promise((resolve, reject) => {
			const buffer = Buffer.allocUnsafe(length);
			fs.read(this.fd, buffer, 0, length, start, (err, bytesRead) => {
				if (err) {
					reject(err);
				} else if (bytesRead !== length) {
					reject(new Error('Unexpected end of file'));
				} else {
					resolve(buffer);
				}
			});
		});
	}

	_createReadStream(start, length) {
		// Use shimmed `fs` with inactive `close()` method,
		// to prevent file descriptor getting closed when stream ends.
		// `autoClose` option works for this purpose when stream ends naturally,
		// but FD still gets closed if `.destroy()` is called.
		// Shimming FS is only way I around this that I could find.
		return fs.createReadStream(null, {start, end: start + length - 1, fd: this.fd, fs: shimmedFs});
	}
}

class FileReader extends Reader {
	/**
	 * Create `FileReader`.
	 * @param {string} path - File path
	 */
	constructor(path) {
		super();
		this.path = path;
		this.fd = null;
	}

	async _open() {
		this.fd = await openAsync(this.path, 'r', 0o444);
	}

	async _close() {
		await closeAsync(this.fd);
		this.fd = null;
	}
}
FileReader.prototype._read = FdReader.prototype._read;
FileReader.prototype._createReadStream = FdReader.prototype._createReadStream;

class BufferReader extends Reader {
	/**
	 * Create `BufferReader`.
	 * @param {Buffer} buffer - Buffer
	 */
	constructor(buffer) {
		super();
		this.buffer = buffer;
	}

	async _read(start, length) {
		const end = start + length;
		assert(end <= this.buffer.length, 'Cannot read beyond end of buffer');
		return this.buffer.subarray(start, end);
	}

	_createReadStream(start, length) {
		const end = start + length;
		assert(end <= this.buffer.length, 'Cannot read beyond end of buffer');
		const slice = this.buffer.subarray(start, end);
		return ReadableStream.from(slice);
	}
}

module.exports = {Reader, FdReader, FileReader, BufferReader};
