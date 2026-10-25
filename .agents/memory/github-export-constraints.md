---
name: GitHub export constraints
description: Native Git transport, connector authorization and history constraints for exporting this project to GitHub.
---

Test existing native Git access before concluding that a missing connector blocks a push. Use the authorized GitHub connector for API operations when native Git authentication is unavailable. Never extract raw connector credentials to enable a Git push. API snapshot exports do not automatically align local and remote commit ancestry.

**Why:** Native authentication previously failed while connector exports worked, creating separate histories. Later, the connector exposed no usable connection but native HTTPS Git successfully pushed through Replit's GitHub proxy. Connector visibility and native Git access are independent.

**How to apply:** A no-op native push with `--dry-run` targeting the existing remote head can check transport access without reading credentials. For exports, inspect the current remote branch and preserve existing history and remote-only work. Use a separate worktree based on remote main when histories diverge, transplant only the intended change, and push without force. Verify the resulting remote head. Do not claim local main is synchronized merely because an export branch was pushed.

Serialize machine-readable shell output to JSON before transporting it through the shell callback.

**Why:** Raw NUL and tab delimiters were stripped from Git index output during callback transport.

**How to apply:** Parse delimited Git output inside the shell process and return JSON metadata, rather than parsing raw delimiters after the callback.

Connector authorization is scoped to the active user and context. A `not_added` connection may be blocked because another account's connector is already assigned; an `added` connection may still withhold credentials from `listConnections`.

**Why:** A GitHub bind was rejected because a different connection already occupied the connector slot, while a successfully bound Vercel connection exposed no usable credentials in that execution context.

**How to apply:** Resolve integrations from the current turn's status. Do not reuse a connection ID or credentials from another user context, retry an unchanged bind collision, or treat an empty credential list as proof that all GitHub authorization is absent. Check existing native transport independently before declaring a write blocked; only request connection repair if neither authorized path works.

The Replit checkout can lag behind GitHub `main` and have a separate local history. Do not hard-reset the whole workspace to refresh one artifact.

**Why:** The live GitHub tree contained newer restaurant-site files while the Replit preview still served an older local snapshot; resetting would also discard Replit-only memory and uploaded logs.

**How to apply:** Fetch the remote head read-only, compare changed paths, then sync only the requested artifact subtree. Preserve workspace-only files and verify its build, workflow, and preview.

When the user asks to publish the current preview version, export the complete website artifact, not just the latest feature patch.

**Why:** Shipping only order confirmation successfully updated GitHub and Vercel but left the rest of the live website visibly different from the preview the user wanted to give their client.

**How to apply:** Preserve other repository subtrees and remote ancestry, but use the full current frontend subtree when that version is explicitly requested. Verify subtree hashes match and the deployed JavaScript/CSS match the preview's production build; a successful push alone does not establish visual parity.

Validate temporary worktrees before reusing them across turns.

**Why:** A hidden temporary export directory lost its worktree marker after a checkpoint; running Git inside it silently targeted the parent workspace instead.

**How to apply:** Check the reported Git top-level directory matches the intended worktree before staging or committing there. Do not assume a directory left from an earlier turn is still an isolated checkout.

The user declined publishing a Replit backend; do not use a development URL as a production media backend.

**Why:** The client demo is hosted on Vercel, while testimonial videos depend on Replit App Storage serving. A static frontend export does not publish that serving API.

**How to apply:** Keep frontend export and media hosting verification separate. Do not promise video playback on Vercel until its media requests return actual video content from durable public hosting.