import { useState } from "react";
import VoiceCapture from "./VoiceCapture.jsx";

export default function IntakeQuestion({
  question,
  index,
  total,
  speech,
  textValue,
  onTextValueChange,
  onAnswer,
  disabled,
}) {
  const [givingCustomAnswer, setGivingCustomAnswer] = useState(false);

  if (givingCustomAnswer) {
    return (
      <section className="intake-screen">
        <button type="button" className="text-action intake-back" onClick={() => setGivingCustomAnswer(false)}>
          Back to choices
        </button>
        <VoiceCapture
          key={`intake-${question.id}`}
          speech={speech}
          title="Tell me in your own words"
          description="A short answer is enough. Superflow will use it to shape what it builds."
          textValue={textValue}
          onTextValueChange={onTextValueChange}
          onSubmit={onAnswer}
          submitLabel="Continue"
          compact
          initialTyping
          disabled={disabled}
        />
      </section>
    );
  }

  return (
    <section className="intake-screen" aria-live="polite">
      <p className="quiet-label">A quick question · {index + 1} of {total}</p>
      <h1>{question.question}</h1>
      <p className="intake-copy">This helps Superflow make the app useful from the first screen.</p>
      <div className="intake-options">
        {question.options.map((option) => (
          <button
            type="button"
            className="intake-option"
            key={option}
            onClick={() => onAnswer(option)}
            disabled={disabled}
          >
            {option}
          </button>
        ))}
      </div>
      <button type="button" className="text-action intake-other" onClick={() => setGivingCustomAnswer(true)} disabled={disabled}>
        Something else
      </button>
    </section>
  );
}
