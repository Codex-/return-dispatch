import * as core from "@actions/core";
import * as github from "@actions/github";

import { type ActionConfig, getConfig } from "./action.ts";
import { withEtag } from "./etags.js";
import type { Result } from "./types.ts";
import { sleep, type BranchNameResult } from "./utils.ts";

type Octokit = ReturnType<typeof github.getOctokit>;

let config: ActionConfig;
let octokit: Octokit;

export function init(cfg?: ActionConfig): void {
  config = cfg ?? getConfig();
  octokit = github.getOctokit(config.token);
}

export async function dispatchWorkflow(distinctId: string): Promise<void> {
  try {
    // https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
    const response = await octokit.rest.actions.createWorkflowDispatch({
      owner: config.owner,
      repo: config.repo,
      workflow_id: config.workflow,
      ref: config.ref,
      inputs: {
        ...(config.workflowInputs ?? undefined),
        distinct_id: distinctId,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!(response.status == 204 || response.status == 200)) {
      throw new Error(
        `Failed to dispatch action, expected 200 or 204 but received ${response.status}`,
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

export async function fetchWorkflowId(
  workflowFilename: string,
): Promise<number> {
  try {
    const sanitisedFilename = workflowFilename
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .trim();
    const filenameRegex = new RegExp(`/${sanitisedFilename}`);

    // https://docs.github.com/en/rest/actions/workflows#list-repository-workflows
    const workflowIterator = octokit.paginate.iterator(
      octokit.rest.actions.listRepoWorkflows,
      {
        owner: config.owner,
        repo: config.repo,
      },
    );
    let workflowId: number | undefined;
    let workflowIdUrl: string | undefined;
    for await (const response of workflowIterator) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (response.status !== 200) {
        throw new Error(
          `Failed to fetch workflows, expected 200 but received ${response.status}`,
        );
      }

      const workflowData = response.data.find((workflow) =>
        filenameRegex.test(workflow.path),
      );
      workflowId = workflowData?.id;

      if (workflowId !== undefined) {
        workflowIdUrl = workflowData?.html_url;
        break;
      }
    }

    if (workflowId === undefined) {
      throw new Error(`Unable to find ID for Workflow: ${workflowFilename}`);
    }

    core.info(
      `Fetched Workflow ID:\n` +
        `  Repository: ${config.owner}/${config.repo}\n` +
        `  Workflow ID: '${workflowId}'\n` +
        `  Input Filename: '${workflowFilename}'\n` +
        `  Sanitised Filename: '${sanitisedFilename}'\n` +
        `  URL: ${workflowIdUrl}`,
    );

    return workflowId;
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `fetchWorkflowId: An unexpected error has occurred: ${error.message}`,
      );
      core.debug(error.stack ?? "");
    }
    throw error;
  }
}

export async function fetchWorkflowRunUrl(runId: number): Promise<string> {
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
        `Failed to fetch Workflow Run state, expected 200 but received ${response.status}`,
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
        `fetchWorkflowRunUrl: An unexpected error has occurred: ${error.message}`,
      );
      core.debug(error.stack ?? "");
    }
    throw error;
  }
}

export async function fetchWorkflowRunIds(
  workflowId: number,
  branch: BranchNameResult,
  startTimeISO: string,
): Promise<number[]> {
  try {
    const useBranchFilter =
      !branch.isTag &&
      branch.branchName !== undefined &&
      branch.branchName !== "";

    const createdFrom = `>=${startTimeISO}`;

    const response = await withEtag(
      "listWorkflowRuns",
      {
        owner: config.owner,
        repo: config.repo,
        workflow_id: workflowId,
        created: createdFrom,
        event: "workflow_dispatch",
        ...(useBranchFilter
          ? {
              branch: branch.branchName,
              per_page: 10,
            }
          : {
              per_page: 20,
            }),
      },
      async (params) => {
        // https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository
        return await octokit.rest.actions.listWorkflowRuns(params);
      },
    );

    if (response.status !== 200) {
      throw new Error(
        `Failed to fetch Workflow runs, expected 200 but received ${response.status}`,
      );
    }

    const runIds = response.data.workflow_runs.map(
      (workflowRun) => workflowRun.id,
    );

    const branchMsg = useBranchFilter
      ? `true (${branch.branchName})`
      : `false (${branch.ref})`;
    core.debug(
      "Fetched Workflow Runs:\n" +
        `  Repository: ${config.owner}/${config.repo}\n` +
        `  Branch Filter: ${branchMsg}\n` +
        `  Workflow ID: ${workflowId}\n` +
        `  Created: ${createdFrom}\n` +
        `  Runs Fetched: [${runIds.join(", ")}]`,
    );

    return runIds;
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `fetchWorkflowRunIds: An unexpected error has occurred: ${error.message}`,
      );
      core.debug(error.stack ?? "");
    }
    throw error;
  }
}

export async function fetchWorkflowRunJobSteps(
  runId: number,
): Promise<string[]> {
  try {
    const response = await withEtag(
      "listJobsForWorkflowRun",
      {
        owner: config.owner,
        repo: config.repo,
        run_id: runId,
        filter: "latest" as const,
      },
      async (params) => {
        // https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run
        return await octokit.rest.actions.listJobsForWorkflowRun(params);
      },
    );

    if (response.status !== 200) {
      throw new Error(
        `Failed to fetch Workflow Run Jobs, expected 200 but received ${response.status}`,
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
        `  Steps Fetched: [${steps.map((step) => `"${step}"`).join(", ")}]`,
    );

    return steps;
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `fetchWorkflowRunJobSteps: An unexpected error has occurred: ${error.message}`,
      );
      core.debug(error.stack ?? "");
    }
    throw error;
  }
}

/**
 * Attempt to get a non-empty array from the API.
 */
export async function retryOrTimeout<T>(
  retryFunc: () => Promise<T[]>,
  timeoutMs: number,
): Promise<Result<T[]>> {
  const startTime = Date.now();
  let elapsedTime = 0;
  while (elapsedTime < timeoutMs) {
    const response = await retryFunc();
    if (response.length > 0) {
      return { success: true, value: response };
    }

    await sleep(1000);
    elapsedTime = Date.now() - startTime;
  }

  return { success: false, reason: "timeout" };
}
