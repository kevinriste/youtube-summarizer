// Transcript chat runs on OpenAI's Responses API. gpt-5.6-luna sits in the free
// 10M/day group of the data-sharing program; follow-ups chain on the previous
// response id (the client still calls it interactionId).
const OPENAI_URL = "https://api.openai.com/v1/responses";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      transcript,
      userPrompt,
      previousInteractionId,
      passwordToSubmitToApi,
    } = body;

    if (passwordToSubmitToApi !== process.env.API_PASSWORD) {
      return new Response("Incorrect API password", { status: 401 });
    }

    const promptText = typeof userPrompt === "string" ? userPrompt : "";
    const interactionId =
      typeof previousInteractionId === "string" ? previousInteractionId : "";

    let input: string;

    if (interactionId) {
      if (!promptText.trim()) {
        return new Response("No prompt provided", { status: 400 });
      }
      input = promptText;
    } else {
      if (!transcript || typeof transcript !== "string") {
        return new Response("No transcript provided", { status: 400 });
      }
      input =
        "### START TRANSCRIPT ### " +
        transcript +
        " ### END TRANSCRIPT ### " +
        promptText;
    }

    const maxOutputTokens = parseInt(
      process.env.OPENAI_MAX_OUTPUT_TOKENS || "16000",
      10,
    );

    const upstream = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        input,
        previous_response_id: interactionId || undefined,
        max_output_tokens: maxOutputTokens,
        reasoning: { effort: process.env.OPENAI_REASONING || "low" },
        stream: true,
      }),
    });
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text();
      console.error("OpenAI request failed:", upstream.status, detail);
      return new Response(`OpenAI error ${upstream.status}: ${detail}`, {
        status: 502,
      });
    }
    const upstreamBody = upstream.body;

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (data: Record<string, unknown>) => {
          if (closed) return;
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
            );
          } catch {
            closed = true;
          }
        };
        const close = () => {
          if (closed) return;
          closed = true;
          controller.close();
        };

        const handle = (event: any) => {
          if (event.type === "response.output_text.delta") {
            send({ type: "delta", text: event.delta });
          } else if (event.type === "response.completed") {
            const usage = event.response?.usage;
            if (usage) {
              console.log(
                `Token usage — input: ${usage.input_tokens}, output: ${usage.output_tokens}, total: ${usage.total_tokens}`,
              );
            }
            send({ type: "complete", interactionId: event.response?.id || null });
          } else if (
            event.type === "error" ||
            event.type === "response.failed" ||
            event.type === "response.incomplete"
          ) {
            const message =
              event.message ||
              event.response?.error?.message ||
              event.response?.incomplete_details?.reason ||
              "Unknown OpenAI error";
            console.error("OpenAI stream error:", message);
            send({ type: "error", message });
          }
        };

        try {
          const reader = upstreamBody.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let sep: number;
            while ((sep = buffer.indexOf("\n\n")) !== -1) {
              const frame = buffer.slice(0, sep);
              buffer = buffer.slice(sep + 2);
              const data = frame
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trim())
                .join("");
              if (data && data !== "[DONE]") handle(JSON.parse(data));
            }
          }
        } catch (err: any) {
          console.error("Stream processing error:", err.message);
          send({ type: "error", message: err.message });
        } finally {
          close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: any) {
    console.error("getSummaryStream error:", err.message);
    return new Response(err.message || "Internal server error", {
      status: 500,
    });
  }
}
