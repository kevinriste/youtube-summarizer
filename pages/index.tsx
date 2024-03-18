import * as React from 'react';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Alert, { AlertColor } from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Head from 'next/head'
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { Stack } from '@mui/material';

const Home = () => {
  const getYoutubeTranscript = async (event: React.MouseEvent<HTMLButtonElement>, alsoGetSummary: boolean = false) => {
    event.preventDefault();
    setTranscriptText('Fetching transcript...')
    setSummaryText('')
    setisTranscriptError(false)
    setIsSummaryError(false)
    const dataToSubmit = {
      yturl: urlText,
    };
    const response = await fetch("/api/getTranscript", {
      method: "POST",
      body: JSON.stringify(dataToSubmit),
    });
    if (response.ok) {
      const responseJson = await response.json();
      setTranscriptText(responseJson)
      if (alsoGetSummary) ensurePasswordExistsForGetSummary(undefined, responseJson);
    }
    else {
      const responseError = await response.text();
      console.error(responseError);
      setisTranscriptError(true)
      setTranscriptText(responseError.toString())
    }
  };

  const getSummaryFromTextboxContent = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setSummaryText('')
    setIsSummaryError(false)
    ensurePasswordExistsForGetSummary(undefined, textboxContent);
  };

  // Allow option to directly pass in transcript text in case state updates are slow
  // to ensure it's present before we request the summary
  const getTranscriptSummary = async (directlyPassedTranscriptText?: string) => {
    let dataToSubmit = {};
    if (!pendingRequestData) {
      setSummaryText('Fetching summary...')
      setSummaryAlert({ message: '', level: 'info' })
      setIsSummaryError(false)
      const passwordToSubmitToApi = localStorage.getItem("apiPassword")
      dataToSubmit = {
        transcript: directlyPassedTranscriptText ?? transcriptText,
        userPrompt: promptText,
        passwordToSubmitToApi
      };
    } else {
      dataToSubmit = pendingRequestData;
    }
    const response = await fetch("/api/getSummary", {
      method: "POST",
      body: JSON.stringify(dataToSubmit),
    });
    if (response.ok) {
      const responseJson = await response.json();
      const keysExpectedIfResponseIsPending = ['threadId', 'runId', 'assistantId', 'fileId', 'status'];
      if (keysExpectedIfResponseIsPending.every(key => responseJson.hasOwnProperty(key))) {
        setPendingRequestData(responseJson);
        setSummaryAlert({ message: `Processing using OpenAI Assistant due to long text; request is pending and updates will appear here. Current status: ${responseJson.status}`, level: "info" })
      } else {
        setPendingRequestData(undefined);
        setSummaryText(responseJson.summary)
      }
      if ((responseJson?.message || '') !== '') setSummaryAlert({ message: responseJson.message, level: "info" })
    }
    else {
      const responseError = await response.text();
      console.error(responseError);
      setIsSummaryError(true)
      setSummaryText(responseError.toString())
    }
  };

  React.useEffect(() => {
    let interval;
    if (pendingRequestData) {
      interval = setInterval(() => getTranscriptSummary(), 2000); // Poll every 5 seconds
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  });

  const defaultYoutubeSummaryPrompt = 'Please provide a bulleted list of the main points from the above YouTube transcript.';
  const defaultTextSummaryPrompt = 'Please provide a bulleted list of the main points from the above text.';

  const [isTranscriptError, setisTranscriptError] = React.useState(false);
  const [transcriptText, setTranscriptText] = React.useState('');

  const [isSummaryError, setIsSummaryError] = React.useState(false);
  const [summaryText, setSummaryText] = React.useState('');
  const [pendingRequestData, setPendingRequestData] = React.useState();

  const [urlText, setUrlText] = React.useState('');
  const [promptText, setPromptText] = React.useState(defaultYoutubeSummaryPrompt);

  const [textboxContent, setTextboxContent] = React.useState('');
  const [useTextboxContent, setUseTextboxContent] = React.useState(false);

  const [summaryAlert, setSummaryAlert] = React.useState<{ message: string, level: AlertColor }>({ message: '', level: 'info' })

  const [passwordDialogIsOpen, setPasswordDialogIsOpen] = React.useState(false);

  const handleUrlChange = (event) => {
    setUrlText(event.target.value);
  };

  const handlePromptChange = (event) => {
    setPromptText(event.target.value);
  };

  const handleTextboxContentChange = (event) => {
    setTextboxContent(event.target.value);
  };

  const ensurePasswordExistsForGetSummary = (event?: React.MouseEvent<HTMLButtonElement>, directlyPassedTranscriptText?: string) => {
    if (event) event.preventDefault();
    const apiPassword = localStorage.getItem("apiPassword");
    if (!apiPassword) setPasswordDialogIsOpen(true);
    else conditionallyHandlePasswordSaveAndProceedToGetSummary(undefined, directlyPassedTranscriptText);
  };

  const handlePasswordDialogClose = () => {
    setPasswordDialogIsOpen(false);
  };
  const conditionallyHandlePasswordSaveAndProceedToGetSummary = (event?: React.FormEvent<HTMLFormElement>, directlyPassedTranscriptText?: string) => {
    if (event) {
      event.preventDefault()
      setPasswordDialogIsOpen(false);
      const data = new FormData(event.currentTarget);
      const apiPasswordToSubmit = data.get('apiPasswordToSubmit');
      if (typeof apiPasswordToSubmit === 'string') localStorage.setItem("apiPassword", apiPasswordToSubmit);
      else localStorage.setItem("apiPassword", JSON.stringify(apiPasswordToSubmit));
    }
    getTranscriptSummary(directlyPassedTranscriptText);
  };

  return (
    <Container maxWidth="lg">
      <Head>
        <title>AI Summarizer</title>
      </Head>
      <Box
        sx={{
          marginTop: 8,
          marginBottom: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography component="h1" variant="h5">
          AI Summarizer
        </Typography>
        <Box sx={{ mt: 1, width: '100%' }}>
          <Stack spacing={2} alignItems="center">
            {!useTextboxContent && (<>
              <TextField
                margin="normal"
                fullWidth
                label="YouTube URL"
                autoFocus
                value={urlText}
                onChange={handleUrlChange}
              />
            </>)}
            {useTextboxContent && (<>
              <TextField
                margin="normal"
                fullWidth
                label="Text input"
                autoFocus
                multiline
                minRows={4}
                maxRows={10}
                value={textboxContent}
                onChange={handleTextboxContentChange}
              />
            </>)}
            <TextField
              margin="normal"
              fullWidth
              label="Summary prompt"
              value={promptText}
              onChange={handlePromptChange}
            />
            {!useTextboxContent && (<>
              <Button
                variant="contained"
                sx={{ mt: 3, maxWidth: "20rem" }}
                onClick={getYoutubeTranscript}
              >
                Get transcript
              </Button>
              <Button
                variant="contained"
                sx={{ mt: 3, maxWidth: "20rem" }}
                onClick={(e) => getYoutubeTranscript(e, true)}
              >
                Get Transcript and Summary
              </Button>
              <Button
                variant="contained"
                color="secondary"
                sx={{ mt: 3, maxWidth: "20rem" }}
                onClick={() => {
                  setUseTextboxContent(true);
                  setPromptText(defaultTextSummaryPrompt);
                  setTranscriptText('');
                  setSummaryText('');
                  setUrlText('');
                  setTextboxContent('');
                }}
              >
                Switch to using textbox input as text content
              </Button>
            </>)}
            {useTextboxContent && (<>
              <Button
                variant="contained"
                sx={{ mt: 3, maxWidth: "20rem" }}
                onClick={getSummaryFromTextboxContent}
              >
                Get Summary
              </Button>
              <Button
                variant="contained"
                color="secondary"
                sx={{ mt: 3, maxWidth: "20rem" }}
                onClick={() => {
                  setUseTextboxContent(false);
                  setPromptText(defaultYoutubeSummaryPrompt);
                  setTextboxContent('');
                  setSummaryText('');
                  setTranscriptText('');
                  setUrlText('');
                }}
              >
                Switch to using YouTube summary as text content
              </Button>
            </>)}
            {transcriptText !== '' && !isTranscriptError && transcriptText !== 'Fetching transcript...' &&
              <Button
                variant="contained"
                sx={{ mb: 2, maxWidth: "20rem" }}
                onClick={ensurePasswordExistsForGetSummary}
              >
                Get Summary
              </Button>
            }
          </Stack>
        </Box>
        <Dialog open={passwordDialogIsOpen} onClose={handlePasswordDialogClose}>
          <form onSubmit={conditionallyHandlePasswordSaveAndProceedToGetSummary}>
            <DialogTitle>Enter password</DialogTitle>
            <DialogContent>
              <DialogContentText>
                To get a summary, provide the API password here.
              </DialogContentText>
              <TextField
                autoFocus
                name="apiPasswordToSubmit"
                margin="dense"
                label="API password"
                fullWidth
                variant="standard"
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={handlePasswordDialogClose}>Cancel</Button>
              <Button type="submit">Submit</Button>
            </DialogActions>
          </form>
        </Dialog>
        {(transcriptText !== '' || useTextboxContent) && <Box
          sx={{
            marginTop: 4,
            marginBottom: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {((!isTranscriptError && transcriptText !== 'Fetching transcript...') || useTextboxContent) &&
            <>
              {!isSummaryError && summaryText !== '' &&
                <>
                  {summaryAlert.message !== '' &&
                    <Alert
                      severity={summaryAlert.level}
                      sx={{ mb: 2 }}
                    >
                      {summaryAlert.message}
                    </Alert>
                  }
                  <Button
                    onClick={() => navigator.clipboard.writeText(summaryText)}
                    variant="outlined"
                    sx={{ mb: 2 }}
                  >
                    Copy summary to clipboard
                  </Button>
                  <Typography sx={{ mb: 2 }}>
                    {summaryText.split('\n').map((line, index) => (
                      <span key={index}>
                        {line}
                        <br />
                      </span>
                    ))}
                  </Typography>
                </>
              }
              {isSummaryError &&
                <Alert
                  severity="error"
                  sx={{ mb: 2 }}
                >
                  {summaryText}
                </Alert>
              }
            </>
          }
          {!isTranscriptError && transcriptText !== '' && (
            <>
              <Button
                onClick={() => navigator.clipboard.writeText(transcriptText)}
                variant="outlined"
                sx={{ mb: 2 }}
              >
                Copy transcript to clipboard
              </Button>
              <Typography>
                {transcriptText}
              </Typography>
            </>
          )}
          {isTranscriptError && <Alert
            severity="error"
          >
            {transcriptText}
          </Alert>}
        </Box>}
      </Box>
    </Container>
  );
}

export default Home;
