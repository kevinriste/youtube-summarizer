// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'
import OpenAI, { toFile } from 'openai';
import { encode } from 'gpt-tokenizer';

const configuration = {
  apiKey: process.env.OPENAI_API_KEY,
};
const openai = new OpenAI(configuration);

const processResponseText = (text) => {
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
    const openAiMaxResponseTokens = parseInt(process.env.OPENAI_MAX_RESPONSE_TOKENS || '', 10);
    const openAiMaxTotalTokens = parseInt(process.env.OPENAI_MAX_TOTAL_TOKENS || '', 10);
    const body = JSON.parse(req.body);
    const transcript = body.transcript || '';
    const userPrompt = body.userPrompt || '';
    const inputPassword = body.passwordToSubmitToApi || '';

    const threadId = body.threadId || '';
    const runId = body.runId || '';
    const assistantId = body.assistantId || '';
    const fileId = body.fileId || '';

    let summary: any = '';

    if (inputPassword === process.env.API_PASSWORD) {
      let prompt = '### START TRANSCRIPT ### ' + transcript
      const endOfTranscript = " ### END TRANSCRIPT ### " + userPrompt
      const tokensInEndOfTranscript = encode(endOfTranscript).length;
      const encodedPrompt = encode(prompt);
      let tokenCount = encodedPrompt.length;
      let messageIsBelowTokenLimit = true;

      if ((tokenCount + openAiMaxResponseTokens + tokensInEndOfTranscript) > openAiMaxTotalTokens) {
        messageIsBelowTokenLimit = false;
        console.log("Using assistant method due to long transcript.")
      }

      prompt = prompt + endOfTranscript

      if (messageIsBelowTokenLimit) {
        const completion = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || '',
          messages: [{ role: "user", content: prompt }],
          max_tokens: openAiMaxResponseTokens,
        });

        summary = completion.choices[0].message.content;

        res.status(200).json({
          summary
        })
      } else {
        const buffer = Buffer.from(transcript);

        console.log("Uploading transcript as file for assistant.")
        const file = await openai.files.create({
          file: await toFile(buffer, 'transcript.txt'),
          purpose: "assistants",
        });

        console.log("Creating assistant.")
        const assistant = await openai.beta.assistants.create({
          model: process.env.OPENAI_MODEL || '',
          file_ids: [file.id],
          tools: [{ "type": "retrieval" }],
        });

        console.log("Creating thread.")
        const thread = await openai.beta.threads.create({
          messages: [
            {
              "role": "user",
              "content": userPrompt,
              "file_ids": [file.id]
            }
          ]
        });

        console.log("Creating assistant-thread run.")
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
        })
      }
    } else if (threadId !== '' && runId !== '' && assistantId !== '' && fileId !== '') {
      const followUpRun = await openai.beta.threads.runs.retrieve(
        threadId,
        runId,
      );
      console.log(`Run status: ${followUpRun.status}`)

      if (followUpRun.status !== "completed") {
        res.status(200).json({
          threadId: threadId,
          runId: runId,
          assistantId: assistantId,
          fileId: fileId,
          status: followUpRun.status,
        })
      } else {
        const allMessages = await openai.beta.threads.messages.list(threadId);

        if (allMessages.data[0].content[0].type === 'text') {
          summary = processResponseText(allMessages.data[0].content[0].text.value);
        }

        try {
          console.log("Deleting uploaded file.")
          await openai.beta.assistants.files.del(
            assistantId,
            fileId,
          );
        } catch (error: any) {
          console.error("Error deleting file, not elevated since it doesn't affect the user experience.")
          if (error.response) {
            console.error(error.response.status);
            console.error(error.response.data);
          } else {
            console.error(error.message);
          }
        }

        console.log("Request completed.")

        res.status(200).json({
          summary,
          message: 'Processing complete',
        })
      }
    } else res.status(500).send('Incorrect API password provided or missing previous request information');
  } catch (error: any) {
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
