import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";

type AutoGrowSingleLineTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
  onEnterKey?: () => void | Promise<void>;
  onEscapeKey?: () => void;
};

export const AutoGrowSingleLineTextarea = forwardRef<
  HTMLTextAreaElement,
  AutoGrowSingleLineTextareaProps
>(function AutoGrowSingleLineTextarea(
  { value, onChange, onKeyDown, onEnterKey, onEscapeKey, rows = 1, ...props },
  ref,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  useImperativeHandle(ref, () => {
    if (innerRef.current === null) {
      throw new Error("AutoGrowSingleLineTextarea ref is not mounted");
    }
    return innerRef.current;
  }, []);

  useLayoutEffect(() => {
    const textarea = innerRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter") {
      const nativeEvent = event.nativeEvent as globalThis.KeyboardEvent;
      const isImeComposing = nativeEvent.isComposing || event.keyCode === 229;
      if (isImeComposing) {
        onKeyDown?.(event);
        return;
      }
      event.preventDefault();
      void onEnterKey?.();
    }
    if (event.key === "Escape") {
      onEscapeKey?.();
    }
    onKeyDown?.(event);
  };

  return (
    <textarea
      {...props}
      ref={innerRef}
      rows={rows}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\r?\n/g, " "))}
      onKeyDown={handleKeyDown}
    />
  );
});
