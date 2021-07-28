import * as core from "@actions/core";
import * as github from "@actions/github";
import { GitHub } from "@actions/github/lib/utils";
import { ActionConfig, getConfig } from "./action";

type Octokit = InstanceType<typeof GitHub>;

let config: ActionConfig;
let octokit: Octokit;

export function init(cfg?: ActionConfig): void {
  config = cfg || getConfig();
  octokit = github.getOctokit(config.token);
}

export async function dispatchWorkflow(distinctId: string): Promise<void> {
  try {
    // https://docs.github.com/en/rest/reference/actions#create-a-workflow-dispatch-event
    const response = await octokit.rest.actions.createWorkflowDispatch({
      owner: config.owner,
      repo: config.repo,
      workflow_id: config.workflow,
      ref: config.ref,
      inputs: {
        distinct_id: distinctId,
      },
    });

    if (response.status !== 204) {
      throw new Error(
        `Failed to dispatch action, expected 204 but received ${response.status}`
      );
    }

    core.info(
      "Successfully dispatched workflow:\n" +
        `  Repository: ${config.owner}/${config.repo}\n` +
        `  Branch: ${config.ref}\n` +
        `  Workflow ID: ${config.workflow}\n` +
        `  Distinct ID: ${distinctId}`
    );
  } catch (error) {
    core.error(
      `dispatchWorkflow: An unexpected error has occurred: ${error.message}`
    );
    error.stack && core.debug(error.stack);
    throw error;
  }
}

export async function getWorkflowId(workflowName: string): Promise<number> {
  try {
    // https://docs.github.com/en/rest/reference/actions#list-repository-workflows
    const response = await octokit.rest.actions.listRepoWorkflows({
      owner: config.owner,
      repo: config.repo,
    });

    if (response.status !== 200) {
      throw new Error(
        `Failed to get workflows, expected 200 but received ${response.status}`
      );
    }

    const workflowId = response.data.workflows.find(
      (workflow) => workflow.name === workflowName
    )?.id;

    if (workflowId === undefined) {
      throw new Error(`Unable to find ID for Workflow: ${workflowName}`);
    }

    return workflowId;
  } catch (error) {
    core.error(
      `getWorkflowId: An unexpected error has occurred: ${error.message}`
    );
    error.stack && core.debug(error.stack);
    throw error;
  }
}

export async function getWorkflowRunIds(workflowId: number): Promise<number[]> {
  try {
    // https://docs.github.com/en/rest/reference/actions#list-workflow-runs-for-a-repository
    const response = await octokit.rest.actions.listWorkflowRuns({
      owner: config.owner,
      repo: config.repo,
      branch: config.ref,
      workflow_id: workflowId,
      per_page: 10,
    });

    if (response.status !== 200) {
      throw new Error(
        `Failed to get Workflow runs, expected 200 but received ${response.status}`
      );
    }

    return response.data.workflow_runs.map((workflowRun) => workflowRun.id);
  } catch (error) {
    core.error(
      `getWorkflowRunIds: An unexpected error has occurred: ${error.message}`
    );
    error.stack && core.debug(error.stack);
    throw error;
  }
}

export async function getWorkflowRunLogs(runId: number): Promise<Buffer> {
  try {
    // https://docs.github.com/en/rest/reference/actions#download-workflow-run-logs
    const response = await octokit.rest.actions.downloadWorkflowRunLogs({
      owner: config.owner,
      repo: config.repo,
      run_id: runId,
    });

    /**
     * To be consistent with the other API requests we'd assert that the returned
     * status code was what the documentation had asserted in the specification.
     *
     * However, the documentation does not align with the actual status returned.
     *
     * Documentation states: 302
     * Actual response status: 200
     */

    /**
     * Octokit returns an ArrayBuffer, which is a narrowed type of Buffer.
     */
    const data = response.data as ArrayBuffer;
    return Buffer.from(data);
  } catch (error) {
    core.error(
      `getWorkflowRunLogs: An unexpected error has occurred: ${error.message}`
    );
    error.stack && core.debug(error.stack);
    throw error;
  }
}

/**
 * Attempt to get a non-empty array from the API.
 */
export async function retryOrDie<T>(
  retryFunc: () => Promise<T[]>,
  timeoutMs: number
): Promise<T[]> {
  const startTime = Date.now();
  let elapsedTime = 0;
  while (elapsedTime < timeoutMs) {
    elapsedTime = Date.now() - startTime;

    const response = await retryFunc();
    if (response.length > 0) {
      return response;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Timed out while attempting to fetch data");
}
