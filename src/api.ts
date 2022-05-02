import * as core from "@actions/core";
import * as github from "@actions/github";
import type { GitHub } from "@actions/github/lib/utils";
import { ActionConfig, getConfig } from "./action";
import { getBranchName } from "./utils";

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
        ...(config.workflowInputs ? config.workflowInputs : undefined),
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
        (config.workflowInputs
          ? `  Workflow Inputs: ${JSON.stringify(config.workflowInputs)}\n`
          : ``) +
        `  Distinct ID: ${distinctId}`
    );
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `dispatchWorkflow: An unexpected error has occurred: ${error.message}`
      );
      error.stack && core.debug(error.stack);
    }
    throw error;
  }
}

export async function getWorkflowId(workflowFilename: string): Promise<number> {
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

    const workflowId = response.data.workflows.find((workflow) =>
      new RegExp(workflowFilename).test(workflow.path)
    )?.id;

    if (workflowId === undefined) {
      throw new Error(`Unable to find ID for Workflow: ${workflowFilename}`);
    }

    return workflowId;
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowId: An unexpected error has occurred: ${error.message}`
      );
      error.stack && core.debug(error.stack);
    }
    throw error;
  }
}

export async function getWorkflowRunUrl(runId: number): Promise<string> {
  try {
    // https://docs.github.com/en/rest/reference/actions#get-a-workflow-run
    const response = await octokit.rest.actions.getWorkflowRun({
      owner: config.owner,
      repo: config.repo,
      run_id: runId,
    });

    if (response.status !== 200) {
      throw new Error(
        `Failed to get Workflow Run state, expected 200 but received ${response.status}`
      );
    }

    core.debug(
      `Fetched Run:\n` +
        `  Repository: ${config.owner}/${config.repo}\n` +
        `  Run ID: ${runId}\n` +
        `  URL: ${response.data.html_url}`
    );

    return response.data.html_url;
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowRunUrl: An unexpected error has occurred: ${error.message}`
      );
      error.stack && core.debug(error.stack);
    }
    throw error;
  }
}

export async function getWorkflowRunIds(workflowId: number): Promise<number[]> {
  try {
    const branchName = getBranchName(config.ref);

    // https://docs.github.com/en/rest/reference/actions#list-workflow-runs
    const response = await octokit.rest.actions.listWorkflowRuns({
      owner: config.owner,
      repo: config.repo,
      workflow_id: workflowId,
      ...(branchName
        ? {
            branch: branchName,
            per_page: 5,
          }
        : {
            per_page: 10,
          }),
    });

    if (response.status !== 200) {
      throw new Error(
        `Failed to get Workflow runs, expected 200 but received ${response.status}`
      );
    }

    const runIds = response.data.workflow_runs.map(
      (workflowRun) => workflowRun.id
    );

    core.debug(
      "Fetched Workflow Runs:\n" +
        `  Repository: ${config.owner}/${config.repo}\n` +
        `  Branch: ${branchName || "undefined"}\n` +
        `  Workflow ID: ${workflowId}\n` +
        `  Runs Fetched: [${runIds}]`
    );

    return runIds;
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowRunIds: An unexpected error has occurred: ${error.message}`
      );
      error.stack && core.debug(error.stack);
    }
    throw error;
  }
}

export async function getWorkflowRunJobSteps(runId: number): Promise<string[]> {
  try {
    // https://docs.github.com/en/rest/reference/actions#list-jobs-for-a-workflow-run
    const response = await octokit.rest.actions.listJobsForWorkflowRun({
      owner: config.owner,
      repo: config.repo,
      run_id: runId,
      filter: "latest",
    });

    if (response.status !== 200) {
      throw new Error(
        `Failed to get Workflow Run Jobs, expected 200 but received ${response.status}`
      );
    }

    const jobs = response.data.jobs.map((job) => ({
      id: job.id,
      steps: job.steps?.map((step) => step.name) || [],
    }));
    const steps = Array.from(new Set(jobs.flatMap((job) => job.steps)));

    core.debug(
      "Fetched Workflow Run Job Steps:\n" +
        `  Repository: ${config.owner}/${config.repo}\n` +
        `  Workflow Run ID: ${runId}\n` +
        `  Jobs Fetched: [${jobs.map((job) => job.id)}]` +
        `  Steps Fetched: [${steps}]`
    );

    return steps;
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowRunJobs: An unexpected error has occurred: ${error.message}`
      );
      error.stack && core.debug(error.stack);
    }
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

    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("Timed out while attempting to fetch data");
}
