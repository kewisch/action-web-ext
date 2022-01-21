/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2019 */

import * as github from "@actions/github";

export default class CheckRun {
  constructor(name, context, token) {
    this.id = null;
    this.name = name;
    this.context = context;
    this.octokit = github.getOctokit(token || "dummy");

    this.ready = !!token;
  }

  async create() {
    if (!this.ready) {
      return;
    }

    let res = await this.octokit.rest.checks.create({
      ...this.context.repo,
      head_sha: this.context.sha,
      name: "Test: " + this.name,
      status: "in_progress",
      started_at: new Date().toISOString()
    });

    this.id = res.data.id;
  }

  async complete(summary, nonfatal, fatal) {
    if (!this.ready) {
      return;
    }

    await this.octokit.rest.checks.update({
      ...this.context.repo,
      head_sha: this.context.sha,
      check_run_id: this.id,
      status: "completed",
      completed_at: new Date().toISOString(),
      conclusion: fatal.length ? "failure" : "success",
      output: {
        title: this.name,
        summary: summary,
        annotations: nonfatal.concat(fatal)
      }
    });
  }
}
