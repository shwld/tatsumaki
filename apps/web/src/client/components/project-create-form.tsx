import { type FormEvent, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { FieldErrors } from "../types/form";

type ProjectCreateFormProps = {
  name: string;
  fieldErrors: FieldErrors;
  requestError: string | null;
  isSubmitting: boolean;
  onNameChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ProjectCreateForm({
  name,
  fieldErrors,
  requestError,
  isSubmitting,
  onNameChange,
  onSubmit,
}: ProjectCreateFormProps) {
  const { t } = useTranslation();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameError = fieldErrors.name ?? null;
  const hasNameError = nameError !== null;

  useEffect(() => {
    if (hasNameError) {
      nameInputRef.current?.focus();
    }
  }, [hasNameError]);

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={onSubmit}
      aria-busy={isSubmitting}
    >
      <div>
        <label
          className="mb-1 block text-sm font-medium text-gray-700"
          htmlFor="projectName"
        >
          {t("projectCreateForm.name")}
        </label>
        <input
          ref={nameInputRef}
          id="projectName"
          className={`w-full rounded-md border px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 ${
            hasNameError
              ? "border-red-500 ring-red-500"
              : "border-gray-300 ring-blue-500"
          }`}
          name="projectName"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          aria-invalid={hasNameError ? "true" : "false"}
          aria-describedby={hasNameError ? "projectName-error" : undefined}
          disabled={isSubmitting}
        />
        {nameError ? (
          <p
            id="projectName-error"
            className="mt-1 text-sm text-red-600"
            role="alert"
          >
            {nameError}
          </p>
        ) : null}
      </div>

      {requestError ? (
        <p className="text-sm text-red-600" role="alert">
          {requestError}
        </p>
      ) : null}

      <button
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 sm:w-auto"
        type="submit"
        disabled={isSubmitting}
        aria-disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <span
              className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              aria-hidden="true"
            />
            <span>{t("projectCreateForm.creating")}</span>
          </>
        ) : (
          t("projectCreateForm.create")
        )}
      </button>
    </form>
  );
}
