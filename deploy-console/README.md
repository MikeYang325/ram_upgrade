# Control Room — local deployment console

This is a local-only release console for the parent `ram_upgrade` repository.

## Start

```bash
cd deploy-console
npm run dev
```

Open `http://127.0.0.1:4174`.

## What it does today

- Reads the local GitHub remote, branch, and checked-out commit.
- Uses the existing local Vercel CLI login; it does not store a Vercel token.
- Verifies a branch name or commit before a Vercel production release.
- Records completed releases locally in `data/deployments.json` (ignored by Git).
- Offers Vercel rollback for a recorded release.

## Private servers

Private-server publishing intentionally stays disabled until an SSH target is configured. The next setup step is a restricted deployment user and a dedicated SSH key on the chosen server; neither should be committed to this repository.
