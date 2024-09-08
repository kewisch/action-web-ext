/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2019 */

import * as core from "@actions/core";

import WebExtAction from "./action.js";

function mask(value) {
  if (value) {
    console.log("::add-mask::" + value);
  }
  return value;
}

function getJSONInput(name, options, defaultValue) {
  let value = core.getInput(name, options);
  if (!value && defaultValue !== undefined) {
    return defaultValue;
  }

  try {
    return JSON.parse(value);
  } catch (e) {
    throw new Error(`Could not parse JSON value ${name}: ${e}`, { cause: e });
  }
}

async function main() {
  let action = new WebExtAction({
    // Common options
    sourceDir: core.getInput("source", { required: true }),
    artifactsDir: core.getInput("artifacts"),
    channel: core.getInput("channel"),
    verbose: process.env.RUNNER_DEBUG || core.getInput("verbose") == "true",
    ignoreFiles: getJSONInput("ignoreFiles", null, []),

    // Build options
    extensionFilenameTemplate: core.getInput("filename"),

    // Linting options
    token: process.env.GITHUB_TOKEN,

    // Signing options
    metaDataFile: core.getInput("metaDataFile"),
    approvalNotes: core.getInput("approvalNotes"),
    releaseNotes: core.getInput("releaseNotes"),
    license: core.getInput("license"),
    licenseFile: core.getInput("licenseFile"),
    sourceCode: core.getInput("sourceCode"),
    apiKey: mask(core.getInput("apiKey")),
    apiSecret: mask(core.getInput("apiSecret")),
    apiUrlPrefix: core.getInput("apiUrlPrefix"),
    timeout: core.getInput("timeout"),
  });


  let output = await action.run(core.getInput("cmd", { required: true }));

  for (let [key, value] of Object.entries(output || {})) {
    core.setOutput(key, value);
  }
}

main().catch((err) => {
  core.setFailed(err);
  console.log(err);
});
