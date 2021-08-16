# GitHub Action: return-dispatch

[![GitHub Workflow Status](https://img.shields.io/github/workflow/status/codex-/return-dispatch/build-test?style=flat-square)](https://github.com/Codex-/return-dispatch/actions/workflows/test.yml) [![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier) [![GitHub Marketplace](https://img.shields.io/badge/Marketplace-return–dispatch-blue.svg?colorA=24292e&colorB=0366d6&style=flat-square&longCache=true&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAM6wAADOsB5dZE0gAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAERSURBVCiRhZG/SsMxFEZPfsVJ61jbxaF0cRQRcRJ9hlYn30IHN/+9iquDCOIsblIrOjqKgy5aKoJQj4O3EEtbPwhJbr6Te28CmdSKeqzeqr0YbfVIrTBKakvtOl5dtTkK+v4HfA9PEyBFCY9AGVgCBLaBp1jPAyfAJ/AAdIEG0dNAiyP7+K1qIfMdonZic6+WJoBJvQlvuwDqcXadUuqPA1NKAlexbRTAIMvMOCjTbMwl1LtI/6KWJ5Q6rT6Ht1MA58AX8Apcqqt5r2qhrgAXQC3CZ6i1+KMd9TRu3MvA3aH/fFPnBodb6oe6HM8+lYHrGdRXW8M9bMZtPXUji69lmf5Cmamq7quNLFZXD9Rq7v0Bpc1o/tp0fisAAAAASUVORK5CYII=)](https://github.com/marketplace/actions/return-dispatch)

Dispatch an action to a foreign repository and output the newly created run ID.

This Action exists as a workaround for the issue where dispatching an action to foreign repository does not return any kind of identifier.

## Usage

Ensure you have configured your remote action correctly, see below for an example.

### Dispatching Repository Action

```yaml
steps:
  - name: Dispatch an action and get the run ID
    uses: codex-/return-dispatch@v1
    id: return-dispatch
    with:
      token: ${{ secrets.TOKEN }} # Note this is NOT GITHUB_TOKEN but a PAT
      ref: target_branch # or refs/heads/target_branch
      repo: repository-name
      owner: repository-owner
      workflow: automation-test.yml
      workflow_inputs: { "some_input": "value" } # Optional
      workflow_timeout_seconds: 120 # Default: 300

  - name: Use the output run ID
    run: echo ${{steps.return-dispatch.outputs.run_id}}
```

### Receiving Repository Action

In the earliest possible stage for the Action, add the input into the name.

As every step needs a `uses` or `run`, simply `echo` the ID or similar to satisfy this requirement.

```yaml
name: action-test
on:
  workflow_dispatch:
    inputs:
      distinct_id:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: echo distinct ID ${{ github.event.inputs.distinct_id }}
        run: echo ${{ github.event.inputs.distinct_id }}
```

## Token

To be able to use dispatch we need to use a token which has `repo` permissions. `GITHUB_TOKEN` currently does not allow adding permissions for `repo` level permissions currently so a Personal Access Token (PAT) must be used.

### Permissions Required

The permissions required for this action to function correctly are:

- `repo` scope
  - You may get away with simply having `repo:public_repo`
  - `repo` is definitely needed if the repository is private.
- `actions:read`
- `actions:write`

### APIs Used

For the sake of transparency please note that this action uses the following API calls:

- [Create a workflow dispatch event](https://docs.github.com/en/rest/reference/actions#create-a-workflow-dispatch-event)
  - POST `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`
  - Permissions:
    - `repo`
    - `actions:write`
- [List repository workflows](https://docs.github.com/en/rest/reference/actions#list-repository-workflows)
  - GET `/repos/{owner}/{repo}/actions/workflows`
  - Permissions:
    - `repo`
    - `actions:read`
- [List workflow runs](https://docs.github.com/en/rest/reference/actions#list-workflow-runs)
  - GET `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs`
  - Permissions:
    - `repo`
- [List jobs for a workflow run](https://docs.github.com/en/rest/reference/actions#list-jobs-for-a-workflow-run)
  - GET `/repos/{owner}/{repo}/actions/runs/{run_id}/jobs`
  - Permissions:
    - `repo`
    - `actions:read`

For more information please see [api.ts](./src/api.ts).

## Where does this help?

If you have an action in a repository that dispatches an action on a foreign repository currently with Github API there is no way to know what the foreign run you've just dispatched is. Identifying this can be cumbersome and tricky.

The consequence of not being provided with something to identify the run is that you cannot easily wait for this run or poll the run for it's completion status (success, failure, etc).

## Flow

```ascii
┌─────────────────┐
│                 │
│ Dispatch Action │
│                 │
│ with unique ID  │
│                 │
└───────┬─────────┘
        │
        │
        ▼                          ┌───────────────┐
┌────────────────┐                 │               │
│                │                 │ Request steps │
│ Request top 10 ├────────────────►│               │
│                │                 │ for each run  │
│ workflow runs  │                 │               │
│                │◄────────────────┤ and search    │
└───────┬────────┘     Retry       │               │
        │                          └───────┬───────┘
        │                                  │
Timeout │                                  │
        │                                  │
        ▼                                  ▼
     ┌──────┐                      ┌───────────────┐
     │ Fail │                      │ Output run ID │
     └──────┘                      └───────────────┘
```
