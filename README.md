# GitHub Action: return-dispatch

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/codex-/return-dispatch/test.yml?style=flat-square)](https://github.com/Codex-/return-dispatch/actions/workflows/test.yml) [![codecov](https://img.shields.io/codecov/c/github/Codex-/return-dispatch?style=flat-square)](https://codecov.io/gh/Codex-/return-dispatch) [![GitHub Marketplace](https://img.shields.io/badge/Marketplace-return–dispatch-blue.svg?colorA=24292e&colorB=0366d6&style=flat-square&longCache=true&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAM6wAADOsB5dZE0gAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAERSURBVCiRhZG/SsMxFEZPfsVJ61jbxaF0cRQRcRJ9hlYn30IHN/+9iquDCOIsblIrOjqKgy5aKoJQj4O3EEtbPwhJbr6Te28CmdSKeqzeqr0YbfVIrTBKakvtOl5dtTkK+v4HfA9PEyBFCY9AGVgCBLaBp1jPAyfAJ/AAdIEG0dNAiyP7+K1qIfMdonZic6+WJoBJvQlvuwDqcXadUuqPA1NKAlexbRTAIMvMOCjTbMwl1LtI/6KWJ5Q6rT6Ht1MA58AX8Apcqqt5r2qhrgAXQC3CZ6i1+KMd9TRu3MvA3aH/fFPnBodb6oe6HM8+lYHrGdRXW8M9bMZtPXUji69lmf5Cmamq7quNLFZXD9Rq7v0Bpc1o/tp0fisAAAAASUVORK5CYII=)](https://github.com/marketplace/actions/return-dispatch)

Dispatch an action to a foreign repository and output the newly created run ID.

The returned run ID can be used to await the completion of the remote run using [`await-remote-run`](https://github.com/Codex-/await-remote-run).

## Usage

The dispatched workflow needs no special setup. It only has to accept the `workflow_dispatch`
event and declare any inputs you pass via `workflow_inputs`.

```yaml
steps:
  - name: Dispatch an action and get the run ID and URL
    uses: codex-/return-dispatch@v4
    id: return_dispatch
    with:
      token: ${{ secrets.TOKEN }} # Note this is NOT GITHUB_TOKEN but a PAT
      ref: target_branch # or refs/heads/target_branch
      repo: repository-name
      owner: repository-owner
      workflow: automation-test.yml
      workflow_inputs: '{ "some_input": "value" }' # Optional

  - name: Use the output run ID and URL
    run: |
      echo ${{steps.return_dispatch.outputs.run_id}}
      echo ${{steps.return_dispatch.outputs.run_url}}

  - name: Await Run ID ${{ steps.return_dispatch.outputs.run_id }}
    uses: Codex-/await-remote-run@v2
    with:
      token: ${{ github.token }}
      repo: repository-name
      owner: repository-owner
      run_id: ${{ steps.return_dispatch.outputs.run_id }}
```

## Token

`GITHUB_TOKEN` can only access the repository containing the workflow, so dispatching
to another repository requires a Personal Access Token (PAT). Dispatching within the
same repository works with `GITHUB_TOKEN`, provided it is granted `actions: write`.

### Permissions Required

One of the following, depending on the token type:

- Fine-grained PAT, GitHub App, or `GITHUB_TOKEN`: `Actions` repository permission, **write**
- Classic PAT or OAuth token: `repo` scope

### APIs Used

- [Create a workflow dispatch event](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)
  - POST `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`
  - Sent with `X-GitHub-Api-Version: 2026-03-10`, so the response carries the new run's ID and URL
  - Requires github.com or GitHub Enterprise Server 3.21+, older servers cannot return the run details

For more information please see [api.ts](./src/api.ts).

## Where does this help?

If you have an action in a repository that dispatches an action on a foreign repository,
you need to know which foreign run you've just dispatched before you can wait for it or
poll it for a completion status (success, failure, etc).

This Action gets you that run ID and URL as step outputs, so you can hand them straight
to something like [`await-remote-run`](https://github.com/Codex-/await-remote-run).
