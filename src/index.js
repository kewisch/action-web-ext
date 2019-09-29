/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2019 */

import path from "path";
import fs from "fs";

import * as core from "@actions/core";

import WebExtAction from "./action";

function mask(value) {
  if (value) {
    console.log("::add-mask::" + value);
  }
  return value;
}

async function main() {
  let source = core.getInput("source", { required: true });
  let artifacts = core.getInput("artifacts");
  if (!artifacts) {
    let stat = await fs.promises.lstat(source);
    let basePath = stat.isFile() ? process.cwd() : source;
    artifacts = path.join(basePath, "web-ext-artifacts");
  }

  let action = new WebExtAction({
    // Common options
    sourceDir: source,
    artifactsDir: artifacts,
    channel: core.getInput("channel"),

    // Linting options
    token: process.env.GITHUB_TOKEN,

    // Signing options
    apiKey: mask(core.getInput("apiKey")),
    apiSecret: mask(core.getInput("apiSecret")),
    apiUrlPrefix: core.getInput("apiUrlPrefix"),
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
