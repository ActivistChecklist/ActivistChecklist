# GitHub Actions secrets

Anyone with write access can push a branch that adds a workflow, and that
workflow runs with every repository-level Actions secret. So no secret lives at
repository level. They all live in the `main-only` environment, whose
deployment branch policy allows only `main`. A job gets them by naming
`environment: main-only`, and GitHub refuses to start that job on any other
ref. Changing what runs on `main` still takes a reviewed PR.

## What lives where

All in the `main-only` environment:

| Name | Kind | Used by |
| --- | --- | --- |
| `DEPLOY_SECRET` | secret | `deploy-webhook.yml` |
| `HEALTHCHECKS_DEPLOY_PING_URL` | secret | `deploy-webhook.yml` |
| `CROWDIN_PERSONAL_TOKEN` | secret | `crowdin-sync-main.yml` |
| `CROWDIN_PROJECT_ID` | secret | `crowdin-sync-main.yml` |
| `AUTOFIX_APP_PRIVATE_KEY` | secret | `security-autofix.yml`, `node-bump.yml` |
| `AUTOFIX_APP_CLIENT_ID` | variable | `security-autofix.yml`, `node-bump.yml` |

Repository level: nothing. `GITHUB_TOKEN` is automatic and needs no secret.

## Rules for a job that uses the environment

- Only on triggers whose ref is `main`: `push` to main, `schedule`, or
  `workflow_dispatch` (GitHub refuses a dispatch on any other branch). Never on
  `pull_request` or `pull_request_target`.
- Run no code from outside `main` in that job. That is why
  `security-autofix.yml` has two jobs: the one that runs `pnpm update`, tests
  and the build gets no secrets, and a second job applies only the lockfile
  diff and opens the PR. It is also why `crowdin-sync-main.yml` refuses a
  `head_sha` that is not already on main.
- Pass `${{ }}` inputs through `env:`, never inline in `run:`.
- A job that names an environment which does not exist makes GitHub create it
  with no protection. Create it first (below).
- Add a secret with `gh secret set NAME --env main-only`. Never leave off
  `--env`.

## The autofix GitHub App

`security-autofix.yml` and `node-bump.yml` open PRs, and PRs opened with
`GITHUB_TOKEN` do not trigger other workflows, so `pr-checks.yml` would never
run on them. They used to use an org owner's personal access token. That token
acted as an org admin, whom the approval ruleset does not apply to, and any
write collaborator could read it. An App installation token works only on this
repo, has only the two permissions below, expires after an hour, and its PRs
need approval like anyone else's.

One-time setup, by an org owner:

1. Go to <https://github.com/organizations/ActivistChecklist/settings/apps/new>.
   - GitHub App name: `ActivistChecklist Autofix`
   - Homepage URL: `https://activistchecklist.org`
   - Webhook: untick **Active**.
   - Repository permissions: **Contents** read and write, **Pull requests**
     read and write. Leave everything else at no access (Metadata read is
     added automatically).
   - Where can this GitHub App be installed: **Only on this account**.
2. Create it. Copy the **Client ID**, then **Generate a private key** (a `.pem`
   file downloads).
3. **Install App** > ActivistChecklist > **Only select repositories** >
   ActivistChecklist.
4. Store both in the environment, then delete the `.pem`:

   ```bash
   gh variable set AUTOFIX_APP_CLIENT_ID --env main-only --repo ActivistChecklist/ActivistChecklist --body 'CLIENT_ID'
   gh secret set AUTOFIX_APP_PRIVATE_KEY --env main-only --repo ActivistChecklist/ActivistChecklist < ~/Downloads/KEY.pem
   rm ~/Downloads/KEY.pem
   ```

5. Run both workflows once from main and check they finish:

   ```bash
   gh workflow run node-bump.yml --ref main
   gh workflow run security-autofix.yml --ref main
   ```

To rotate the key, generate a new one in the App's settings, run the
`gh secret set` line again, then delete the old key there.

## Creating the environment

```bash
gh api -X PUT repos/ActivistChecklist/ActivistChecklist/environments/main-only \
  --input - <<'JSON'
{"deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
JSON
gh api -X POST repos/ActivistChecklist/ActivistChecklist/environments/main-only/deployment-branch-policies \
  -f name=main -f type=branch
```

Check it. This must print exactly `main branch`:

```bash
gh api repos/ActivistChecklist/ActivistChecklist/environments/main-only/deployment-branch-policies \
  --jq '.branch_policies[] | "\(.name) \(.type)"'
```
