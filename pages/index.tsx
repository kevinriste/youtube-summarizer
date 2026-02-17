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
    const requestedUrl = urlText.trim();
    setTranscriptText("Fetching transcript...");
    setSummaryText("");
    setisTranscriptError(false);
    setIsSummaryError(false);
    setHasSummaryForCurrentTranscript(false);
    const dataToSubmit = {
      yturl: requestedUrl,
    };
    const response = await fetch("/api/getTranscript", {
      method: "POST",
      body: JSON.stringify(dataToSubmit),
    });
    if (response.ok) {
      const responseJson = await response.json();
      setTranscriptText(responseJson);
      setSuccessfulTranscriptUrl(requestedUrl);
      if (alsoGetSummary) {
        ensurePasswordExistsForGetSummary(undefined, responseJson);
      } else {
        setTranscriptExpanded(true);
        setScrollToTranscript(true);
      }
    } else {
      const responseError = await response.text();
      console.error(responseError);
      setisTranscriptError(true);
      setTranscriptText(responseError.toString());
      setSuccessfulTranscriptUrl(null);
    }
  };

  const cancelSummary = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setSummaryAlert({ message: "Summary cancelled.", level: "warning" });
  };

  // Shared SSE streaming helper — returns the accumulated text or null on error/abort
  const streamResponse = async (
    body: Record<string, unknown>,
    onDelta: (accumulated: string) => void,
  ): Promise<string | null> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const response = await fetch("/api/getSummaryStream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
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
      lineBuf = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = JSON.parse(line.slice(6));

        if (data.type === "delta") {
          accumulated += data.text;
          onDelta(accumulated);
        } else if (data.type === "error") {
          throw new Error(data.message);
        }
      }
    }

    return accumulated;
  };

  const getTranscriptSummary = async (
    directlyPassedTranscriptText?: string,
  ) => {
    setSummaryText("");
    setFollowUpText("");
    setFollowUpMessages([]);
    setStreamingText("");
    setSummaryAlert({ message: "", level: "info" });
    setIsSummaryError(false);
    setIsStreaming(true);
    setConversationHistory([]);
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 50);

    const passwordToSubmitToApi = localStorage.getItem("apiPassword");
    const transcript = directlyPassedTranscriptText ?? transcriptText;
    const userPrompt = promptText;

    try {
      const result = await streamResponse(
        { transcript, userPrompt, passwordToSubmitToApi },
        (acc) => setSummaryText(acc),
      );

      if (result) {
        setHasSummaryForCurrentTranscript(true);
        // Only include the transcript as context for follow-ups, not the
        // summary instruction, so the model doesn't keep producing bullet lists.
        const context =
          "### START TRANSCRIPT ### " +
          transcript +
          " ### END TRANSCRIPT ###";
        setConversationHistory([
          { role: "user", content: context },
          { role: "assistant", content: result },
        ]);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error(err);
        setIsSummaryError(true);
        setSummaryText(err.message || "Failed to fetch summary");
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const cancelFollowUp = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // If no response started, mark the user message as cancelled.
    // If a partial response exists, save it as cancelled but leave the user message alone.
    setFollowUpMessages((prev) => {
      const updated = [...prev];
      if (streamingText) {
        updated.push({ role: "assistant", content: streamingText, cancelled: true });
      } else if (updated.length > 0 && updated[updated.length - 1].role === "user") {
        updated[updated.length - 1] = { ...updated[updated.length - 1], cancelled: true };
      }
      return updated;
    });
    setStreamingText("");
    setIsStreaming(false);
  };

  const sendFollowUp = async () => {
    if (!followUpText.trim() || conversationHistory.length === 0 || isStreaming) return;

    const question = followUpText.trim();
    setFollowUpText("");
    setStreamingText("");
    setIsSummaryError(false);
    setIsStreaming(true);
    setSummaryAlert({ message: "", level: "info" });

    // Immediately show the user's message
    setFollowUpMessages((prev) => [...prev, { role: "user", content: question }]);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    const newHistory = [
      ...conversationHistory,
      { role: "user", content: question },
    ];

    const passwordToSubmitToApi = localStorage.getItem("apiPassword");

    try {
      const result = await streamResponse(
        { messages: newHistory, passwordToSubmitToApi },
        (acc) => {
          setStreamingText(acc);
          chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        },
      );

      if (result) {
        setFollowUpMessages((prev) => [
          ...prev,
          { role: "assistant", content: result },
        ]);
        setStreamingText("");
        setConversationHistory([
          ...newHistory,
          { role: "assistant", content: result },
        ]);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error(err);
        setFollowUpMessages((prev) => [
          ...prev,
          { role: "error", content: err.message || "Failed to fetch response" },
        ]);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const defaultYoutubeSummaryPrompt =
    "Please provide a fairly short list of the main points from the above YouTube transcript.";

  const [isTranscriptError, setisTranscriptError] = React.useState(false);
  const [transcriptText, setTranscriptText] = React.useState("");

  const [isSummaryError, setIsSummaryError] = React.useState(false);
  const [summaryText, setSummaryText] = React.useState("");
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [conversationHistory, setConversationHistory] = React.useState<
    Array<{ role: string; content: string }>
  >([]);
  const [followUpMessages, setFollowUpMessages] = React.useState<
    Array<{ role: string; content: string; cancelled?: boolean }>
  >([]);
  const [followUpText, setFollowUpText] = React.useState("");
  const [streamingText, setStreamingText] = React.useState("");

  const [urlText, setUrlText] = React.useState("");
  const [promptText, setPromptText] = React.useState(
    defaultYoutubeSummaryPrompt,
  );
  const [successfulTranscriptUrl, setSuccessfulTranscriptUrl] = React.useState<string | null>(null);
  const [hasSummaryForCurrentTranscript, setHasSummaryForCurrentTranscript] = React.useState(false);

  const [summaryAlert, setSummaryAlert] = React.useState<{
    message: string;
    level: AlertColor;
  }>({ message: "", level: "info" });

  const [passwordDialogIsOpen, setPasswordDialogIsOpen] = React.useState(false);
  const [transcriptExpanded, setTranscriptExpanded] = React.useState(false);

  const markdownRef = React.useRef<HTMLDivElement>(null);
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  const transcriptContentRef = React.useRef<HTMLDivElement>(null);
  const [scrollToTranscript, setScrollToTranscript] = React.useState(false);

  React.useEffect(() => {
    if (scrollToTranscript && transcriptContentRef.current) {
      transcriptContentRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      setScrollToTranscript(false);
    }
  }, [scrollToTranscript, transcriptExpanded]);

  const downloadConversation = () => {
    let md = "# YouTube Summary Conversation\n\n";
    if (urlText) {
      md += `**Source:** ${urlText}\n\n`;
    }
    md += "## Summary\n\n" + summaryText + "\n";
    if (followUpMessages.length > 0) {
      md += "\n## Conversation\n";
      for (let i = 0; i < followUpMessages.length; i++) {
        const msg = followUpMessages[i];
        const cancelled = msg.cancelled ? " *(cancelled)*" : "";
        if (msg.role === "user") {
          const content = msg.cancelled ? `*${msg.content}*` : msg.content;
          md += (i === 0 ? "\n" : "\n---\n\n") + "**You:**" + cancelled + " " + content + "\n";
        } else if (msg.role === "assistant") {
          const content = msg.cancelled ? `*${msg.content}*` : msg.content;
          md += "\n**AI:**" + cancelled + " " + content + "\n";
        }
      }
    }
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    a.download = `youtube-summary-conversation-${date}--${time}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  const hasSuccessfulTranscript =
    transcriptText !== "" &&
    !isTranscriptError &&
    transcriptText !== "Fetching transcript...";
  const hasTranscriptForCurrentUrl =
    hasSuccessfulTranscript &&
    successfulTranscriptUrl !== null &&
    successfulTranscriptUrl === urlText.trim();
  const summaryButtonLabel = hasSummaryForCurrentTranscript
    ? "Get Summary Again"
    : "Get Summary";

  return (
    <Container maxWidth="md">
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
            <TextField
              margin="normal"
              fullWidth
              label="YouTube URL"
              autoFocus
              value={urlText}
              onChange={handleUrlChange}
            />
            <TextField
              margin="normal"
              fullWidth
              label="Summary prompt"
              value={promptText}
              onChange={handlePromptChange}
            />
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 1.5,
                width: "100%",
                mt: 1,
              }}
            >
              {!hasTranscriptForCurrentUrl && (
                <Button
                  variant="contained"
                  sx={{ minWidth: "12rem", maxWidth: "20rem" }}
                  onClick={getYoutubeTranscript}
                  disabled={isStreaming}
                >
                  Get transcript
                </Button>
              )}
              {!hasTranscriptForCurrentUrl && (
                <Button
                  variant="contained"
                  sx={{ minWidth: "12rem", maxWidth: "20rem" }}
                  onClick={(e) => getYoutubeTranscript(e, true)}
                  disabled={isStreaming}
                >
                  Get Transcript and Summary
                </Button>
              )}
              {hasSuccessfulTranscript && (
                <Button
                  variant="contained"
                  sx={{ minWidth: "12rem", maxWidth: "20rem" }}
                  onClick={ensurePasswordExistsForGetSummary}
                  disabled={isStreaming}
                >
                  {summaryButtonLabel}
                </Button>
              )}
              {isStreaming && (
                <Button
                  variant="outlined"
                  color="error"
                  sx={{ minWidth: "12rem", maxWidth: "20rem" }}
                  onClick={cancelSummary}
                >
                  Cancel Summary
                </Button>
              )}
            </Box>
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
        {transcriptText !== "" && (
          <Box
            sx={{
              marginTop: 4,
              marginBottom: 4,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            {!isTranscriptError &&
              transcriptText !== "Fetching transcript..." && (
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
                      <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                        <Button
                          onClick={() => copyToClipboard()}
                          variant="outlined"
                        >
                          Copy summary to clipboard
                        </Button>
                        <Button
                          onClick={downloadConversation}
                          variant="outlined"
                        >
                          Download conversation
                        </Button>
                      </Box>
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
                {!isSummaryError &&
                  conversationHistory.length > 0 &&
                  (followUpMessages.length > 0 || !isStreaming) && (
                    <Box sx={{ width: "100%", mt: 3 }}>
                      {followUpMessages.length > 0 && (
                        <Box
                          sx={{
                            maxHeight: "60vh",
                            overflowY: "auto",
                            mb: 2,
                            border: 1,
                            borderColor: "divider",
                            borderRadius: 1,
                            p: 2,
                          }}
                        >
                          {followUpMessages.map((msg, i) => (
                            <Box
                              key={i}
                              sx={{
                                mb: 2,
                                p: 1.5,
                                borderRadius: 1,
                                opacity: msg.cancelled ? 0.45 : 1,
                                fontStyle: msg.cancelled ? "italic" : "normal",
                                bgcolor:
                                  msg.role === "user"
                                    ? "action.hover"
                                    : msg.role === "error"
                                      ? "error.light"
                                      : "transparent",
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                fontWeight="bold"
                                sx={{ mb: 0.5, display: "block" }}
                              >
                                {msg.role === "user" ? "You" : msg.role === "error" ? "Error" : "AI"}
                                {msg.cancelled && " (cancelled)"}
                              </Typography>
                              {msg.role === "user" ? (
                                <Typography sx={{ fontStyle: "inherit" }}>{msg.content}</Typography>
                              ) : (
                                <Markdown>{msg.content}</Markdown>
                              )}
                            </Box>
                          ))}
                          {isStreaming && streamingText === "" && (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.5 }}>
                              <CircularProgress size={16} />
                              <Typography variant="body2" color="text.secondary">
                                Waiting for response...
                              </Typography>
                            </Box>
                          )}
                          {isStreaming && streamingText !== "" && (
                            <Box sx={{ p: 1.5 }}>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                fontWeight="bold"
                                sx={{ mb: 0.5, display: "block" }}
                              >
                                AI
                              </Typography>
                              <Markdown>{streamingText}</Markdown>
                            </Box>
                          )}
                          <div ref={chatEndRef} />
                        </Box>
                      )}
                      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                        <TextField
                          autoFocus
                          fullWidth
                          size="small"
                          label="Ask a follow-up question..."
                          value={followUpText}
                          onChange={(e) => setFollowUpText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              sendFollowUp();
                            } else if (e.key === "Escape" && isStreaming) {
                              cancelFollowUp();
                            }
                          }}
                          multiline
                          maxRows={3}
                        />
                        {isStreaming && (
                          <Button
                            variant="outlined"
                            color="error"
                            onClick={cancelFollowUp}
                            sx={{ minWidth: "5rem", height: 40 }}
                          >
                            Stop
                          </Button>
                        )}
                        <Button
                          variant="contained"
                          onClick={sendFollowUp}
                          disabled={!followUpText.trim() || isStreaming}
                          sx={{ minWidth: "5rem", height: 40 }}
                        >
                          Ask
                        </Button>
                      </Box>
                    </Box>
                  )}
              </>
            )}
            {!isTranscriptError && transcriptText !== "" && transcriptText !== "Fetching transcript..." && (
              <Box sx={{ width: "100%", mt: 2, alignSelf: "flex-start" }}>
                <Button
                  variant="text"
                  onClick={() => {
                    const willExpand = !transcriptExpanded;
                    setTranscriptExpanded(willExpand);
                    if (willExpand) setScrollToTranscript(true);
                  }}
                  sx={{ textTransform: "none", gap: 1 }}
                >
                  <Typography fontWeight="medium">
                    {transcriptExpanded ? "▼ Hide" : "▶ Show"} Transcript
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    ({transcriptText.length.toLocaleString()} chars)
                  </Typography>
                </Button>
                {transcriptExpanded && (
                  <Box ref={transcriptContentRef} sx={{ mt: 1, pl: 1 }}>
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
