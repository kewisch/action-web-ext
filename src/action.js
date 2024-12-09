/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2019 */

import path from "path";
import fs from "fs";

import JSZip from "jszip";
import webExt from "web-ext";
import { consoleStream } from "web-ext/util/logger";
import { signAddon as signAddonV5 } from "../node_modules/web-ext/lib/util/submit-addon.js";
import { signAddon as signAddonV4 } from "sign-addon";

import * as github from "@actions/github";
import * as core from "@actions/core";

const KNOWN_LICENSES = new Set([
  "all-rights-reserved", "MPL-2.0", "Apache-2.0", "GPL-2.0-only", "GPL-3.0-only", "LGPL-2.1-only",
  "LGPL-3.0-only", "AGPL-3.0-only", "MIT", "ISC", "BSD-2-Clause", "Unlicense"
]);
async function getManifest(xpi) {
  try {
    let data = await fs.promises.readFile(xpi);
    let zip = await JSZip.loadAsync(data);

    let manifest = await zip.file("manifest.json").async("string");
    return JSON.parse(manifest);
  } catch (e) {
    throw new Error(`Could not parse manifest from ${xpi}: ${e}`, { cause: e });
  }
}

export default class WebExtAction {
  constructor(options) {
    this.options = options;

    if (this.options.verbose) {
      consoleStream.makeVerbose();
    }
  }

  async run(cmd, ...args) {
    let runner = this["cmd_" + cmd];
    if (typeof runner != "function") {
      throw new Error(`The command ${cmd} does not exist`);
    }
    return runner.apply(this, args);
  }

  async cmd_lint() {
    function linterToAnnotationProperty(data) {
      return {
        title: data.message,
        file: data.file,
        startLine: data.line || 1,
        startColumn: data.column
      };
    }

    function linterToString(message) {
      let prefix = message._type[0].toUpperCase() + message._type.substr(1);
      return `${prefix}: ${message.file}${":" + (message.line || "")} - ${message.message}`;
    }

    let results = await webExt.cmd.lint({
      sourceDir: this.options.sourceDir,
      artifactsDir: this.options.artifactsDir,
      selfHosted: this.options.channel == "unlisted",
      output: this.options.verbose ? "text" : "none",
      ignoreFiles: this.options.ignoreFiles,
    }, {
      shouldExitProgram: false
    });

    let annotations = results.errors.concat(results.warnings).concat(results.notices);

    if (annotations.length > 10) {
      core[annotations[9]._type]("Only the first 9 linting messages are shown, please fix them first");
      console.log(annotations.map(linterToString).join("\n") + "\n");
      annotations.splice(9);
    }

    for (let message of annotations) {
      core[message._type](message.description, linterToAnnotationProperty(message));
    }

    let summary = results.summary;
    let summaryLine = `${summary.errors} Errors, ${summary.warnings} Warnings, ${summary.notices} Notices`;
    if (results.errors.length) {
      throw new Error(summaryLine);
    } else {
      console.log(summaryLine);
    }
  }

  async cmd_build() {
    let results = await webExt.cmd.build({
      sourceDir: this.options.sourceDir,
      artifactsDir: this.options.artifactsDir,
      filename: this.options.extensionFilenameTemplate || undefined,
      overwriteDest: true,
      ignoreFiles: this.options.ignoreFiles,
    }, {
      showReadyMessage: false,
      shouldExitProgram: false
    });

    return {
      target: results.extensionPath,
      name: path.basename(results.extensionPath)
    };
  }

