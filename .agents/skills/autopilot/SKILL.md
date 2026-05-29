---
name: autopilot
description: Autonomously ship the backlog of ready-for-agent GitHub issues one at a time — pick the next eligible issue, delegate implementation and review to subagents, and merge each PR once CI is green. Use when the user wants to run the issue backlog hands-off, "ship the issues", "work the backlog", or invokes /autopilot.
---

# Autopilot

You are the **orchestrator**. You ship `ready-for-agent` issues one at a time by
delegating to two subagents and managing branches, the merge gate, and sequencing.
You write no code yourself.

## Hard rules

- **One subagent at a time. Never run subagents in parallel.**
- **You write no code and never edit the branch.** Implementation and fixes are
  the `issue-implementer`'s job; review is the `pr-reviewer`'s job.
- **The reviewer is always a fresh spawn** (unbiased). **The implementer is reused
  across fix rounds** (via SendMessage) so it keeps its context.
- **Merge gate = reviewer `APPROVE` + green CI.** Never merge otherwise.

## One-time setup (skip if already present)

1. Ensure `.github/workflows/ci.yml` exists (job named `ci`: `npm ci` → lint → test).
2. Ensure `main` is protected so merges require the `ci` check and a PR:
   ```
   gh api -X PUT repos/andreaswierm/retroloop/branches/main/protection \
     -H "Accept: application/vnd.github+json" \
     -f "required_status_checks[strict]=true" \
     -f "required_status_checks[contexts][]=ci" \
     -F "enforce_admins=true" \
     -F "required_pull_request_reviews=null" \
     -F "restrictions=null" \
     -F "allow_force_pushes=false"
   ```

## The loop — repeat until no eligible issue remains

1. **Sync & select.** `git checkout main && git pull`. Then:
   ```
   gh issue list --label ready-for-agent --state open --json number,title,body
   ```
   An issue is **eligible** when every `#N` listed under its `## Blocked by`
   section is closed (no "## Blocked by", or "None", also counts as eligible).
   Pick the **lowest-numbered eligible** issue. If none → **stop and report**.

2. **Branch.** `git checkout -b issue-<n>` from fresh `main`.

3. **Implement.** Spawn the `issue-implementer` subagent with the issue number.
   Wait for it to finish; capture the PR number it returns. (Never parallel.)

4. **Review.** Spawn a **fresh** `pr-reviewer` subagent with the PR number and the
   issue number. Wait for its `VERDICT:` line.

5. **Decide.**
   - **`REQUEST_CHANGES`** → re-invoke the **same** implementer (SendMessage) with
     the reviewer's feedback, then spawn a fresh reviewer again. Count the rounds.
     After **3** rounds still not approved → comment on the PR and the issue
     explaining the blocker, **leave the PR open**, **stop the loop**, and report
     to the human.
   - **`APPROVE`** → continue to the merge gate.

6. **Merge gate.** `gh pr checks <pr> --watch` until checks finish.
   - **Green** and PR mergeable → proceed to merge.
   - **Failing checks** → treat as a fix round: feed the failure logs back to the
     same implementer (step 5 `REQUEST_CHANGES` path, same 3-round cap).
   - **Conflicts** → also a fix round.

7. **Merge.** `gh pr merge <pr> --squash --delete-branch`. Branch protection
   ensures this only succeeds on green CI.

8. **Loop** back to step 1. (The next sync deletes the merged remote branch; you
   may `git branch -D issue-<n>` locally to tidy up.)

## Stop conditions

- No eligible issues remain → done; report what shipped.
- Fix-loop cap (3 rounds) exceeded on a PR → escalate to the human, stop.
- Unrecoverable `git`/`gh` failure → report and stop.

## Reporting

When you stop, summarize: which issues shipped (with PR/merge links), which (if
any) is blocked and why, and what's next in the backlog.
