[![NPM version](https://img.shields.io/npm/v/yauzl-promise.svg)](https://www.npmjs.com/package/yauzl-promise)
[![Build Status](https://img.shields.io/github/actions/workflow/status/overlookmotel/yauzl-promise/test.yml?branch=master)](https://github.com/overlookmotel/yauzl-promise/actions)
[![Coverage Status](https://img.shields.io/coveralls/overlookmotel/yauzl-promise/master.svg)](https://coveralls.io/r/overlookmotel/yauzl-promise)

# Unzip library for NodeJS

[`yauzl`](https://www.npmjs.com/package/yauzl) was the best unzipping library for NodeJS. Sadly, it's been unmaintained for several years now, has some buggy behavior in modern NodeJS versions, and a rather dated callback API.

This library is a rewrite of `yauzl`, which retains all its features and careful adherence to the ZIP spec, but with the following improvements:

* Promise-based API
* Validation of CRC32 checksums to ensure data integrity (using fast Rust CRC32 calculation)
* Support for unzipping faulty ZIP files created by Mac OS Archive Utility (see [here](https://github.com/thejoshwolfe/yauzl/issues/69))
* Extract files from ZIP in parallel
* Additional options
* Bug fixes

API is mostly the same as `yauzl`, but some options and properties are renamed to be more consistent and less verbose. Notably, `entry.filename` property has a lower case `n` (`yauzl`'s property is called `fileName`).

It passes all of `yauzl`'s test suite.

Versions v1 - v3 were a wrapper around `yauzl`. v4 is a re-write from scratch.

## Usage

### Installation

```sh
npm install yauzl-promise
```

### Simple usage

Unzip all files from a ZIP file to a directory:

```js
const yauzl = require('yauzl-promise'),
  fs = require('fs'),
  {pipeline} = require('stream/promises');

const zip = await yauzl.open('/path/to/file.zip');
try {
  for await (const entry of zip) {
    if (entry.filename.endsWith('/')) {
      await fs.promises.mkdir(`/path/to/output/${entry.filename}`);
    } else {
      const readStream = await entry.openReadStream();
      const writeStream = fs.createWriteStream(
        `/path/to/output/${entry.filename}`
      );
      await pipeline(readStream, writeStream);
    }
  }
} finally {
  await zip.close();
}
```

### Open methods

All methods return an instance of [`yauzl.Zip`](#class-zip) class.

NB: `zip.close()` must be called when reading from the ZIP is complete, to avoid leaking a file descriptor, or other resources.

#### `open(path, [options])`

Opens ZIP file, ready for reading.

It maintains a single file descriptor for the file throughout - `fs.open()` is only called once.

Details of options [below](#open-methods-options).

```js
const yauzl = require('yauzl-promise');
const zip = await yauzl.open('/path/to/file.zip');
```

### `fromFd(fd, [options])`

Reads from the provided file descriptor, which is presumed to be an open `.zip` file.

Note that random access is required by the ZIP file specification, so the file descriptor cannot be an open socket or any other file descriptor that does not support random access.

### `fromBuffer(buffer, [options])`

Open ZIP file from a `Buffer` in memory. `buffer` must be a NodeJS `Buffer` object.

### `fromReader(reader, size, [options])`

This method of reading a ZIP file allows clients to implement their own back-end file system. For example, a client might translate read calls into network requests.

The `reader` parameter must be an instance of a subclass of [`yauzl.Reader`](#class-reader) which implements the required methods.

`size` must be the total size in bytes of the ZIP file.

### Open methods options

`options` may be omitted or `null`. The defaults are:

```js
{
  decodeStrings: true,
  validateEntrySizes: true,
  validateFilenames: true,
  strictFilenames: false,
  supportMacArchive: true
}
```

#### `decodeStrings`

When `true` (default), yauzl will decode strings with `CP437` or `UTF8` as required by the spec.

If set to `false`:

* `zip.comment`, `entry.filename`, and `entry.comment` will be `Buffer` objects instead of `String`s.
* Any Info-ZIP Unicode Path Extra Field will be ignored. See `extraFields`.
* Automatic filename validation will not be performed.

#### `validateEntrySizes`

When `true` (default), ensures that an entry's reported uncompressed size matches its actual uncompressed size.

This check happens as early as possible - during initial reading of entry (for entries with no compression), or during `openReadStream()` (for compressed entries).

#### `validateFilenames`

When `true` (default), entry filenames are validated not to be absolute or relative paths. If validation fails, an error is thrown.

`false` disables validation.

When `decodeStrings` is `false`, `validateFilenames` has no effect.

This functionality is also available via `yauzl.validateFilename()`.

#### `strictFilenames`

When `false` (default) and `decodeStrings` is `true`, all backslash (`\`) characters in each `entry.filename` are replaced with forward slashes (`/`).

The spec forbids filenames with backslashes, but Microsoft's `System.IO.Compression.ZipFile` class in .NET versions 4.5.0 until 4.6.1 creates non-conformant ZIP files with backslashes in filenames.
`strictFilenames` is `false` by default so that clients can read these non-conformant ZIP files without knowing about this Microsoft-specific bug.

When `strictFilenames`, `decodeStrings`, and `validateFilenames` options are all `true`, entries with backslashes in their filenames will result in an error.

#### `supportMacArchive`

When `true` (default), faulty ZIP files created by Mac OS Archive Utility can be unzipped successfully, despite being malformed.

Mac OS Archive Utility creates such faulty ZIPs when either (1) ZIP's size is over 4 GiB, (2) any file in the ZIP is over 4 GiB compressed or uncompressed, or (3) number of files in the ZIP exceeds 65535. See [yauzl#69](https://github.com/thejoshwolfe/yauzl/issues/69) for more details.

Handling these ZIPs does have a slight overhead. Also, in some *extremely* rare cases, it's possible it could also cause a valid ZIP to be mis-interpreted. So if you're sure ZIP is not created by Mac OS Archive Utility, you can disable the support for a very marginal performance improvement.

### `zip.close()`

Closes file and returns Promise which resolves when underlying file/file descriptor/reader is closed.

Files **must** be closed when finished with to avoid resource leakages.

```js
const zip = await yauzl.open('/path/to/file.zip');
// Read entries etc, and then...
await zip.close();
```

### Reading entries

#### `zip.readEntry()`

Read next entry from ZIP file. Return value is an instance of [`yauzl.Entry`](#class-entry) class.

When there are no entries left, returns `null`.

Calling `.readEntry()` again returns the next entry.

```js
const entry1 = await zip.readEntry();
const entry2 = await zip.readEntry();
```

#### `zip.readEntries([numEntries])`

Read up to `numEntries` entries, and return as an array.

```js
const [entry1, entry2] = await zip.readEntries(2);
const [entry3, entry4] = await zip.readEntries(2);
```

If `numEntries` is `null` or `undefined`, reading will continue until all entries are read.

WARNING: This is dangerous. If ZIP contains a large number of files, could lead to crash due to out of memory. Safer to use [async iteration](#async-iteration) instead.

#### Async iteration

`Zip`s can be used as async iterators, iterating over entries.

```js
const zip = await yauzl.open('/path/to/file.zip');
for await (const entry of zip) {
  // Do something with the entry
}
await zip.close();
```

### Reading file data

#### `zip.openReadStream(entry, [options])`

Open a readable stream for the contents of a ZIP file entry. Returns a promise of a stream.

`entry` must be an `Entry` object from this `Zip`.

```js
const readStream = await zip.openReadStream(entry);
readStream.pipe(writeStream);
```

It is possible to destroy the `readStream` before it has piped all of its data. To do this, call `readStream.destroy()`. This closes the specific stream, but not the ZIP file as a whole. The underlying file descriptor used for reading from the ZIP file remains open, so calling `zip.close()` is still required.

#### `entry.openReadStream([options])`

As above, but called on an `Entry` object.

```js
const entry = await zip.readEntry();
const readStream = await entry.openReadStream();
readStream.pipe(writeStream);
```

#### Options

`zip.openReadStream()` and `entry.openReadStream()` both take the following options:

* `decompress` - Set to `false` to disable decompressing compressed data.
* `decrypt` - Set to `false` to disable decrypting encrypted data.
* `validateCrc32` - Set to `false` to disable validation of CRC32 checksum of file data.
* `start` - Stream range of file data beginning at byte index `start`.
* `end` - Stream range of file data ending at byte index `end` (exclusive).

`start` and `end` options can only be used if `decompress`, `decrypt` and `validateCrc32` are all `false`.

Specifying `decrypt: false` for an encrypted entry causes the readable stream to provide the raw, still-encrypted file data (including the 12-byte header described in the spec).

### Utilities

#### `dosDateTimeToDate(date, time)`

Converts MS-DOS `date` and `time` data into a JavaScript `Date` object. Each parameter is a `Number`, treated as an unsigned 16-bit integer. Note that DOS date/time format does not support timezones, so the date will be interpreted as UTC.

```js
const entry = await zip.readEntry();
const date = yauzl.dosDateTimeToDate(entry.lastModDate, entry.lastModTime);
```

NB: Original `yauzl` interpreted dates according to local timezone. UTC is used here instead to ensure consistent result when unzipping the same ZIP anywhere.

#### `validateFileName(filename)`

Checks filename is not absolute or relative path, and does not contain backslashes (`\`). Throws an error if it does.

This function is automatically run for each entry, as long as `decodeStrings` and `validateFilenames` options are `true`.

### Class: `Zip`

Instances of `Zip` class are returned by `open()`, `fromFd()`, `fromBuffer()`, and `fromReader()`. The constructor for the class is not part of the public API.

#### `zip.isOpen`

`Boolean`. `true` if `Zip` is open for reading. `false` if `zip.close()` has been called.

#### `zip.entryCount`

`Number`. Total number of entries in ZIP file.

#### `zip.entryCountIsCertain`

`Boolean`. `true` if `entryCount` can be relied on for accuracy.

Mac OS Archive Utility truncates `entryCount` to 16 bits (i.e. max 65535), so it can be inaccurate.

Where the ZIP file has been identified as possibly a Mac OS ZIP, and it's possible `entryCount` is inaccurate, `entryCountIsCertain` will be `false`. In this case, actual number of entries may be higher than reported (but not lower).

As entries are read with `readEntry()`, `entryCount` will be increased if it becomes evident that there are more entries than reported. Once `entryCount` is determined to definitely be accurate, `entryCountIsCertain` will change to `true`.

#### `zip.comment`

`String`. Always decoded with `CP437` per the spec.

If `options.decodeStrings` is `false`, this field is the undecoded `Buffer` instead of a decoded `String`.

#### `zip.isZip64`

`true` if ZIP file uses ZIP64 extension (allowing more than 65535 files, or file data larger than 4 GiB).

#### `zip.isMacArchive`

`Boolean`. `true` if ZIP is a faulty Mac OS Archive Utility ZIP. `false` if it's not known to be.

`zip.isMaybeMacArchive` indicates whether ZIP *may* be a Mac OS Archive Utility ZIP.

You don't need to worry about either of these properties - they're mainly for the internal logic of this package - but if you happen to be interested, the possible states are:

* `isMacArchive = true`: Definitely a faulty Mac OS Archive Utility ZIP.
* `isMaybeMacArchive = true`: ZIP possibly created by Mac OS Archive Utility (very probably it is).
* `isMaybeMacArchive = false`: ZIP definitely not created by versions Mac OS Archive Utility which produce faulty ZIPs.

Both properties are updated by `readEntry()` and `openReadStream()`, as more about the ZIP file becomes known.

### Class: `Entry`

Instances of `Entry` class are returned by `zip.readEntry()`, `zip.readEntries()`, or using a `Zip` as an async iterator. The constructor for the class is not part of the public API.

Objects of this class represent ZIP file entries. Refer to the [ZIP file specification](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) for more details about these fields.

These fields are of type `Number`:

 * `versionMadeBy`
 * `versionNeededToExtract`
 * `generalPurposeBitFlag`
 * `compressionMethod`
 * `lastModDate` (MS-DOS format, see [`getLastMod()`](#entrygetlastmod))
 * `lastModTime` (MS-DOS format, see [`getLastMod()`](#entrygetlastmod))
 * `crc32`
 * `compressedSize`
 * `uncompressedSize`
 * `internalFileAttributes`
 * `externalFileAttributes`
 * `fileHeaderOffset`
 * `fileDataOffset` (usually unpopulated until [`openReadStream()`](#reading-file-data) is called)

In addition:

#### `entry.filename`

`String`. Following the spec, the bytes for the filename are decoded as
`UTF8` if `generalPurposeBitFlag & 0x800`, otherwise as `CP437`. Alternatively, this field may be populated from the Info-ZIP Unicode Path Extra Field (see [`extraFields`](#entryextrafields)).

This field is automatically validated unless `decodeStrings` or `validateFilenames` options are false.

If `decodeStrings` option is `false`, this field is the undecoded `Buffer` instead of a decoded `String`. In that case, `generalPurposeBitFlag` and any Info-ZIP Unicode Path Extra Field are ignored.

NB: In original `yauzl`, this field was named `fileName` (capital `N`).

#### `entry.uncompressedSizeIsCertain`

`Boolean`. `true` if `uncompressedSize` is reliable.

Mac OS Archive Utility truncates `uncompressedSize` to 32 bits (i.e. max size 4 GiB), so it is inaccurate for files >= 4 GiB in size.

Where the ZIP file has been identified as possibly a Mac OS ZIP, and it's possible `uncompressedSize` is inaccurate, `uncompressedSizeIsCertain` will be `false`. In this case, actual `uncompressedSize` may be higher than reported (but not lower).

After `openReadStream()` has completed streaming out the file, `uncompressedSize` will be updated to reflect the accurate uncompressed data size, and `uncompressedSizeIsCertain` will change to `true`. NB: This doesn't happen if either decompression (`decompress` option) or entry size validation (`validateEntrySizes` option) are disabled. Both are enabled by default.

#### `entry.extraFields`

`Array` with each entry in the form `{id, data}`, where `id` is a `Number` and `data` is a `Buffer`.

This library looks for and reads the ZIP64 Extended Information Extra Field (0x0001) in order to support ZIP64 format ZIP files.

This library also looks for and reads the Info-ZIP Unicode Path Extra Field (0x7075) in order to support some ZIP files that use it instead of General Purpose Bit 11 to convey `UTF8` filenames. When the field is identified and verified to be reliable (see the ZIP file spec), the filename in this field is stored in the `filename` property, and the filename in the central directory record for this entry is ignored. When `decodeStrings` is `false`, any Info-ZIP Unicode Path Extra Fields are ignored.

None of the other fields are considered significant by this library. Fields that this library reads are left unaltered in the `extraFields` array.

#### `entry.comment`

`String` decoded with the charset indicated by `generalPurposeBitFlag & 0x800`, as with `filename` (the Info-ZIP Unicode Path Extra Field has no effect on the charset used for this field).

If `decodeStrings` is `false`, this field is the undecoded `Buffer` instead of a decoded `String`.

#### `entry.getLastMod()`

Get last mod date as a `Date` object. Effectively implemented as:

```js
dosDateTimeToDate(entry.lastModDate, entry.lastModTime)
```

See [`dosDateTimeToDate()`](#dosdatetimetodatedate-time).

#### `entry.isEncrypted()`

Returns whether this entry is encrypted with "Traditional Encryption". Effectively implemented as:

```js
(entry.generalPurposeBitFlag & 0x1) !== 0
```

Note that "Strong Encryption" is not supported, and will result in an error.

#### `entry.isCompressed()`

Effectively implemented as:

```js
entry.compressionMethod !== 0
```

NB: This differs slightly from original `yauzl`'s behavior. `yauzl` would return `false` for an entry which is compressed, but with a compression method other than `8` (Deflate compression).

### Class: `Reader`

This class is meant to be subclassed by clients and instantiated for the `fromReader()` function.

If creating your own `Reader` subclass, it should provide the following methods:

* `_createReadStream(start, length)` (required)
* `async _read(start, length)` (optional)
* `async _open()` (optional)
* `async _close()` (optional)

The file readers provided by `yauzl` for `open()` etc are subclasses of `Reader`. Their implementations can be found in `lib/reader.js`.

## Versioning

This module follows [semver](https://semver.org/). Breaking changes will only be made in major version updates.

All active NodeJS release lines are supported (v16+ at time of writing). After a release line of NodeJS reaches end of life according to [Node's LTS schedule](https://nodejs.org/en/about/releases/), support for that version of Node may be dropped at any time, and this will not be considered a breaking change. Dropping support for a Node version will be made in a minor version update (e.g. 1.2.0 to 1.3.0). If you are using a Node version which is approaching end of life, pin your dependency of this module to patch updates only using tilde (`~`) e.g. `~1.2.3` to avoid breakages.

## Tests

Use `npm test` to run the tests. Use `npm run cover` to check coverage.

Use `npm run test-mac-big` to run additional tests on large Mac OS ZIP files. These tests are slow.

## Changelog

See [changelog.md](https://github.com/overlookmotel/yauzl-promise/blob/master/changelog.md)

## Issues

If you discover a bug, please raise an issue on Github. https://github.com/overlookmotel/yauzl-promise/issues

## Contribution

Pull requests are very welcome. Please:

* ensure all tests pass before submitting PR
* add tests for new features
* document new functionality/API additions in README
* do not add an entry to Changelog (Changelog is created when cutting releases)
