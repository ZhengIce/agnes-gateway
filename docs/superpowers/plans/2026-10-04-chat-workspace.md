# Chat Workspace Implementation Plan

> **For agentic workers:** Execute task-by-task with test-first changes and a final independent review.

**Goal:** Add a usable chat console for text, image and video generation.

**Architecture:** Reuse existing authenticated public gateway routes directly
from the admin console. Separate protocol handling, locally persisted state,
and Vue presentation. Backend generation capture remains unchanged.

**Tech Stack:** Vue 3, existing shadcn-vue components, Vite, native fetch and Node tests.

**Spec:** `docs/superpowers/specs/2026-10-04-chat-workspace-design.md`

## Global Constraints

- No new dependencies or real upstream calls during tests.
- Store links only, never media files or credentials in conversation history.
- Preserve existing limits, logging, media capture and removed footer.
- This workspace is not a Git repository; do not create a worktree or commits.

### Task 1: Gateway Client

Files: `frontend/src/lib/chat-client.js`, `frontend/tests/chat-client.test.mjs`.

- [x] Write failing tests for `generationPayload(kind, model, prompt, options)`,
  `availableModels(catalog, kind, allowed)`, and
  `createChatClient(fetcher).chat(key, payload, {signal, onDelta})`.
- [x] Verify missing implementation fails using
  `node --test tests/chat-client.test.mjs`.
- [x] Implement HTTP(S)-only references, URL image output, supported video
  options, SSE decoding and JSON fallback. SSE errors and truncated replies
  must not count as successful completions.
- [x] Add `pollVideo(key, id, model, {signal, onProgress})` using abortable waits,
  bounded polling and transient-error backoff. Task creation is never retried.
- [x] Run transport tests and inspect all failures.

### Task 2: Conversation State

Files: `frontend/src/composables/useChatWorkspace.js`,
`frontend/tests/chat-workspace.test.mjs`.

- [x] Write failing tests for completed-turn context, link-only sanitized
  persistence, interrupted restoration, pause/resume, and operation isolation.
- [x] Implement `useChatWorkspace({client, storage})`, with `sessions`, `current`,
  `busy`, `error`, `storageError`, `createSession`, `selectSession`,
  `deleteSession`, `send`, `stop`, `resumeVideo`, and `persist`.
- [x] Store credentials only in runtime key objects, not session state.
- [x] Verify cancellation cannot update another session or clear its busy flag.
- [x] Run state tests together with transport tests.

### Task 3: Console Integration

Files: `frontend/src/views/ChatWorkspace.vue`,
`frontend/src/components/ChatMessage.vue`,
`frontend/src/components/ChatParameters.vue`,
`frontend/src/components/ChatHistory.vue`, route/sidebar/App,
frontend test script and READMEs.

- [x] Add Vue SSR tests for mode controls, accessibility, escaped text,
  media previews, paused-video resume and no footer.
- [x] Build the conversation list, responsive scrolling message area,
  model/key selectors, parameter fields and bottom composer using existing UI.
- [x] Add `/chat` navigation and a viewport-height layout scoped to this route.
- [x] Expand `npm test` to run all test files; document local-only history and
  video polling semantics.
- [x] Run `npm test`, `npm run build` and backend `pytest`.
- [x] Independent review, fix confirmed findings, rerun affected checks.
- [x] Verify the built static assets are served by the existing local server.

## Verification Results

Verified 2026-10-04:

- `npm test`: 42 tests passed.
- `npm run build`: passed.
- `.venv/Scripts/python.exe -B -m pytest -q -p no:cacheprovider --tb=short`:
  39 tests passed on the final run.
- Existing server at `127.0.0.1:8787` returned HTTP 200 for the latest
  `dist/index.html` and `ChatWorkspace-ChU6WYTg.js`.
- Independent review findings covered reference-field sanitization, stale
  multi-tab history, unknown video-task cancellation, model permission races,
  and truncated JSON replies; regression tests and guards were added.
- No browser layout verification or real upstream generation was performed.
