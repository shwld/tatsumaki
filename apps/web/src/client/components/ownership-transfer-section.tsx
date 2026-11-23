import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthError } from "../contexts/auth-error-context";
import { useCurrentUser } from "../hooks/use-current-user";
import { useProjectMembers } from "../hooks/use-project-members";
import { isAuthError } from "../lib/api-error";
import { ProjectSection } from "./project-section";

type Transfer = {
  id: string;
  fromUserId: string;
  toUserId: string;
  expiresAt: string;
  role: "requester" | "recipient";
};

type LoadState =
  | { status: "loading" }
  | { status: "hidden" }
  | { status: "error" }
  | { status: "ready"; transfer: Transfer | null };

type ErrorKey =
  | "generic"
  | "noSubscription"
  | "alreadyPending"
  | "invalidRecipient"
  | "notPending";

const BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const ERROR_BY_CODE: Record<string, ErrorKey> = {
  no_subscription: "noSubscription",
  already_pending: "alreadyPending",
  invalid_recipient: "invalidRecipient",
  not_pending: "notPending",
};

/** 公式ホスト版の当事者(申請者・受け手)と、申請できる owner だけに表示する。 */
export function OwnershipTransferSection({
  projectId,
  isOwner,
}: {
  projectId: string;
  isOwner: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { notifySessionExpired } = useAuthError();
  const {
    members,
    isLoading: membersLoading,
    requestError: membersError,
  } = useProjectMembers(projectId);
  const { user } = useCurrentUser();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const base = `/api/billing/projects/${encodeURIComponent(projectId)}/ownership-transfer`;

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      setState({ status: "loading" });
      try {
        const entitlement = await fetch("/api/billing/entitlement");
        if (ignore) return;
        if (isAuthError(entitlement.status)) {
          notifySessionExpired();
          return;
        }
        if (!entitlement.ok) {
          setState({ status: "error" });
          return;
        }
        const mode = ((await entitlement.json()) as { mode?: string }).mode;
        if (mode !== "control-plane") {
          setState({ status: "hidden" });
          return;
        }
        const response = await fetch(base);
        if (ignore) return;
        if (isAuthError(response.status)) {
          notifySessionExpired();
          return;
        }
        if (!response.ok) {
          setState({ status: "error" });
          return;
        }
        const data = (await response.json()) as { transfer?: Transfer | null };
        setState({ status: "ready", transfer: data.transfer ?? null });
      } catch {
        if (!ignore) setState({ status: "error" });
      }
    };
    void run();
    return () => {
      ignore = true;
    };
  }, [base, notifySessionExpired, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  const send = async (path: string, body?: unknown): Promise<void> => {
    setBusy(true);
    setErrorKey(null);
    try {
      const response = await fetch(`${base}${path}`, {
        method: "POST",
        ...(body === undefined
          ? {}
          : {
              body: JSON.stringify(body),
              headers: { "content-type": "application/json" },
            }),
      });
      if (isAuthError(response.status)) {
        notifySessionExpired();
        return;
      }
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          code?: string;
        };
        setErrorKey(ERROR_BY_CODE[data.code ?? ""] ?? "generic");
        if (response.status === 409) reload();
        return;
      }
      setRecipient("");
      reload();
    } catch {
      setErrorKey("generic");
    } finally {
      setBusy(false);
    }
  };

  if (state.status === "hidden") return null;
  if (state.status === "ready" && !state.transfer && !isOwner && !errorKey) {
    return null;
  }

  const nameOf = (userId: string) =>
    members.find((member) => member.userId === userId)?.displayName ??
    t("ownershipTransferSection.unknownMember");
  const candidates = members.filter((member) => member.userId !== user?.id);

  return (
    <ProjectSection title={t("ownershipTransferSection.title")}>
      <div className="space-y-3 text-sm text-gray-700">
        {state.status === "loading" ? (
          <p>{t("ownershipTransferSection.loading")}</p>
        ) : state.status === "error" ? (
          <div className="space-y-2">
            <p role="alert" className="text-red-600">
              {t("ownershipTransferSection.error")}
            </p>
            <button type="button" className={BUTTON_CLASS} onClick={reload}>
              {t("ownershipTransferSection.retry")}
            </button>
          </div>
        ) : state.transfer ? (
          <div className="space-y-2">
            <p className="font-semibold text-gray-900">
              {state.transfer.role === "requester"
                ? t("ownershipTransferSection.requester.status", {
                    name: nameOf(state.transfer.toUserId),
                  })
                : t("ownershipTransferSection.recipient.status", {
                    name: nameOf(state.transfer.fromUserId),
                  })}
            </p>
            <p>
              {state.transfer.role === "requester"
                ? t("ownershipTransferSection.requester.next")
                : t("ownershipTransferSection.recipient.next")}
            </p>
            <p>
              {t("ownershipTransferSection.expiresAt", {
                date: new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: "medium",
                }).format(new Date(state.transfer.expiresAt)),
              })}
            </p>
            <button
              type="button"
              className={BUTTON_CLASS}
              disabled={busy}
              onClick={() =>
                void send(
                  state.transfer?.role === "requester" ? "/cancel" : "/decline",
                  { transferId: state.transfer?.id },
                )
              }
            >
              {state.transfer.role === "requester"
                ? t("ownershipTransferSection.requester.cancel")
                : t("ownershipTransferSection.recipient.decline")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p>{t("ownershipTransferSection.description")}</p>
            {membersLoading ? (
              <p>{t("ownershipTransferSection.loading")}</p>
            ) : membersError ? (
              <p role="alert" className="text-red-600">
                {t("ownershipTransferSection.error")}
              </p>
            ) : candidates.length === 0 ? (
              <p>{t("ownershipTransferSection.noCandidates")}</p>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (recipient) void send("", { toUserId: recipient });
                }}
              >
                <label className="block space-y-1">
                  <span className="font-semibold text-gray-900">
                    {t("ownershipTransferSection.recipientLabel")}
                  </span>
                  <select
                    className="block min-h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                  >
                    <option value="">
                      {t("ownershipTransferSection.recipientPlaceholder")}
                    </option>
                    {candidates.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName ?? member.userId}
                      </option>
                    ))}
                  </select>
                </label>
                <p>{t("ownershipTransferSection.confirmNotice")}</p>
                <button
                  type="submit"
                  className={BUTTON_CLASS}
                  disabled={busy || recipient === ""}
                >
                  {t("ownershipTransferSection.submit")}
                </button>
              </form>
            )}
          </div>
        )}
        {errorKey ? (
          <p role="alert" className="text-red-600">
            {t(`ownershipTransferSection.errors.${errorKey}`)}
          </p>
        ) : null}
      </div>
    </ProjectSection>
  );
}
