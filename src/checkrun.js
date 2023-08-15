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
    if (token) {
      this.octokit = github.getOctokit(token);
    }
    
    this.ready = !!token;
  }

  async create() {
    if (!this.ready) {
      return;
    }

    let data = {
      ...this.context.repo,
      head_sha: this.context.sha,
      name: "Test: " + this.name,
      status: "in_progress",
      started_at: new Date().toISOString(),
    };

    try {
      let res = await this.octokit.rest.checks.create(data);
      this.id = res.data.id;
    } catch (e) {
      // No permissions, likely running in a pull request
      this.ready = false;
    }
  }

  async complete(errorCount, warningCount, annotations) {
    if (!this.ready) {
      return;
    }

    let conclusion = "success";
    if (errorCount > 0) {
      conclusion = "failure";
    } else if (warningCount > 0) {
      conclusion = "neutral";
    }

    let data = {
      ...this.context.repo,
      head_sha: this.context.sha,
      check_run_id: this.id,
      status: "completed",
      completed_at: new Date().toISOString(),
      conclusion: conclusion,
      output: {
        title: this.name,
        summary: `${errorCount} errors, ${warningCount} warnings`,
        annotations: annotations,
      },
    };

    try {
      await this.octokit.rest.checks.update(data);
    } catch (e) {
      console.log(JSON.stringify(data, null, 2));
      throw e;
    }
  }
}
