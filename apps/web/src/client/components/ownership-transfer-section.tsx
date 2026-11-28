import { useCallback, useEffect, useRef, useState } from "react";
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
  state: "pending" | "completed";
  acquisition?: "available" | "disabled";
};

type LoadState =
  | { status: "loading" }
  | { status: "hidden" }
  | { status: "error" }
  | { status: "ready"; transfer: Transfer | null };

type ErrorKey =
  | "generic"
  | "alreadyPending"
  | "invalidRecipient"
  | "notPending"
  | "checkoutDisabled"
  | "projectDeleting";

const BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const ERROR_BY_CODE: Record<string, ErrorKey> = {
  already_pending: "alreadyPending",
  invalid_recipient: "invalidRecipient",
  not_pending: "notPending",
  checkout_disabled: "checkoutDisabled",
  project_deleting: "projectDeleting",
};

const RETURN_POLL_INTERVAL_MS = 3000;
const RETURN_POLL_MAX_ATTEMPTS = 10;

/** 公式ホスト版の当事者(申請者・受け手)と、申請できる owner だけに表示する。 */
export function OwnershipTransferSection({
  projectId,
  isOwner,
  onOwnershipSwitched,
}: {
  projectId: string;
  isOwner: boolean;
  /** 所有者が切り替わったことをこの画面で初めて確認したとき。権限に依存する表示を取り直させる。 */
  onOwnershipSwitched?: () => void;
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
      // 背景の取り直しでは表示中の内容とフォーカスを保つ。
      setState((previous) =>
        previous.status === "ready" ? previous : { status: "loading" },
      );
      try {
        const entitlement = await fetch("/api/billing/entitlement");
        if (ignore) return;
        if (isAuthError(entitlement.status)) {
          notifySessionExpired();
          return;
        }
        if (!entitlement.ok) {
          setState((previous) =>
            previous.status === "ready" ? previous : { status: "error" },
          );
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
          setState((previous) =>
            previous.status === "ready" ? previous : { status: "error" },
          );
          return;
        }
        const data = (await response.json()) as { transfer?: Transfer | null };
        setState({ status: "ready", transfer: data.transfer ?? null });
      } catch {
        if (!ignore)
          setState((previous) =>
            previous.status === "ready" ? previous : { status: "error" },
          );
      }
    };
    void run();
    return () => {
      ignore = true;
    };
  }, [base, notifySessionExpired, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  const transferState = state.status === "ready" ? state.transfer : null;
  const notifiedTransferId = useRef<string | null>(null);
  useEffect(() => {
    if (
      !transferState ||
      transferState.state === "pending" ||
      notifiedTransferId.current === transferState.id
    ) {
      return;
    }
    const roleIsStale =
      (transferState.role === "recipient" && !isOwner) ||
      (transferState.role === "requester" && isOwner);
    if (!roleIsStale) return;
    notifiedTransferId.current = transferState.id;
    onOwnershipSwitched?.();
  }, [transferState, isOwner, onOwnershipSwitched]);

  // 受け手の手続きの完了を、画面に戻った後も確認する。
  const awaitingTransfer =
    state.status === "ready" &&
    state.transfer?.state === "pending" &&
    state.transfer.role === "recipient";
  const pollsLeft = useRef(RETURN_POLL_MAX_ATTEMPTS);
  useEffect(() => {
    if (!awaitingTransfer || pollsLeft.current <= 0) return;
    const timer = window.setTimeout(() => {
      pollsLeft.current -= 1;
      reload();
    }, RETURN_POLL_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [awaitingTransfer, attempt, reload]);
  // 別タブから戻ったときにも確認する。
  useEffect(() => {
    if (!awaitingTransfer) return;
    const revalidate = () => {
      pollsLeft.current = RETURN_POLL_MAX_ATTEMPTS;
      reload();
    };
    window.addEventListener("focus", revalidate);
    window.addEventListener("pageshow", revalidate);
    return () => {
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("pageshow", revalidate);
    };
  }, [awaitingTransfer, reload]);

  const startCheckout = async (transferId: string): Promise<void> => {
    setBusy(true);
    setErrorKey(null);
    try {
      const response = await fetch(`${base}/checkout`, {
        method: "POST",
        body: JSON.stringify({ transferId }),
        headers: { "content-type": "application/json" },
      });
      if (isAuthError(response.status)) {
        notifySessionExpired();
        return;
      }
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        code?: string;
      };
      if (!response.ok || !data.url) {
        setErrorKey(ERROR_BY_CODE[data.code ?? ""] ?? "generic");
        if (response.status === 409) reload();
        return;
      }
      window.location.assign(data.url);
    } catch {
      setErrorKey("generic");
    } finally {
      setBusy(false);
    }
  };

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
        ) : state.transfer && state.transfer.state === "pending" ? (
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
              {t(
                state.transfer.role === "requester"
                  ? "ownershipTransferSection.requester.next"
                  : "ownershipTransferSection.recipient.next",
              )}
            </p>
            {state.transfer.role === "recipient" &&
            state.transfer.acquisition === "available" ? (
              <button
                type="button"
                className={BUTTON_CLASS}
                disabled={busy}
                onClick={() => void startCheckout(state.transfer?.id ?? "")}
              >
                {t("ownershipTransferSection.recipient.subscribe")}
              </button>
            ) : null}
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
            {state.transfer ? (
              <div className="space-y-2">
                <p className="font-semibold text-gray-900">
                  {t(
                    `ownershipTransferSection.completed.${state.transfer.role}`,
                    {
                      name: nameOf(
                        state.transfer.role === "requester"
                          ? state.transfer.toUserId
                          : state.transfer.fromUserId,
                      ),
                    },
                  )}
                </p>
              </div>
            ) : null}
            {state.transfer && !isOwner ? null : (
              <p>{t("ownershipTransferSection.description")}</p>
            )}
            {state.transfer && !isOwner ? null : membersLoading ? (
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
