import { FormEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";

import { PermissionDenied } from "../components/permission-denied";
import { ProjectCreateForm } from "../components/project-create-form";
import { useAuthError } from "../contexts/auth-error-context";
import { isAuthError, isForbiddenError } from "../lib/api-error";
import { parseErrorMessage } from "../lib/parse-error-message";
import type { FieldErrors } from "../types/form";

export function ProjectCreateScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { notifySessionExpired } = useAuthError();
  const [name, setName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const retryRequestRef = useRef<null | (() => Promise<void>)>(null);
  const submitLockRef = useRef(false);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const [searchParams] = useSearchParams();
  const acquisitionCancelled = searchParams.get("acquisition") === "cancel";

  const handleNameChange = (value: string) => {
    idempotencyKeyRef.current = crypto.randomUUID();
    setName(value);
  };

  const startAcquisition = async (): Promise<void> => {
    const response = await fetch("/api/project-creation-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        idempotencyKey: idempotencyKeyRef.current,
      }),
    });
    if (!response.ok) {
      if (isAuthError(response.status)) {
        notifySessionExpired();
        return;
      }
      const errorMessage = await parseErrorMessage(response);
      if (response.status === 400) {
        setFieldErrors({ name: errorMessage });
        return;
      }
      setRequestError(errorMessage);
      return;
    }
    const data = (await response.json()) as {
      kind?: "redirect" | "ready";
      projectId?: string;
      url?: string;
    };
    if (data.kind === "redirect" && data.url) {
      window.location.assign(data.url);
      return;
    }
    if (data.kind === "ready" && data.projectId) {
      navigate(
        `/projects/new/complete?request=${encodeURIComponent(data.projectId)}`,
      );
      return;
    }
    setRequestError(t("projectCreateScreen.requestError"));
  };

  const submitProject = async () => {
    retryRequestRef.current = submitProject;
    if (submitLockRef.current) {
      return;
    }
    setFieldErrors({});
    setRequestError(null);

    if (!name.trim()) {
      setFieldErrors({
        name: t("projectCreateScreen.validation.nameRequired"),
      });
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        if (isAuthError(response.status)) {
          notifySessionExpired();
          return;
        }
        if (isForbiddenError(response.status)) {
          setForbidden(await parseErrorMessage(response));
          return;
        }
        if (response.status === 409) {
          const body = (await response
            .clone()
            .json()
            .catch(() => null)) as { code?: string } | null;
          if (body?.code === "acquisition_required") {
            await startAcquisition();
            return;
          }
        }
        const errorMessage = await parseErrorMessage(response);
        if (response.status === 400) {
          setFieldErrors({ name: errorMessage });
          return;
        }

        setRequestError(errorMessage);
        return;
      }

      navigate("/projects");
    } catch {
      setRequestError(t("projectCreateScreen.requestError"));
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitProject();
  };

  if (forbidden) {
    return (
      <PermissionDenied
        message={forbidden}
        nextAction={t("projectCreateScreen.permission.nextAction")}
        retryHint={t("projectCreateScreen.permission.retryHint")}
        onRetry={() => {
          setForbidden(null);
          void retryRequestRef.current?.();
        }}
        retryLabel={t("projectCreateScreen.permission.retry")}
        backTo="/projects"
      />
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto max-w-xl rounded-lg bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">
            {t("projectCreateScreen.title")}
          </h1>
          <Link className="text-sm font-medium text-blue-700" to="/projects">
            {t("projectCreateScreen.projects")}
          </Link>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          {t("projectCreateScreen.description")}
        </p>
        {acquisitionCancelled ? (
          <p className="mt-4 text-sm text-gray-700" role="status">
            {t("projectCreateScreen.acquisitionCancelled")}
          </p>
        ) : null}
        <ProjectCreateForm
          name={name}
          fieldErrors={fieldErrors}
          requestError={requestError}
          isSubmitting={isSubmitting}
          onNameChange={handleNameChange}
          onSubmit={handleSubmit}
        />
      </div>
    </main>
  );
}
