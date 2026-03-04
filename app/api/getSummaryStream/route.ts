import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI;
function getClient() {
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

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
      process.env.GEMINI_MAX_OUTPUT_TOKENS || "8192",
      10,
    );

    const stream = await getClient().interactions.create({
      model: process.env.GEMINI_MODEL || "gemini-3-flash-preview",
      input,
      previous_interaction_id: interactionId || undefined,
      generation_config: { max_output_tokens: maxOutputTokens },
      stream: true,
    });

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

        try {
          for await (const chunk of stream) {
            if (chunk.event_type === "content.delta") {
              if (chunk.delta.type === "text" && "text" in chunk.delta) {
                send({ type: "delta", text: chunk.delta.text });
              }
              // Filter out thought deltas — don't send them as summary text
            } else if (chunk.event_type === "interaction.complete") {
              const usage = chunk.interaction?.usage;
              if (usage) {
                console.log(
                  `Token usage — input: ${usage.total_input_tokens}, output: ${usage.total_output_tokens}, total: ${usage.total_tokens}`,
                );
              }
              send({
                type: "complete",
                interactionId: chunk.interaction?.id || null,
              });
            } else if (chunk.event_type === "error") {
              const message =
                (chunk as any).error?.message || "Unknown Gemini error";
              console.error("Gemini stream error:", message);
              send({ type: "error", message });
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
