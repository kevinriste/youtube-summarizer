import type { NextApiRequest, NextApiResponse } from 'next';
import getVideoId from 'get-video-id';
import { YoutubeTranscript, YoutubeTranscriptNotAvailableLanguageError } from 'youtube-transcript';
import { decode } from 'html-entities';

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
  const body = JSON.parse(req.body);
  const ytUrlInput = body.yturl || '';

  if (ytUrlInput === '') {
    res.status(500).send('YouTube URL not provided.');
    return;
  }

  try {
    const { id: ytVideoId } = getVideoId(ytUrlInput);

    let transcriptFromNpmVideoId;
    try {
      transcriptFromNpmVideoId = await YoutubeTranscript.fetchTranscript(ytVideoId || '', {
        lang: 'en'
      });
    } catch (error: any) {
      if (error instanceof YoutubeTranscriptNotAvailableLanguageError) {
        const availableLangsMatch = error.message.match(/Available languages: (.+)/);
        if (availableLangsMatch) {
          const availableLangs = availableLangsMatch[1].split(',').map(lang => lang.trim());
          console.log('Retrying with available languages:', availableLangs);
          if (availableLangs.length > 0) {
            // Retry with the first available language
            transcriptFromNpmVideoId = await YoutubeTranscript.fetchTranscript(ytVideoId || '', {
              lang: availableLangs[0]
            });
          } else {
            throw new Error('No transcripts available in any language for this video.');
          }
        } else {
          throw new Error('No available languages could be parsed from the error message.');
        }
      } else {
        throw error;
      }
    }

    const joinedTranscript = transcriptFromNpmVideoId.map(transcriptPart => transcriptPart.text).join(' ');

    const finalTranscript = decode(decode(joinedTranscript));

    res.status(200).json(finalTranscript);
  } catch (error: any) {
    console.error(error);
    res.status(500).send(error.message);
  }
}

export default handler;
