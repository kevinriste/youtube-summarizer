import * as React from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Alert, { AlertColor } from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import Head from "next/head";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { CircularProgress, Stack } from "@mui/material";
import Markdown from "react-markdown";

const Home = () => {
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const getYoutubeTranscript = async (
    event: React.MouseEvent<HTMLButtonElement>,
    alsoGetSummary: boolean = false,
  ) => {
    event.preventDefault();
    setTranscriptText("Fetching transcript...");
    setSummaryText("");
    setisTranscriptError(false);
    setIsSummaryError(false);
    const dataToSubmit = {
      yturl: urlText,
    };
    const response = await fetch("/api/getTranscript", {
      method: "POST",
      body: JSON.stringify(dataToSubmit),
    });
    if (response.ok) {
      const responseJson = await response.json();
      setTranscriptText(responseJson);
      if (alsoGetSummary)
        ensurePasswordExistsForGetSummary(undefined, responseJson);
    } else {
      const responseError = await response.text();
      console.error(responseError);
      setisTranscriptError(true);
      setTranscriptText(responseError.toString());
    }
  };

  const getSummaryFromTextboxContent = async (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    setSummaryText("");
    setIsSummaryError(false);
    ensurePasswordExistsForGetSummary(undefined, textboxContent);
  };

  const cancelSummary = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setSummaryAlert({ message: "Summary cancelled.", level: "warning" });
  };

  const getTranscriptSummary = async (
    directlyPassedTranscriptText?: string,
  ) => {
    setSummaryText("");
    setSummaryAlert({ message: "", level: "info" });
    setIsSummaryError(false);
    setIsStreaming(true);
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 50);

    const passwordToSubmitToApi = localStorage.getItem("apiPassword");
    const dataToSubmit = {
      transcript: directlyPassedTranscriptText ?? transcriptText,
      userPrompt: promptText,
      passwordToSubmitToApi,
    };

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/getSummaryStream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataToSubmit),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(errorText);
        setIsSummaryError(true);
        setSummaryText(errorText);
        setIsStreaming(false);
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let lineBuf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuf += decoder.decode(value, { stream: true });
        const lines = lineBuf.split("\n");
        // Keep the last potentially incomplete line in the buffer
        lineBuf = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === "delta") {
            accumulated += data.text;
            setSummaryText(accumulated);
          } else if (data.type === "complete") {
            // Stream finished successfully
          } else if (data.type === "error") {
            setIsSummaryError(true);
            setSummaryText(data.message);
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        // User cancelled — already handled in cancelSummary
      } else {
        console.error(err);
        setIsSummaryError(true);
        setSummaryText(err.message || "Failed to fetch summary");
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const defaultYoutubeSummaryPrompt =
    "Please provide a bulleted list of the main points from the above YouTube transcript.";
  const defaultTextSummaryPrompt =
    "Please provide a bulleted list of the main points from the above text.";

  const [isTranscriptError, setisTranscriptError] = React.useState(false);
  const [transcriptText, setTranscriptText] = React.useState("");

  const [isSummaryError, setIsSummaryError] = React.useState(false);
  const [summaryText, setSummaryText] = React.useState("");
  const [isStreaming, setIsStreaming] = React.useState(false);

  const [urlText, setUrlText] = React.useState("");
  const [promptText, setPromptText] = React.useState(
    defaultYoutubeSummaryPrompt,
  );

  const [textboxContent, setTextboxContent] = React.useState("");
  const [useTextboxContent, setUseTextboxContent] = React.useState(false);

  const [summaryAlert, setSummaryAlert] = React.useState<{
    message: string;
    level: AlertColor;
  }>({ message: "", level: "info" });

  const [passwordDialogIsOpen, setPasswordDialogIsOpen] = React.useState(false);
  const [transcriptExpanded, setTranscriptExpanded] = React.useState(false);

  const markdownRef = React.useRef<HTMLDivElement>(null);

  const copyToClipboard = async () => {
    if (navigator.clipboard && navigator.clipboard.write) {
      if (markdownRef.current) {
        const htmlContent = markdownRef.current.innerHTML;
        const plainTextContent = markdownRef.current.innerText;

        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/html": new Blob([htmlContent], { type: "text/html" }),
              "text/plain": new Blob([plainTextContent], {
                type: "text/plain",
              }),
            }),
          ]);
        } catch (err) {
          console.error("Failed to copy: ", err);
          alert(
            "Failed to copy rich text! See console for error. Copying plain text.",
          );
          navigator.clipboard.writeText(summaryText);
        }
      }
    } else {
      alert(
        "Clipboard API not supported on this browser! Cannot copy to clipboard.",
      );
    }
  };

  const handleUrlChange = (event) => {
    setUrlText(event.target.value);
  };

  const handlePromptChange = (event) => {
    setPromptText(event.target.value);
  };

  const handleTextboxContentChange = (event) => {
    setTextboxContent(event.target.value);
  };

  const ensurePasswordExistsForGetSummary = (
    event?: React.MouseEvent<HTMLButtonElement>,
    directlyPassedTranscriptText?: string,
  ) => {
    if (event) event.preventDefault();
    const apiPassword = localStorage.getItem("apiPassword");
    if (!apiPassword) setPasswordDialogIsOpen(true);
    else
      conditionallyHandlePasswordSaveAndProceedToGetSummary(
        undefined,
        directlyPassedTranscriptText,
      );
  };

  const handlePasswordDialogClose = () => {
    setPasswordDialogIsOpen(false);
  };
  const conditionallyHandlePasswordSaveAndProceedToGetSummary = (
    event?: React.FormEvent<HTMLFormElement>,
    directlyPassedTranscriptText?: string,
  ) => {
    if (event) {
      event.preventDefault();
      setPasswordDialogIsOpen(false);
      const data = new FormData(event.currentTarget);
      const apiPasswordToSubmit = data.get("apiPasswordToSubmit");
      if (typeof apiPasswordToSubmit === "string")
        localStorage.setItem("apiPassword", apiPasswordToSubmit);
      else
        localStorage.setItem(
          "apiPassword",
          JSON.stringify(apiPasswordToSubmit),
        );
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
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Typography component="h1" variant="h5">
          AI Summarizer
        </Typography>
        <Box sx={{ mt: 1, width: "100%" }}>
          <Stack spacing={2} alignItems="center">
            {!useTextboxContent && (
              <>
                <TextField
                  margin="normal"
                  fullWidth
                  label="YouTube URL"
                  autoFocus
                  value={urlText}
                  onChange={handleUrlChange}
                />
              </>
            )}
            {useTextboxContent && (
              <>
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
              </>
            )}
            <TextField
              margin="normal"
              fullWidth
              label="Summary prompt"
              value={promptText}
              onChange={handlePromptChange}
            />
            {!useTextboxContent && (
              <>
                <Button
                  variant="contained"
                  sx={{ mt: 3, maxWidth: "20rem" }}
                  onClick={getYoutubeTranscript}
                  disabled={isStreaming}
                >
                  Get transcript
                </Button>
                <Button
                  variant="contained"
                  sx={{ mt: 3, maxWidth: "20rem" }}
                  onClick={(e) => getYoutubeTranscript(e, true)}
                  disabled={isStreaming}
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
                    setTranscriptText("");
                    setSummaryText("");
                    setUrlText("");
                    setTextboxContent("");
                  }}
                >
                  Switch to using textbox input as text content
                </Button>
              </>
            )}
            {useTextboxContent && (
              <>
                <Button
                  variant="contained"
                  sx={{ mt: 3, maxWidth: "20rem" }}
                  onClick={getSummaryFromTextboxContent}
                  disabled={isStreaming}
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
                    setTextboxContent("");
                    setSummaryText("");
                    setTranscriptText("");
                    setUrlText("");
                  }}
                >
                  Switch to using YouTube summary as text content
                </Button>
              </>
            )}
            {transcriptText !== "" &&
              !isTranscriptError &&
              transcriptText !== "Fetching transcript..." && (
                <Button
                  variant="contained"
                  sx={{ mb: 2, maxWidth: "20rem" }}
                  onClick={ensurePasswordExistsForGetSummary}
                  disabled={isStreaming}
                >
                  Get Summary
                </Button>
              )}
            {isStreaming && (
              <Button
                variant="outlined"
                color="error"
                sx={{ mb: 2, maxWidth: "20rem" }}
                onClick={cancelSummary}
              >
                Cancel Summary
              </Button>
            )}
          </Stack>
        </Box>
        <Dialog open={passwordDialogIsOpen} onClose={handlePasswordDialogClose}>
          <form
            onSubmit={conditionallyHandlePasswordSaveAndProceedToGetSummary}
          >
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
                type="password"
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
        {(transcriptText !== "" || useTextboxContent) && (
          <Box
            sx={{
              marginTop: 4,
              marginBottom: 4,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {((!isTranscriptError &&
              transcriptText !== "Fetching transcript...") ||
              useTextboxContent) && (
              <>
                {summaryAlert.message !== "" && (
                  <Alert severity={summaryAlert.level} sx={{ mb: 2 }}>
                    {summaryAlert.message}
                  </Alert>
                )}
                {!isSummaryError && (isStreaming || summaryText !== "") && (
                  <>
                    {isStreaming && summaryText === "" && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, my: 2 }}>
                        <CircularProgress size={20} />
                        <Typography color="text.secondary">
                          Generating summary...
                        </Typography>
                      </Box>
                    )}
                    {!isStreaming && summaryText !== "" && (
                      <Button
                        onClick={() => copyToClipboard()}
                        variant="outlined"
                        sx={{ mb: 2 }}
                      >
                        Copy summary to clipboard
                      </Button>
                    )}
                    <div ref={markdownRef}>
                      <Markdown>{summaryText}</Markdown>
                    </div>
                  </>
                )}
                {isSummaryError && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {summaryText}
                  </Alert>
                )}
              </>
            )}
            {!isTranscriptError && transcriptText !== "" && (
              <Box sx={{ width: "100%", mt: 2 }}>
                <Button
                  variant="text"
                  onClick={() => setTranscriptExpanded(!transcriptExpanded)}
                  sx={{ textTransform: "none", gap: 1 }}
                >
                  <Typography fontWeight="medium">
                    {transcriptExpanded ? "▲ Hide" : "▼ Show"} Transcript
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    ({transcriptText.length.toLocaleString()} chars)
                  </Typography>
                </Button>
                {transcriptExpanded && (
                  <Box sx={{ mt: 1, pl: 1 }}>
                    <Button
                      onClick={() =>
                        navigator.clipboard.writeText(transcriptText)
                      }
                      variant="outlined"
                      size="small"
                      sx={{ mb: 2 }}
                    >
                      Copy transcript to clipboard
                    </Button>
                    <Typography
                      sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                    >
                      {transcriptText}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
            {isTranscriptError && (
              <Alert severity="error">{transcriptText}</Alert>
            )}
          </Box>
        )}
      </Box>
    </Container>
  );
};

export default Home;
