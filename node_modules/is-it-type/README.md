[![NPM version](https://img.shields.io/npm/v/is-it-type.svg)](https://www.npmjs.com/package/is-it-type)
[![Build Status](https://img.shields.io/github/workflow/status/overlookmotel/is-it-type/Test.svg)](https://github.com/overlookmotel/is-it-type/actions)
[![Dependency Status](https://img.shields.io/david/overlookmotel/is-it-type.svg)](https://david-dm.org/overlookmotel/is-it-type)
[![Dev dependency Status](https://img.shields.io/david/dev/overlookmotel/is-it-type.svg)](https://david-dm.org/overlookmotel/is-it-type)
[![Coverage Status](https://img.shields.io/coveralls/overlookmotel/is-it-type/master.svg)](https://coveralls.io/r/overlookmotel/is-it-type)

# Determine type of a variable

All the functions from [core-util-is](https://www.npmjs.com/package/core-util-is) plus a few extras, in both CJS and ESM formats for use in Node.js or browser.

## Usage

### Import

```js
const { isString } = require('is-it-type');
```

or:

```js
import { isString } from 'is-it-type';
```

### Use a method

```js
isString('abc'); // true
```

All methods return `true` or `false`.

## Methods

### Same as [core-util-is](https://www.npmjs.com/package/core-util-is):

* `isArray`
* `isBoolean`
* `isNull`
* `isNullOrUndefined`
* `isNumber`
* `isString`
* `isSymbol`
* `isUndefined`
* `isRegExp`
* `isDate`
* `isError`
* `isFunction`
* `isPrimitive`

NB [core-util-is](https://www.npmjs.com/package/core-util-is)'s `isBuffer` is not included. `isObject` method differs from [core-util-is](https://www.npmjs.com/package/core-util-is)'s method of same name (see [below](#objects)).

### Additional functions

#### Strings

* `isEmptyString` - `true` if `=== ''`
* `isFullString` - `true` if a string which `!== ''`

#### Numbers

* `isInteger` - `true` if is an integer number (positive, negative or zero)
* `isPositiveInteger` - `true` if is an integer number > 0
* `isPositiveIntegerOrZero` - `true` if is an integer number >= 0
* `isNegativeInteger` - `true` if is an integer number < 0
* `isNegativeIntegerOrZero` - `true` if is an integer number <= 0

#### Objects

* `isObject` - `true` if passed object (not including arrays, regexps and other built-ins)
* `isEmptyObject` - `true` if passed object with no properties

#### Other

* `isType( type, input )` - `true` if `typeof input === type`

## Versioning

This module follows [semver](https://semver.org/). Breaking changes will only be made in major version updates.

All active NodeJS release lines are supported (v12+ at time of writing). After a release line of NodeJS reaches end of life according to [Node's LTS schedule](https://nodejs.org/en/about/releases/), support for that version of Node may be dropped at any time, and this will not be considered a breaking change. Dropping support for a Node version will be made in a minor version update (e.g. 1.2.0 to 1.3.0). If you are using a Node version which is approaching end of life, pin your dependency of this module to patch updates only using tilde (`~`) e.g. `~1.2.3` to avoid breakages.

## Tests

Use `npm test` to run the tests. Use `npm run cover` to check coverage.

## Changelog

See [changelog.md](https://github.com/overlookmotel/is-it-type/blob/master/changelog.md)

## Issues

If you discover a bug, please raise an issue on Github. https://github.com/overlookmotel/is-it-type/issues

## Contribution

Pull requests are very welcome. Please:

* ensure all tests pass before submitting PR
* add tests for new features
* document new functionality/API additions in README
* do not add an entry to Changelog (Changelog is created when cutting releases)
