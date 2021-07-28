import * as core from "@actions/core";

const WORKFLOW_TIMEOUT_SECONDS = 5 * 60;

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
   * Time until giving up waiting for the start of the workflow run.
   */
  workflowTimeoutSeconds: number;
}

export enum ActionOutputs {
  runId = "runId",
}

export function getConfig(): ActionConfig {
  return {
    token: core.getInput("token", { required: true }),
    ref: core.getInput("ref", { required: true }),
    repo: core.getInput("repo", { required: true }),
    owner: core.getInput("owner", { required: true }),
    workflow: getWorkflowValue(core.getInput("workflow", { required: true })),
    workflowTimeoutSeconds:
      getNumberFromValue(core.getInput("workflow_timeout_seconds")) ||
      WORKFLOW_TIMEOUT_SECONDS,
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
  } catch (error) {
    throw new Error(`Unable to parse value: ${value}`);
  }
}

function getWorkflowValue(workflowInput: string): string | number {
  try {
    // We can assume that the string is defined and not empty at this point.
    return getNumberFromValue(workflowInput)!;
  } catch {
    // Assume using a workflow name instead of an ID.
    return workflowInput;
  }
}
