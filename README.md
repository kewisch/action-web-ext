web-ext GitHub Action
=====================

[![Build Status](https://github.com/kewisch/action-web-ext/workflows/Build/badge.svg)](https://github.com/kewisch/action-web-ext/actions?workflow=Build)

This action allows you to run a few [mozilla/web-ext](https://github.com/mozilla/web-ext) commands
useful during add-on development. It supports `lint`, `build` and `sign`.

Generally you can use these inputs:

* `cmd`: The command to run (lint, build, sign)
* `source`: The directory the add-on is in. For `sign`, this should be the xpi file instead
* `artifacts`: The output directory, defaults to web-ext-artifacts
* `verbose`: Output more debugging if set to true
* `progressBar`: Enable the console progress bar
* `channel`: The channel to use, `listed` or `unlisted`

There are a few more specific to each command.

lint
----

Linting supports annotations, this is great for pull requests. Folders `.git`, `.github` and
`web-ext-artifacts` are automatically ignored. A token is not required for this action, though if
`GITHUB_TOKEN` is in the environment, it will be used to create a check run.

```yaml
name: "Lint"
on:
  push:
    branches:
      - master
  pull_request:

jobs:
  lint:
    name: "Lint"
    runs-on: ubuntu-latest
    steps:
      - name: "Checkout"
        uses: actions/checkout@v1

      - name: "web-ext lint"
        uses: kewisch/action-web-ext@v1
        with:
          cmd: lint
          source: src
          channel: listed
```

build
-----

A simple web-ext build. Folders `.git`, `.github` and `web-ext-artifacts` are automatically ignored.
You can use the `target` output for subsequent steps.

You can use the following extra options:
* `filename`: Template string for the packed extension's filename, available for download through the job's artifacts. The placeholders in braces (`{...}`) are replaced by the corresponding entries in the extension's `manifest.json`. E.g. `"{name}-{version}.xpi"`.

```yaml
name: "Build"
on:
  push:
    branches:
      - master
  pull_request:

jobs:
  build:
    name: "Build"
    runs-on: ubuntu-latest
    steps:
      - name: "Checkout"
        uses: actions/checkout@v1

      - name: "web-ext build"
        id: web-ext-build
        uses: kewisch/action-web-ext@v1
        with:
          cmd: build
          source: src
          filename: "{name}-{version}.xpi"

      - name: "Upload Artifact"
        uses: actions/upload-artifact@master
        with:
          name: target.xpi
          path: ${{ steps.web-ext-build.outputs.target }}
```

sign
----

Send the add-on for signature to AMO. To reduce the load on AMO servers, please don't use this for
on-commit or nightly builds. If you want to test your add-on you can do so in `about:debugging`.
Using this for betas or releases is great though, especially in combination with
[softprops/action-gh-release](https://github.com/softprops/action-gh-release). Under the hood, the
action uses [mozilla/sign-addon](https://github.com/mozilla/sign-addon). Please note that listed
add-ons will not be signed immediately, this is indicated during the build process but is not
counted as a failure.

You can use the following extra options:
* `apiKey`: The API key used for signing
* `apiSecret`: The API secret used for signing
* `apiUrlPrefix`: The URL of the signing API, defaults to AMO production
* `timeout`: The number of milliseconds to wait before giving up on a response from Mozilla's web
   service. Defaults to 900000 ms (15 minutes).

Changing `apiUrlPrefix` will allow you to submit to
[addons.thunderbird.net](https://addons.thunderbird.net) or using the staging/dev instance.

```yaml
name: "Release"
on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  sign:
    name: "Release"
    runs-on: ubuntu-latest
    steps:
      - name: "Checkout"
        uses: actions/checkout@v1

      - name: "web-ext build"
        id: web-ext-build
        uses: kewisch/action-web-ext@v1
        with:
          cmd: build
          source: src

      - name: "web-ext sign"
        id: web-ext-sign
        uses: kewisch/action-web-ext@v1
        with:
          cmd: sign
          source: ${{ steps.web-ext-build.outputs.target }}
          channel: unlisted
          apiKey: ${{ secrets.AMO_SIGN_KEY }}
          apiSecret: ${{ secrets.AMO_SIGN_SECRET }}
          timeout: 900000

      - name: "Create Release"
        uses: softprops/action-gh-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          files: ${{ steps.web-ext-sign.outputs.target }}
```
