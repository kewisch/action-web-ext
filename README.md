web-ext GitHub Action
=====================

[![Build](https://github.com/kewisch/action-web-ext/actions/workflows/ci.yml/badge.svg)](https://github.com/kewisch/action-web-ext/actions/workflows/ci.yml)

This action allows you to run a few [mozilla/web-ext](https://github.com/mozilla/web-ext) commands
useful during add-on development. It supports `lint`, `build` and `sign`.

Generally you can use these inputs:

* `cmd`: The command to run (lint, build, sign)
* `source`: The directory the add-on is in. For `sign`, this should be the xpi file instead
* `artifacts`: The output directory, defaults to web-ext-artifacts
* `verbose`: Output more debugging if set to true
* `channel`: The channel to use, `listed` or `unlisted`
* `ignoreFiles`: A json string containing an array of files to be ignored. Web-ext by default already ignores the most frequently ignored files.

There are a few more specific to each command.

lint
----

Linting supports annotations, this is great for pull requests. A token is not required for this action, though if
`GITHUB_TOKEN` is in the environment, it will be used to create a check run that gives you more detailed information.

```yaml
name: "Lint"
on:
  push:
    branches:
      - main
  pull_request:

jobs:
  lint:
    name: "Lint"
    runs-on: ubuntu-latest
    steps:
      - name: "Checkout"
        uses: actions/checkout@v4

      - name: "web-ext lint"
        uses: kewisch/action-web-ext@v1
        with:
          cmd: lint
          source: src
          channel: listed
```

build
-----

A simple web-ext build.
You can use the `target` output for subsequent steps.

You can use the following extra options:
* `filename`: Template string for the packed extension's filename, available for download through the job's artifacts. The placeholders in braces (`{...}`) are replaced by the corresponding entries in the extension's `manifest.json`. E.g. `"{name}-{version}.xpi"`.

```yaml
name: "Build"
on:
  push:
    branches:
      - main
  pull_request:

jobs:
  build:
    name: "Build"
    runs-on: ubuntu-latest
    steps:
      - name: "Checkout"
        uses: actions/checkout@v4

      - name: "web-ext build"
        id: web-ext-build
        uses: kewisch/action-web-ext@v1
        with:
          cmd: build
          source: src
          filename: "{name}-{version}.xpi"
          ignoreFiles: '[ "package.json","package-lock.json","yarn.lock" ]'

      - name: "Upload Artifact"
        uses: actions/upload-artifact@v4
        with:
          name: target.xpi
          path: ${{ steps.web-ext-build.outputs.target }}
```

sign
----

Send the add-on for signature to AMO. To reduce the load on AMO servers, please don't use this for
on-commit or nightly builds. If you want to test your add-on you can do so in `about:debugging`.
Using this for betas or releases is great though. Please note that listed add-ons will not be signed
immediately, this is indicated during the build process but is not counted as a failure.

You can use the following extra options:
* `sourceCode`: Submit a zip with source code to adhere to the source code submission policy.
* `metaDataFile`: A JSON file with additional metadata for the version release. See example below
   for details.
* `approvalNotes`: A shortcut to set .version.approval_notes in the submitted metadata.
* `releaseNotes`: A shortcut to set .version.release_notes in the submitted metadata.
* `license`: The license for the version. See example below for details.
* `licenseFile`: If using a custom license, the license file to submit.
* `apiKey`: The API key used for signing.
* `apiSecret`: The API secret used for signing.
* `apiUrlPrefix`: The URL of the signing API, defaults to AMO production.
* `timeout`: The number of milliseconds to wait before giving up on a response from Mozilla's web
   service. Defaults to 900000 ms (15 minutes).

Changing `apiUrlPrefix` to https://addons.thunderbird.net/api/v4 will allow you to submit to
[addons.thunderbird.net](https://addons.thunderbird.net), or you can make use of the
[staging/dev instances](https://mozilla.github.io/addons-server/topics/api/index.html#external-api).

Please see the example below on how to use the sign command.

Complete example
----------------

This is a complete example of a publish script. It is triggered when you create and publish a
release on GitHub. You can of course also turn things around and trigger on tag creation, and
subsequently create the release if the upload succeeds.

```yaml
name: "Publish"
on:
  release:
    types: [published]

jobs:
  sign:
    name: "Release"
    runs-on: ubuntu-latest
    steps:
      - name: "Checkout"
        uses: actions/checkout@v4

      - name: "web-ext lint"
        uses: kewisch/action-web-ext@v1
        with:
          cmd: lint
          source: src
          channel: listed

      - name: "web-ext build"
        id: web-ext-build
        uses: kewisch/action-web-ext@v1
        with:
          cmd: build
          source: src

      - name: "Collect sources"
        run: git archive --format=zip --output=sources.zip ${{ github.ref }}

      - name: "Collect metadata"
        id: metadata
        run: echo "json=$(jq -c . < amo_metadata.json)" >> $GITHUB_OUTPUT

      - name: "web-ext sign AMO"
        id: web-ext-sign
        uses: kewisch/action-web-ext@v1
        with:
          cmd: sign

          # Source must be the zip/xpi file of the add-on. If your add-on is required to submit
          # source as per https://extensionworkshop.com/documentation/publish/source-code-submission/
          # policy, you can use sourceCode with a zip file of the original sources. Submitting
          # source code is not always required, don't do so if you don't need to.
          source: ${{ steps.web-ext-build.outputs.target }}
          sourceCode: sources.zip
          channel: unlisted

          # Various metadata you can set through the API. See the documentation for the
          # --amo-metadata parameter to web-ext sign at
          # https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-sign
          # for more information. You can leave out metaDataFile if all you want to set is approval
          # notes, release notes, or a license.
          metaDataFile: amo_metadata.json
          approvalNotes: "Please find more information at https://github.com/kewisch/action-web-ext"
          releaseNotes: ${{ github.event.release.body }}

          # You can set one of the known licenses from
          # https://mozilla.github.io/addons-server/topics/api/licenses.html#license-list
          # by just passing the license property. If you have a custsom license, read it from a
          # file as follows.
          license: Apache-2.0       # You only need to specify a license file if you are using a
          licenseFile: LICENSE.md   # custom license. Please see action.yml for details.

          # Specify API secrets. No need to specify apiUrlPrefix, it defaults to AMO production
          apiKey: ${{ secrets.AMO_SIGN_KEY }}
          apiSecret: ${{ secrets.AMO_SIGN_SECRET }}
          timeout: 900000

      - name: "web-ext sign ATN"
        id: web-ext-sign
        uses: kewisch/action-web-ext@v1
        with:
          # This is how to sign for Thunderbird. Note that Thunderbird uses API v4, where many
          # metadata fields are not supported.
          cmd: sign
          source: ${{ steps.web-ext-build.outputs.target }}
          channel: listed
          apiUrlPrefix: "https://addons.thunderbird.net/api/v4"
          apiKey: ${{ secrets.ATN_SIGN_KEY }}
          apiSecret: ${{ secrets.ATN_SIGN_SECRET }}

      - name: "Attach release assets to release"
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release upload ${{ github.event.release.tag_name }} \
            ${{ steps.web-ext-sign.outputs.target }}

```
