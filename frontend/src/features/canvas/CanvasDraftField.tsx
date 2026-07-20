import { useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

type CommonProps = {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
};

type CanvasDraftInputProps = CommonProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className">;

type CanvasDraftTextareaProps = CommonProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "className">;

function useCanvasDraft(value: string, onCommit: (value: string) => void) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const composingRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current && !composingRef.current) {
      setDraft(value);
    }
  }, [value]);

  function commit(next: string) {
    setDraft(next);
    onCommit(next);
  }

  return {
    draft,
    fieldProps: {
      value: draft,
      onFocus: () => {
        focusedRef.current = true;
      },
      onBlur: () => {
        focusedRef.current = false;
        if (draft !== value) onCommit(draft);
      },
      onCompositionStart: () => {
        composingRef.current = true;
      },
      onCompositionEnd: (event: { currentTarget: { value: string } }) => {
        composingRef.current = false;
        commit(event.currentTarget.value);
      },
      onChange: (event: { currentTarget: { value: string } }) => {
        const next = event.currentTarget.value;
        setDraft(next);
        // Avoid rewriting React Flow node data mid-IME composition.
        if (!composingRef.current) onCommit(next);
      },
      // Keep Backspace/Delete/arrows from reaching React Flow shortcuts.
      onKeyDown: (event: { stopPropagation: () => void }) => {
        event.stopPropagation();
      },
      onKeyUp: (event: { stopPropagation: () => void }) => {
        event.stopPropagation();
      },
    },
  };
}

export function CanvasDraftInput({ value, onCommit, className = "", ...rest }: CanvasDraftInputProps) {
  const { fieldProps } = useCanvasDraft(value, onCommit);
  return (
    <input
      {...rest}
      {...fieldProps}
      className={`nodrag nopan nowheel ${className}`.trim()}
    />
  );
}

export function CanvasDraftTextarea({
  value,
  onCommit,
  className = "",
  ...rest
}: CanvasDraftTextareaProps) {
  const { fieldProps } = useCanvasDraft(value, onCommit);
  return (
    <textarea
      {...rest}
      {...fieldProps}
      className={`nodrag nopan nowheel ${className}`.trim()}
    />
  );
}
