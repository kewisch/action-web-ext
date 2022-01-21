/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2019 */

import path from "path";
import fs from "fs";

import webExt from "web-ext";
import signAddonPkg from "sign-addon";
import yauzl from "yauzl-promise";
import getStream from "get-stream";

import * as github from "@actions/github";
import * as core from "@actions/core";

import CheckRun from "./checkrun.js";

const { signAddon } = signAddonPkg;

async function getManifest(xpi) {
  let stat = await fs.promises.lstat(xpi);
  if (stat.isFile()) {
    let zipFile = await yauzl.open(xpi);
    let manifest;

    for await (let entry of zipFile) {
      if (entry.fileName == "manifest.json") {
        let readStream = await entry.openReadStream();
        manifest = JSON.parse(await getStream(readStream));
        break;
      }
    }

    await zipFile.close();
    return manifest;
  } else if (stat.isDirectory()) {
    let contents = await fs.promises.readFile(path.join(xpi, "manifest.json"), { encoding: "utf-8" });
    return JSON.parse(contents);
  } else {
    console.error(stat);
    let full = path.resolve(process.cwd(), xpi);
    throw new Error("Don't know how to handle " + full);
  }
}

export default class WebExtAction {
  constructor(options) {
    this.options = options;
  }

  async run(cmd, ...args) {
    let runner = this["cmd_" + cmd];
    if (typeof runner != "function") {
      throw new Error(`The command ${cmd} does not exist`);
    }
    return runner.apply(this, args);
  }


  async cmd_lint() {
    function linterToAnnotation(message) {
      let level = message._type == "error" ? "failure" : message._type;
      return {
        path: message.file || "none",
        start_line: message.line || 1,
        end_line: message.line || 1,
        start_column: message.column,
        end_column: message.column,
        annotation_level: level,
        message: message.description,
        title: message.message
      };
    }
    function linterToString(message) {
      let prefix = message._type[0].toUpperCase() + message._type.substr(1);
      return `${prefix}: ${message.file}${":" + (message.line || "")} - ${message.message}`;
    }

    let check = new CheckRun("web-ext lint", github.context, this.options.token);
    await check.create();

    let results = await webExt.cmd.lint({
      sourceDir: this.options.sourceDir,
      artifactsDir: this.options.artifactsDir,
      selfHosted: this.options.channel == "unlisted",
      output: this.options.verbose ? "text" : "none",
      ignoreFiles: [".git", ".github", "web-ext-artifacts"],
    }, {
      shouldExitProgram: false
    });

    let nonfatal = results.notices.concat(results.warnings).map(linterToAnnotation);
    let fatal = results.errors.map(linterToAnnotation);
    let summary = results.summary;
    let summaryLine = `${summary.errors} Errors, ${summary.warnings} Warnings, ${summary.notices} Notices`;

    await check.complete(summaryLine, nonfatal, fatal);

    if (!this.options.token) {
      console.log(results.notices.concat(results.warnings).concat(results.errors).map(linterToString).join("\n") + "\n");
    }
    console.log(summaryLine);

    if (fatal.length) {
      throw new Error(summaryLine);
    }
  }

  async cmd_build() {
    let results = await webExt.cmd.build({
      sourceDir: this.options.sourceDir,
      artifactsDir: this.options.artifactsDir,
      overwriteDest: true,
      ignoreFiles: [".git", ".github", "web-ext-artifacts"],
    }, {
      showReadyMessage: false,
      shouldExitProgram: false
    });

    return {
      target: results.extensionPath
    };
  }

  async cmd_sign() {
    // Doing signing directly so we can pass in a source xpi as well
    let manifest = await getManifest(this.options.sourceDir);
    let id;
    try {
      id = manifest.browser_specific_settings.gecko.id;
    } catch (e) {
      try {
        id = manifest.applications.gecko.id;
      } catch (err) {
        throw new Error("Must specify an add-on id in the manifest at browser_specific_settings.gecko.id");
      }
    }

    console.log(`Signing ${manifest.name} ${manifest.version}...`);

    let result;
    try {
      result = await signAddon({
        xpiPath: this.options.sourceDir,
        channel: this.options.channel,
        id: id,
        version: manifest.version,
        downloadDir: this.options.artifactsDir,
        apiKey: this.options.apiKey,
        apiSecret: this.options.apiSecret,
        apiUrlPrefix: this.options.apiUrlPrefix,
        timeout: this.options.timeout,
        verbose: this.options.verbose
      });
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

    if (result.success) {
      console.log("Downloaded these files: " + result.downloadedFiles);
      return {
        addon_id: result.id,
        target: result.downloadedFiles[0]
      };
    } else if (result.errorCode == "ADDON_NOT_AUTO_SIGNED") {
      console.log("The add-on passed validation, but was not auto-signed (listed, or held for manual review)");
      return {
        addon_id: result.id,
        target: null
      };
    } else {
      throw new Error(`The signing process has failed (${result.errorCode}): ${result.errorDetails}`);
    }
  }
}
