import type { NextApiRequest, NextApiResponse } from "next";
import { getVideoId } from "@uandi/video-id";
import {
  fetchTranscript,
  YoutubeTranscriptNotAvailableLanguageError,
} from "youtube-transcript-plus";
import { decode } from "html-entities";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const body = JSON.parse(req.body);
  const ytUrlInput = body.yturl || "";

  if (ytUrlInput === "") {
    res.status(500).send("YouTube URL not provided.");
    return;
  }

  try {
    const ytVideoId = getVideoId(ytUrlInput).id || ytUrlInput;

    let transcriptFromNpmVideoId;
    try {
      transcriptFromNpmVideoId = await fetchTranscript(ytVideoId, {
        lang: "en",
      });
    } catch (error: any) {
      if (error instanceof YoutubeTranscriptNotAvailableLanguageError) {
        try {
          const availableLangsMatch = error.message.match(
            /Available languages:\s*([^.]*)/,
          );
          if (!availableLangsMatch)
            throw new Error(
              "No available languages could be parsed from the error message.",
            );
          const availableLangs = availableLangsMatch[1]
            .split(",")
            .map((lang) => lang.trim());
          console.log("Retrying with available languages:", availableLangs);
          if (availableLangs.length === 0) {
            throw new Error(
              "No transcripts available in any language for this video.",
            );
          }
          transcriptFromNpmVideoId = await fetchTranscript(ytVideoId, {
            lang: availableLangs[0],
          });
        } catch (langError) {
          console.warn(
            "Language-specific retry failed; retrying without language.",
            langError,
          );
          transcriptFromNpmVideoId = await fetchTranscript(ytVideoId);
        }
      } else {
        throw error;
      }
    }

    const joinedTranscript = transcriptFromNpmVideoId
      .map((transcriptPart) => transcriptPart.text)
      .join(" ");

    const finalTranscript = decode(decode(joinedTranscript));

    if (finalTranscript === "")
      throw new Error(
        "Transcript service returned an empty result. Try again.",
      );

    res.status(200).json(finalTranscript);
  } catch (error: any) {
    console.error(error);
    res.status(500).send(error.message);
  }
};

export default handler;
