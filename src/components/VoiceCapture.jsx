import { useEffect, useState } from "react";
import { ArrowIcon, KeyboardIcon, MicrophoneIcon } from "./Icons.jsx";

export default function VoiceCapture({
  speech,
  title,
  description,
  textValue,
  onTextValueChange,
  onSubmit,
  submitLabel = "Continue",
  disabled = false,
  compact = false,
  initialTyping = false,
}) {
  const [typing, setTyping] = useState(initialTyping);
  const liveTranscript = speech.finalTranscript || speech.interimTranscript;

  useEffect(() => {
    if (speech.finalTranscript) onTextValueChange(speech.finalTranscript);
  }, [speech.finalTranscript, onTextValueChange]);

  const currentValue = (liveTranscript || textValue).trim();
  const voiceBusy = speech.requesting || speech.processing;

  const toggleListening = () => {
    if (disabled || voiceBusy) return;
    if (speech.listening) speech.stop();
    else speech.start();
  };

  const submit = (event) => {
    event?.preventDefault?.();
    if (!currentValue || disabled || voiceBusy) return;
    onSubmit(currentValue);
  };

  return (
    <section className={`voice-capture ${compact ? "compact" : ""}`}>
      <div className="voice-copy">
        <p className="quiet-label">Start with your voice</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      <div className={`voice-surface ${speech.listening ? "is-listening" : ""}`}>
        <div className="waveform" aria-hidden="true">
          {Array.from({ length: 17 }, (_, index) => (
            <span key={index} style={{ "--bar": index }} />
          ))}
        </div>
        <button
          type="button"
          className="voice-action"
          onClick={toggleListening}
          disabled={disabled || voiceBusy}
          aria-pressed={speech.listening}
          aria-busy={voiceBusy}
        >
          <span>
            {speech.requesting
              ? "Opening microphone…"
              : speech.processing
                ? "Transcribing…"
                : speech.listening
                  ? "Listening… Tap to finish"
                  : "Tap to speak"}
          </span>
          <span className="voice-action-icon"><MicrophoneIcon size={18} /></span>
        </button>
      </div>

      <div className="transcript" aria-live="polite">
        {liveTranscript ? (
          <p>{liveTranscript}</p>
        ) : (
          <p className="transcript-placeholder">
            {speech.processing
              ? "Turning your recording into words…"
              : speech.listening && speech.mode === "recorded"
                ? "Speak naturally, then tap to finish."
                : speech.supported
                  ? "Your words will appear here."
              : "Voice input is unavailable in this browser."}
          </p>
        )}
      </div>

      {speech.error && <p className="inline-error" role="alert">{speech.error.message}</p>}

      {typing ? (
        <form className="typed-fallback" onSubmit={submit}>
          <label htmlFor="typed-request">Type your request</label>
          <textarea
            id="typed-request"
            value={textValue}
            onChange={(event) => onTextValueChange(event.target.value)}
            rows={compact ? 2 : 3}
            placeholder="Describe it in your own words"
            disabled={disabled}
          />
          <button type="submit" className="primary-action" disabled={!currentValue || disabled || voiceBusy}>
            <span>{submitLabel}</span>
            <ArrowIcon size={18} />
          </button>
        </form>
      ) : (
        <div className="voice-secondary-actions">
          <button
            type="button"
            className="text-action"
            onClick={() => setTyping(true)}
            disabled={disabled || voiceBusy}
          >
            <KeyboardIcon size={17} />
            Type instead
          </button>
          {currentValue && !speech.listening && !voiceBusy && (
            <button type="button" className="primary-action compact" onClick={submit} disabled={disabled}>
              <span>{submitLabel}</span>
              <ArrowIcon size={18} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
