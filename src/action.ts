import { randomUUID } from "node:crypto";

import * as core from "@actions/core";

const WORKFLOW_TIMEOUT_SECONDS = 5 * 60;
const WORKFLOW_JOB_STEPS_RETRY_SECONDS = 5;

/**
 * action.yaml definition.
 */
export interface ActionConfig {
  /**
   * GitHub API token for making requests.
   */
  token: string;

  /**
   * The git reference for the workflow. The reference can be a branch or tag name.
   */
  ref: string;

  /**
   * Repository of the action to await.
   */
  repo: string;

  /**
   * Owner of the given repository.
   */
  owner: string;

  /**
   * Workflow to return an ID for. Can be the ID or the workflow filename.
   */
  workflow: string | number;

  /**
   * A flat JSON object, only supports strings (as per workflow inputs API).
   */
  workflowInputs?: ActionWorkflowInputs;

  /**
   * Time until giving up on identifying the Run ID.
   */
  workflowTimeoutSeconds: number;

  /**
   * Time in retries for identifying the Run ID.
   */
  workflowJobStepsRetrySeconds: number;

  /**
   * Specify a static ID to use instead of a distinct ID.
   */
  distinctId: string;
}

type ActionWorkflowInputs = Record<string, string | number | boolean>;

export enum ActionOutputs {
  runId = "run_id",
  runUrl = "run_url",
}

export function getConfig(): ActionConfig {
  return {
    token: core.getInput("token", { required: true }),
    ref: core.getInput("ref", { required: true }),
    repo: core.getInput("repo", { required: true }),
    owner: core.getInput("owner", { required: true }),
    workflow: tryGetWorkflowAsNumber(
      core.getInput("workflow", { required: true }),
    ),
    workflowInputs: getWorkflowInputs(core.getInput("workflow_inputs")),
    workflowTimeoutSeconds:
      getNumberFromValue(core.getInput("workflow_timeout_seconds")) ??
      WORKFLOW_TIMEOUT_SECONDS,
    workflowJobStepsRetrySeconds:
      getNumberFromValue(core.getInput("workflow_job_steps_retry_seconds")) ??
      WORKFLOW_JOB_STEPS_RETRY_SECONDS,
    distinctId:
      getOptionalWorkflowValue(core.getInput("distinct_id")) ?? randomUUID(),
  };
}

function getNumberFromValue(value: string): number | undefined {
  if (value === "") {
    return undefined;
  }

  try {
    const num = parseInt(value);

    if (isNaN(num)) {
      throw new Error("Parsed value is NaN");
    }

    return num;
  } catch {
    throw new Error(`Unable to parse value: ${value}`);
  }
}

function getWorkflowInputs(
  workflowInputs: string,
): ActionWorkflowInputs | undefined {
  if (workflowInputs === "") {
    return undefined;
  }

  try {
    const parsedJson = JSON.parse(workflowInputs) as Record<string, unknown>;
    for (const key of Object.keys(parsedJson)) {
      const value = parsedJson[key];
      const type =
        value === null ? "null" : Array.isArray(value) ? "Array" : typeof value;

      if (!["string", "number", "boolean"].includes(type)) {
        throw new Error(
          `Expected value to be string, number, or boolean. "${key}" value is ${type}`,
        );
      }
    }
    return parsedJson as ActionWorkflowInputs;
  } catch (error) {
    core.error("Failed to parse workflow_inputs JSON");
    if (error instanceof Error) {
      core.debug(error.stack ?? "");
    }
    throw error;
  }
}

function tryGetWorkflowAsNumber(workflowInput: string): string | number {
  try {
    // We can assume that the string is defined and not empty at this point.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return getNumberFromValue(workflowInput)!;
  } catch {
    // Assume using a workflow name instead of an ID.
    return workflowInput;
  }
}

/**
 * We want empty strings to simply be undefined.
 *
 * While simple, make it very clear that the usage of `||`
 * is intentional here.
 */
function getOptionalWorkflowValue(workflowInput: string): string | undefined {
  return workflowInput || undefined;
}
