# Chat Workspace

Approved in chat on 2026-10-04.

## Scope

Add an authenticated `/chat` console page with text, image and video modes,
model and existing gateway-key selection, and local conversation history.
Keep the existing footer removed. Match the console's neutral colors,
system sans-serif typography, compact controls and sidebar navigation.

## Requests

Use existing same-origin `/v1` routes with the selected gateway key.
Do not expose upstream keys or bypass gateway admission, limits or accounting.
Fetch `/v1/models`, classify image/video IDs, and provide the documented Agnes
IDs as fallback when discovery is unavailable. Include permitted custom IDs.

Text uses Chat Completions SSE and completed text turns as context.
Image generation supports resolution, aspect ratio and HTTP(S) reference URLs.
Request URL output only. Video generation supports text, reference images,
and first/last-frame modes, resolution, 4-12 seconds and aspect ratio.
Poll the returned `video_id` with `model_name`, back off on transient errors,
and bound polling to 10 minutes. Never retry task creation automatically.

## State

Keep conversation history in this browser's localStorage. Serialize only
whitelisted fields, including key IDs, never credentials or media bytes.
Show errors when local persistence is unavailable rather than deleting data.
Restored incomplete text/image operations are interrupted. Restored video
tasks with IDs can be resumed explicitly without creating a second task.
Switching/deleting sessions or leaving the page aborts current client work.
Stopping video generation means pausing polling, not cancelling upstream.

## Results

Render text as escaped plain text, preserve line breaks and code formatting.
Show optional reasoning separately. Display remote images with error states
and remote videos with native controls, no autoplay. Provide copy/open-link
actions and explicit resume for paused video tasks.
Existing proxy hooks store completed media links in the existing libraries.

## Verification

Test payload validation, chunked SSE (UTF-8, CRLF, errors, incomplete streams),
gateway authentication, video polling/backoff/cancellation, completed-turn
context, persistence sanitization, and concurrent operation isolation.
Use mocked fetch responses and Vue SSR; do not call real generation APIs.
Run all frontend tests, production build and backend regressions.
