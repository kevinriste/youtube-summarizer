import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI, { toFile } from 'openai';
import { encode } from 'gpt-tokenizer';
import * as z from 'zod';

// Structure 1: when submitting a transcript and prompt
const newSubmissionSchema = z.object({
  transcript: z.string(),
  userPrompt: z.string(),
  passwordToSubmitToApi: z.string(),
}).strict();

// Structure 2: when continuing an existing thread/run
const continuationSchema = z.object({
  threadId: z.string(),
  runId: z.string(),
  assistantId: z.string(),
  fileId: z.string(),
}).strict();

// ---- ENV validation (throws on import if invalid) ----
const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_MODEL: z.string().min(1, 'OPENAI_MODEL is required'),
  OPENAI_MAX_RESPONSE_TOKENS: z.coerce.number().int().positive()
    .describe('positive integer').optional(),
  OPENAI_MAX_TOTAL_TOKENS: z.coerce.number().int().positive()
    .describe('positive integer').optional(),
  API_PASSWORD: z.string().min(1, 'API_PASSWORD is required'),
});

const ENV = envSchema.parse(process.env);

const configuration = {
  apiKey: ENV.OPENAI_API_KEY,
};
const openai = new OpenAI(configuration);

const processResponseText = (text: string) => {
  // Regular expression to match the citation pattern 【number†source】
  const citationRegex = /【\d+†source】/g;

  // Replace the citation with an empty string
  return text.replace(citationRegex, '');
};

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
  try {
    const openAiMaxResponseTokens = ENV.OPENAI_MAX_RESPONSE_TOKENS ?? 10;
    const openAiMaxTotalTokens = ENV.OPENAI_MAX_TOTAL_TOKENS ?? 10;
    let body: unknown;

    if (typeof req.body !== "string") {
      throw new Error('Invalid request body (not a string)');
    }

    const newSubmissionSchemaBody = newSubmissionSchema.safeParse(body);
    const continuationSchemaBody = continuationSchema.safeParse(body);

    if (!newSubmissionSchemaBody.success && !continuationSchemaBody.success) {
      throw new Error(
        'Invalid request body: must be either { transcript, userPrompt, passwordToSubmitToApi } or { threadId, runId, assistantId, fileId }.'
      );
    }

    if (newSubmissionSchemaBody.success) {
      const { transcript, userPrompt } = newSubmissionSchemaBody.data;
      const inputPassword = newSubmissionSchemaBody.data.passwordToSubmitToApi;

      if (inputPassword === ENV.API_PASSWORD) {
        let prompt = '### START TRANSCRIPT ### ' + transcript;
        const endOfTranscript = " ### END TRANSCRIPT ### " + userPrompt;
        const tokensInEndOfTranscript = encode(endOfTranscript).length;
        const encodedPrompt = encode(prompt);
        const tokenCount = encodedPrompt.length;
        let messageIsBelowTokenLimit = true;

        if ((tokenCount + openAiMaxResponseTokens + tokensInEndOfTranscript) > openAiMaxTotalTokens) {
          messageIsBelowTokenLimit = false;
          console.log("Using assistant method due to long transcript.");
        }

        prompt = prompt + endOfTranscript;

        if (messageIsBelowTokenLimit) {
          const completion = await openai.chat.completions.create({
            model: ENV.OPENAI_MODEL,
            messages: [{ role: "user", content: prompt }],
            max_completion_tokens: openAiMaxResponseTokens,
          });

          const summary = completion.choices[0].message.content;

          res.status(200).json({
            summary
          });
        } else {
          const buffer = Buffer.from(transcript);

          console.log("Uploading transcript as file for assistant.");
          const file = await openai.files.create({
            file: await toFile(buffer, 'transcript.txt'),
            purpose: "assistants",
          });

          console.log("Creating assistant.");
          const assistant = await openai.beta.assistants.create({
            model: ENV.OPENAI_MODEL,
            tools: [{ type: "file_search" }],
          });

          console.log("Creating thread.");
          const thread = await openai.beta.threads.create({
            messages: [
              {
                "role": "user",
                "content": userPrompt,
                attachments: [{ file_id: file.id, tools: [{ type: "file_search" }] }]
              }
            ]
          });

          console.log("Creating assistant-thread run.");
          const run = await openai.beta.threads.runs.create(
            thread.id,
            { assistant_id: assistant.id }
          );

          res.status(200).json({
            threadId: thread.id,
            runId: run.id,
            assistantId: assistant.id,
            fileId: file.id,
            status: run.status,
          });
        }
      } else {
        throw new Error(
          'Invalid password. Please clear local storage for this page and try again.'
        );
      }
    } else if (continuationSchemaBody.success) {
      const { threadId, runId, assistantId, fileId } = continuationSchemaBody.data
      const followUpRun = await openai.beta.threads.runs.retrieve(
        threadId,
        runId,
      );
      console.log(`Run status: ${followUpRun.status}`);

      if (followUpRun.status !== "completed") {
        res.status(200).json({
          threadId: threadId,
          runId: runId,
          assistantId: assistantId,
          fileId: fileId,
          status: followUpRun.status,
        });
      } else {
        const allMessages = await openai.beta.threads.messages.list(threadId);

        if (allMessages.data[0].content[0].type === 'text') {
          const summary = processResponseText(allMessages.data[0].content[0].text.value);

          try {
            console.log("Deleting uploaded file.");
            await openai.files.delete(
              fileId,
            );
          } catch (error: unknown) {
            console.error("Error deleting file, not elevated since it doesn't affect the user experience.");
            if (error.response) {
              console.error(error.response.status);
              console.error(error.response.data);
            } else {
              console.error(error.message);
            }
          }

          console.log("Request completed.");

          res.status(200).json({
            summary,
            message: 'Processing complete',
          });
        } else {
          throw new Error(
            'OpenAI Assistant response was not in text format. Please try again.'
          );
        }
      }
    } else res.status(500).send('Incorrect API password provided or missing previous request information');
  } catch (error: unknown) {
    if (error.response) {
      console.error(error.response.status);
      console.error(error.response.data);
      res.status(500).send(error.response.data.error.message);
    } else {
      console.error(error.message);
      res.status(500).send(error.message);
    }
  }
}

export default handler;
