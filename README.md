# AI Summarizer (YouTube)

This project provides a simple web interface for turning long YouTube videos into concise, structured summaries.  
It’s built with **Next.js**, **Material UI**, and the **OpenAI API**, with Docker support for deployment.

---

## Features

- **YouTube transcript extraction**  
  Paste a YouTube URL (or video ID) and the app fetches and cleans the transcript automatically using `youtube-transcript-plus`.

- **Customizable summary prompts**  
  Adjust the instructions sent to the model (e.g., bullet points, key themes, narrative summary).

- **Token-aware fallback**  
  If a transcript is too long to fit in a single model request, the app automatically uploads the transcript as a file and continues the conversation with an Assistant run. This ensures long inputs don’t fail silently and summaries are still generated.

- **Password-protected API**  
  A configurable API password (stored locally in the browser) ensures only authorized users can generate summaries.

- **Polling for long jobs**  
  If the Assistant workflow is triggered, the UI polls for completion and updates with progress information.

- **Clipboard integration**  
  Copy transcript or summary text directly to the clipboard (summary text attempts to copy rich text version, falls back to plain text if necessary).

- **Responsive design**  
  Works well on both desktop and mobile layouts, using Material UI’s responsive grid system.

- **Language fallback for transcripts**  
  If the requested language isn’t available, the app retries using the first available caption language, and falls back to a no-language request if parsing fails.

---

## Getting Started

### Prerequisites

- Node.js 18+ or Docker
- An [OpenAI API key](https://platform.openai.com/)

### Local Development

1. Clone the repository:

   ```bash
   git clone https://github.com/your-username/yt-transcribe.git
   cd yt-transcribe
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env.local` and fill in values:

   ```bash
   cp .env.example .env.local
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

### Docker Deployment

A `Dockerfile` and `docker-compose.yml` are included.

```bash
docker compose up --build -d
```

Make sure to configure `.env.local` before building.

---

## Project Structure

- `pages/api/getTranscript.ts` – API route for fetching YouTube transcripts
- `pages/api/getSummary.ts` – API route for generating summaries
- `pages/index.tsx` – Main UI
- `util/theme.ts` – Material UI theme configuration
- `util/createEmotionCache.ts` – SSR style caching for Emotion/Material UI
- `Dockerfile` – Multi-stage Docker build
- `docker-compose.yml` – Example Compose setup with reverse proxy integration

---

## Security Notes

- No secrets should be committed. Keep your `.env.local` private.
- API password protects summary endpoints; choose a strong value.
- For production, consider rate limiting and HTTPS via a reverse proxy.

---

## Transcript Notes

- The transcript API accepts YouTube URLs or raw video IDs. It resolves IDs using `@uandi/video-id`.
- Some videos have captions disabled or only in non-English languages; in those cases, the app will fall back to any available language.
- If YouTube rate-limits requests, retry later or consider proxying at the `youtube-transcript-plus` layer.

## Formatting

Run Prettier from the repo root:

```bash
npx prettier . --write
```