  async cmd_sign() {
    let isFile = await fs.promises.stat(this.options.sourceDir).then(stats => stats.isFile(), e => false);
    if (!isFile) {
      throw new Error("You must pass the zip/xpi add-on file to the sign command");
    }

    let manifest = await getManifest(this.options.sourceDir);

    let id;
    try {
      id = manifest.browser_specific_settings.gecko.id;
    } catch (e) {
      try {
        id = manifest.applications.gecko.id;
      } catch (err) {
        // Ok to keep null in case it is missing
      }
    }

    if (!id) {
      throw new Error("Must specify an add-on id in the manifest at browser_specific_settings.gecko.id");
    }

    let metaDataJson = {};
    if (this.options.metaDataFile) {
      try {
        metaDataJson = JSON.parse(await fs.promises.readFile(this.options.metaDataFile, { encoding: "utf-8" }));
      } catch (e) {
        throw new Error(`Could not parse metadata file ${this.options.metaDataFile}: ${e}`, { cause: e });
      }
    }

    let defaultLocale = metaDataJson.default_locale || "en-US";

    if (this.options.approvalNotes) {
      metaDataJson.version ??= {};
      metaDataJson.version.approval_notes = this.options.approvalNotes;
    }
    if (this.options.releaseNotes) {
      metaDataJson.version ??= {};
      metaDataJson.version.release_notes = {
        [defaultLocale]: this.options.releaseNotes
      };
    }

    if (this.options.license) {
      if (KNOWN_LICENSES.has(this.options.license)) {
        if (this.options.licenseFile) {
          throw new Error(`License ${this.options.license} is a known license, you cannot pass a license file`);
        }
        metaDataJson.version.license = this.options.license;
      } else {
        if (!this.options.licenseFile) {
          throw new Error(`License ${this.options.license} is not a known license, you need to pass the licenseFile option`);
        }
        metaDataJson.version.custom_license = {
          name: {
            [defaultLocale]: this.options.license
          },
          text: {
            [defaultLocale]: await fs.promises.readFile(this.options.licenseFile, { encoding: "utf-8" })
          }
        };
      }
    }

    let tmpdir = await fs.promises.mkdtemp(path.join(process.env.RUNNER_TEMP, "action-web-ext-"));

    console.log(`Signing ${manifest.name} ${manifest.version}...`);

    if (this.options.verbose) {
      console.log("Passing the following metadata:", JSON.stringify(metaDataJson, null, 2));
    }

    let result;
    let uploadUuid;
    try {
      if (this.options.apiUrlPrefix.includes("v5")) {
        result = await signAddonV5({
          apiKey: this.options.apiKey,
          apiSecret: this.options.apiSecret,
          amoBaseUrl: this.options.apiUrlPrefix,
          validationCheckTimeout: this.options.timeout,
          approvalCheckTimeout: this.options.timeout,
          id: id,
          xpiPath: this.options.sourceDir,
          downloadDir: this.options.artifactsDir,
          channel: this.options.channel,
          savedUploadUuidPath: path.join(tmpdir, ".amo-upload-uuid"),
          metaDataJson: metaDataJson,
          submissionSource: this.options.sourceCode,
          userAgentString: "kewisch/action-web-ext",
        });

        try {
          uploadUuid = JSON.parse(await fs.promises.readFile(path.join(tmpdir, ".amo-upload-uuid"), { encoding: "utf-8" }));
        } catch (e) {
          console.warn("Could not parse amo-upload-uuid file:", e);
        }
      } else if (this.options.apiUrlPrefix.includes("v4")) {
        if (this.options.approvalNotes) {
          throw new Error("Approval notes cannot be submitted in API v4");
        }
        if (this.options.releaseNotes) {
          throw new Error("Release notes cannot be submitted in API v4");
        }
        if (this.options.metaDataFile) {
          throw new Error("Metadata cannot be submitted in API v4");
        }
        if (this.options.sourceCode) {
          throw new Error("Source code cannot be submitted in API v4");
        }
        if (this.options.license || this.options.licenseFile) {
          throw new Error("License cannot bet set in API v4");
        }

        result = await signAddonV4({
          xpiPath: this.options.sourceDir,
          id: id,
          version: manifest.version,
          apiKey: this.options.apiKey,
          apiSecret: this.options.apiSecret,
          apiUrlPrefix: this.options.apiUrlPrefix,
          verbose: this.options.verbose,
          channel: this.options.channel,
          timeout: this.options.timeout,
          downloadDir: this.options.artifactsDir,
          disableProgressBar: true,
        });
      } else {
        throw new Error("Only API v5 and v4 are supported, you provided " + this.options.apiUrlPrefix);
      }
    } catch (e) {
      if (
        e.message.includes("The XPI was processed but no signed files were found") &&
        this.options.apiUrlPrefix.includes("thunderbird")
      ) {
        core.warning("You are signing for Thunderbird, which currently doesn't have signing enabled.");
        return { addon_id: id, target: this.options.sourceDir };
      } else {
        throw e;
      }
    }

    if (result.downloadedFiles) {
      console.log("Downloaded these files: " + result.downloadedFiles);
      return {
        addon_id: result.id,
        target: path.join(this.options.artifactsDir, result.downloadedFiles[0]),
        name: result.downloadedFiles[0],
        upload: uploadUuid?.uploadUuid,
        channel: uploadUuid?.channel,
        crcHash: uploadUuid?.xpiCrcHash
      };
    } else if (result.errorCode == "ADDON_NOT_AUTO_SIGNED") {
      core.warning("The add-on passed validation, but was not auto-signed (listed, or held for manual review)");
      return {
        addon_id: result.id,
        target: null,
        name: null,
        upload: uploadUuid?.uploadUuid,
        channel: uploadUuid?.channel,
        crcHash: uploadUuid?.xpiCrcHash
      };
    } else {
      console.error(result);
      throw new Error(`The signing process has failed (${result.errorCode}): ${result.errorDetails}`);
    }
  }
}
