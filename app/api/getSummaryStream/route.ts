import OpenAI from "openai";
import type { ResponseInput } from "openai/resources/responses/responses";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      transcript,
      userPrompt,
      previousResponseId,
      passwordToSubmitToApi,
    } = body;

    if (passwordToSubmitToApi !== process.env.API_PASSWORD) {
      return new Response("Incorrect API password", { status: 401 });
    }

    let input: ResponseInput;
    const promptText = typeof userPrompt === "string" ? userPrompt : "";
    const responseId =
      typeof previousResponseId === "string" ? previousResponseId : "";

    if (responseId) {
      if (!promptText.trim()) {
        return new Response("No prompt provided", { status: 400 });
      }
      input = [{ role: "user", content: promptText }];
    } else {
      if (!transcript || typeof transcript !== "string") {
        return new Response("No transcript provided", { status: 400 });
      }
      const prompt =
        "### START TRANSCRIPT ### " +
        transcript +
        " ### END TRANSCRIPT ### " +
        promptText;
      input = [{ role: "user", content: prompt }];
    }

    const maxOutputTokens = parseInt(
      process.env.OPENAI_MAX_RESPONSE_TOKENS || "4096",
      10,
    );

    const stream = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "",
      input,
      previous_response_id: responseId || undefined,
      max_output_tokens: maxOutputTokens,
      store: true,
      stream: true,
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      cancel() {
        stream.controller.abort();
      },
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
          for await (const event of stream) {
            if (event.type === "response.output_text.delta") {
              send({ type: "delta", text: event.delta });
            } else if (event.type === "response.completed") {
              const usage = event.response?.usage;
              if (usage) {
                console.log(
                  `Token usage — input: ${usage.input_tokens}, output: ${usage.output_tokens}, total: ${usage.total_tokens}`,
                );
              }
              send({
                type: "complete",
                responseId: event.response?.id || null,
              });
            } else if (event.type === "error") {
              const message =
                (event as any).error?.message || "Unknown OpenAI error";
              console.error("OpenAI stream error:", message);
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
