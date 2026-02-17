# Streaming Summary Rollout Plan

## Goal
Stream summary output to the UI as it is generated, while preserving current behavior until migration is complete.

## Implementation Plan
1. Add a dedicated streaming API route at `pages/api/getSummaryStream.ts` so existing `pages/api/getSummary.ts` remains a fallback during rollout.
2. Define a stream event contract (SSE-style messages over `fetch`) with event types: `status`, `delta`, `complete`, and `error`.
3. Implement short-input token streaming in the new route by using OpenAI streaming responses and emitting `delta` events for incremental text.
4. Move long-input assistant handling into the same stream lifecycle: emit `status` updates while polling run state server-side, then emit `complete` when the final summary is ready.
5. Keep cleanup in the streaming route (uploaded file deletion and terminal status logs) and always close the stream explicitly for both success and failure paths.
6. Update the client summary request flow in `pages/index.tsx` to read `response.body` progressively, append `delta` text into `summaryText`, and remove interval polling state for the new path.
7. Add live-generation UI behavior: disable submit during active stream, show progress messages from `status`, and support user cancel via `AbortController`.
8. Add compatibility and recovery behavior: wrong password handling, interrupted stream handling, long-transcript path coverage, and fallback to `/api/getSummary` when streaming is unsupported.

## Validation Checklist
1. Short transcript streams incremental text to the page and ends with `complete`.
2. Long transcript emits progress statuses and finishes with full summary in the same request.
3. Errors emit `error` events and surface a clear UI error message.
4. Copy-to-clipboard still works with streamed markdown output after completion.
5. Manual cancel stops network activity and resets UI to a usable state.
