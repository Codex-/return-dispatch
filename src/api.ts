import * as core from "@actions/core";
import * as github from "@actions/github";
import { type ActionConfig, getConfig } from "./action.ts";
import { getBranchName } from "./utils.ts";

type Octokit = ReturnType<(typeof github)["getOctokit"]>;

let config: ActionConfig;
let octokit: Octokit;

export function init(cfg?: ActionConfig): void {
  config = cfg ?? getConfig();
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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (response.status !== 204) {
      throw new Error(
        `Failed to dispatch action, expected 204 but received ${response.status}`,
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
        `  Distinct ID: ${distinctId}`,
    );
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

export async function getWorkflowId(workflowFilename: string): Promise<number> {
  try {
    const sanitisedFilename = workflowFilename.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );

    // https://docs.github.com/en/rest/reference/actions#list-repository-workflows
    const workflowIterator = octokit.paginate.iterator(
      octokit.rest.actions.listRepoWorkflows,
      {
        owner: config.owner,
        repo: config.repo,
      },
    );
    let workflowId: number | undefined;

    for await (const response of workflowIterator) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (response.status !== 200) {
        throw new Error(
          `Failed to get workflows, expected 200 but received ${response.status}`,
        );
      }
      // wrong type definition
      const workflows: typeof response.data.workflows = response.data;

      workflowId = workflows.find((workflow) =>
        new RegExp(sanitisedFilename).test(workflow.path),
      )?.id;

      if (workflowId !== undefined) {
        break;
      }
    }

    if (workflowId === undefined) {
      throw new Error(`Unable to find ID for Workflow: ${workflowFilename}`);
    }

    return workflowId;
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowId: An unexpected error has occurred: ${error.message}`,
      );
      core.debug(error.stack ?? "");
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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (response.status !== 200) {
      throw new Error(
        `Failed to get Workflow Run state, expected 200 but received ${response.status}`,
      );
    }

    core.debug(
      `Fetched Run:\n` +
        `  Repository: ${config.owner}/${config.repo}\n` +
        `  Run ID: ${runId}\n` +
        `  URL: ${response.data.html_url}`,
    );

    return response.data.html_url;
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowRunUrl: An unexpected error has occurred: ${error.message}`,
      );
      core.debug(error.stack ?? "");
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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (response.status !== 200) {
      throw new Error(
        `Failed to get Workflow runs, expected 200 but received ${response.status}`,
      );
    }

    const runIds = response.data.workflow_runs.map(
      (workflowRun) => workflowRun.id,
    );

    core.debug(
      "Fetched Workflow Runs:\n" +
        `  Repository: ${config.owner}/${config.repo}\n` +
        `  Branch: ${branchName}\n` +
        `  Workflow ID: ${workflowId}\n` +
        `  Runs Fetched: [${runIds.join(", ")}]`,
    );

    return runIds;
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowRunIds: An unexpected error has occurred: ${error.message}`,
      );
      core.debug(error.stack ?? "");
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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (response.status !== 200) {
      throw new Error(
        `Failed to get Workflow Run Jobs, expected 200 but received ${response.status}`,
      );
    }

    const jobs = response.data.jobs.map((job) => ({
      id: job.id,
      steps: job.steps?.map((step) => step.name) ?? [],
    }));
    const steps = Array.from(new Set(jobs.flatMap((job) => job.steps)));

    core.debug(
      "Fetched Workflow Run Job Steps:\n" +
        `  Repository: ${config.owner}/${config.repo}\n` +
        `  Workflow Run ID: ${runId}\n` +
        `  Jobs Fetched: [${jobs.map((job) => job.id).join(", ")}]\n` +
        `  Steps Fetched: [${steps.join(", ")}]`,
    );

    return steps;
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowRunJobSteps: An unexpected error has occurred: ${error.message}`,
      );
      core.debug(error.stack ?? "");
    }
    throw error;
  }
}

type RetryOrTimeoutResult<T> = ResultFound<T> | ResultTimeout;

interface ResultFound<T> {
  timeout: false;
  value: T;
}

interface ResultTimeout {
  timeout: true;
}

/**
 * Attempt to get a non-empty array from the API.
 */
export async function retryOrTimeout<T>(
  retryFunc: () => Promise<T[]>,
  timeoutMs: number,
): Promise<RetryOrTimeoutResult<T[]>> {
  const startTime = Date.now();
  let elapsedTime = 0;
  while (elapsedTime < timeoutMs) {
    elapsedTime = Date.now() - startTime;

    const response = await retryFunc();
    if (response.length > 0) {
      return { timeout: false, value: response };
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  }

  return { timeout: true };
}
