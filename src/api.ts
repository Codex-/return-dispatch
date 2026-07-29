import * as core from "@actions/core";
import * as github from "@actions/github";

import { type ActionConfig, getConfig } from "./action.ts";

type Octokit = ReturnType<typeof github.getOctokit>;

let config: ActionConfig;
let octokit: Octokit;

export function init(cfg?: ActionConfig): void {
  config = cfg ?? getConfig();
  octokit = github.getOctokit(config.token);
}

/**
 * The 200 response body of the workflow dispatch endpoint, returned when
 * `return_run_details` is requested.
 *
 * Declared locally because `@octokit/openapi-types` still describes this
 * endpoint as 204-only, so the response shape cannot be taken from the types
 * and is validated at runtime instead.
 *
 * See: https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event--status-codes
 */
interface WorkflowDispatchResponse {
  workflow_run_id: number;
  run_url: string;
  html_url: string;
}

/**
 * Identifies the run created by a dispatch.
 */
export interface DispatchedWorkflowRun {
  id: number;
  url: string;
}

function readDispatchedRun(data: unknown): DispatchedWorkflowRun | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }

  const { workflow_run_id: id, html_url: url } =
    data as Partial<WorkflowDispatchResponse>;
  if (typeof id !== "number" || typeof url !== "string") {
    return undefined;
  }

  return { id, url };
}

/**
 * Dispatch the workflow and return the run that it created.
 *
 * Throws if the server does not report the run details, which requires
 * github.com or GitHub Enterprise Server 3.21 or newer.
 */
export async function dispatchWorkflow(): Promise<DispatchedWorkflowRun> {
  try {
    // https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
    const response = await octokit.rest.actions.createWorkflowDispatch({
      owner: config.owner,
      repo: config.repo,
      workflow_id: config.workflow,
      ref: config.ref,
      inputs: config.workflowInputs,
      // The docs omit `return_run_details`. It is specified only in the OpenAPI
      // description, which is what conditions the 200 and 204 responses on it.
      // see: https://github.com/github/rest-api-description/tree/main/descriptions/api.github.com
      return_run_details: true,
    });

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!(response.status == 204 || response.status == 200)) {
      throw new Error(
        `Failed to dispatch action, expected 200 or 204 but received ${response.status}`,
      );
    }

    // Servers that do not support `return_run_details` ignore it and respond
    // with an empty 204.
    const dispatchedRun = readDispatchedRun(response.data);
    if (dispatchedRun === undefined) {
      throw new Error(
        "Dispatch did not return the run details, this action requires github.com or GHES >=3.21",
      );
    }

    core.info(
      "Successfully dispatched workflow:\n" +
        `  Repository: ${config.owner}/${config.repo}\n` +
        `  Branch: ${config.ref}\n` +
        `  Workflow: ${config.workflow}\n` +
        (config.workflowInputs
          ? `  Workflow Inputs: ${JSON.stringify(config.workflowInputs)}\n`
          : ``) +
        `  Run ID: ${dispatchedRun.id}\n` +
        `  Run URL: ${dispatchedRun.url}`,
    );

    return dispatchedRun;
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `dispatchWorkflow: An unexpected error has occurred: ${error.message}`,
      );
      core.debug(error.stack ?? "");
    }
    throw error;
  }
}
