import { FormEvent, useEffect, useState } from "react";
import { PermissionDenied } from "../components/permission-denied";
import { ProjectStoryBreadcrumb } from "../components/project-story-breadcrumb";
import { useAuthError } from "../contexts/auth-error-context";
import { isAuthError, isForbiddenError } from "../lib/api-error";
import { parseErrorMessage } from "../lib/parse-error-message";
import { projectApiKeysApiPath } from "../lib/story-routes";
import { useParams } from "react-router";

type ProjectApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
};

type ProjectApiKeysResponse = {
  apiKeys?: ProjectApiKey[];
};

type IssuedApiKeyResponse = {
  apiKey?: ProjectApiKey;
  rawKey?: string;
};

export function ProjectApiKeysScreen() {
  const { projectId } = useParams<{ projectId: string }>();
  const { notifySessionExpired } = useAuthError();
  const [apiKeys, setApiKeys] = useState<ProjectApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isIssuing, setIsIssuing] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const [issuedRawKey, setIssuedRawKey] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setIsLoading(false);
      setRequestError("プロジェクトIDがありません");
      return;
    }

    let ignore = false;

    const run = async () => {
      try {
        const response = await fetch(projectApiKeysApiPath(projectId));
        if (!response.ok) {
          if (!ignore && isAuthError(response.status)) {
            notifySessionExpired();
            return;
          }
          if (!ignore && isForbiddenError(response.status)) {
            setForbidden(await parseErrorMessage(response));
            return;
          }
          if (!ignore) {
            setRequestError(await parseErrorMessage(response));
          }
          return;
        }

        const data = (await response.json()) as ProjectApiKeysResponse;
        if (!ignore) {
          setApiKeys(Array.isArray(data.apiKeys) ? data.apiKeys : []);
        }
      } catch {
        if (!ignore) {
          setRequestError("APIキーの読み込みに失敗しました");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    run();
    return () => {
      ignore = true;
    };
  }, [projectId, notifySessionExpired]);

  const handleIssueApiKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || isIssuing) {
      return;
    }

    const trimmedName = newKeyName.trim();
    if (trimmedName.length === 0) {
      setRequestError("キー名は必須です");
      return;
    }

    setIsIssuing(true);
    setRequestError(null);
    setIssuedRawKey(null);

    try {
      const response = await fetch(projectApiKeysApiPath(projectId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          scopes: ["story:write"],
        }),
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
        setRequestError(await parseErrorMessage(response));
        return;
      }

      const data = (await response.json()) as IssuedApiKeyResponse;
      if (data.apiKey) {
        setApiKeys((current) => [data.apiKey as ProjectApiKey, ...current]);
      }
      setIssuedRawKey(data.rawKey ?? null);
      setNewKeyName("");
    } catch {
      setRequestError("APIキーの発行に失敗しました");
    } finally {
      setIsIssuing(false);
    }
  };

  const handleRevokeApiKey = async (keyId: string) => {
    if (!projectId || revokingKeyId) {
      return;
    }

    setRevokingKeyId(keyId);
    setRequestError(null);

    try {
      const response = await fetch(
        `${projectApiKeysApiPath(projectId)}/${encodeURIComponent(keyId)}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        if (isAuthError(response.status)) {
          notifySessionExpired();
          return;
        }
        if (isForbiddenError(response.status)) {
          setForbidden(await parseErrorMessage(response));
          return;
        }
        setRequestError(await parseErrorMessage(response));
        return;
      }

      setApiKeys((current) => current.filter((key) => key.id !== keyId));
    } catch {
      setRequestError("APIキーの失効に失敗しました");
    } finally {
      setRevokingKeyId(null);
    }
  };

  if (forbidden) {
    return <PermissionDenied message={forbidden} />;
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-lg bg-white p-6 shadow-sm">
        {projectId ? (
          <ProjectStoryBreadcrumb
            projectId={projectId}
            currentPageLabel="APIキー管理"
          />
        ) : null}
        <h1 className="mb-6 text-2xl font-bold text-gray-900">APIキー管理</h1>

        {isLoading ? (
          <p className="text-gray-600">APIキーを読み込み中...</p>
        ) : null}
        {requestError ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {requestError}
          </p>
        ) : null}

        {issuedRawKey ? (
          <section className="mb-6 rounded-md border border-yellow-300 bg-yellow-50 p-4">
            <h2 className="text-base font-semibold text-yellow-900">
              新しいAPIキーを発行しました
            </h2>
            <p className="mt-2 text-sm text-yellow-900">
              このキーは再表示できません。必ず今コピーして安全に保管してください。
            </p>
            <code className="mt-3 block break-all rounded bg-yellow-100 p-2 text-xs text-yellow-900">
              {issuedRawKey}
            </code>
          </section>
        ) : null}

        <section className="rounded-md border border-gray-200 p-4">
          <h2 className="text-base font-semibold text-gray-900">
            新しいキーを発行
          </h2>
          <form className="mt-3 flex gap-2" onSubmit={handleIssueApiKey}>
            <label className="sr-only" htmlFor="api-key-name">
              キー名
            </label>
            <input
              id="api-key-name"
              type="text"
              value={newKeyName}
              onChange={(event) => setNewKeyName(event.target.value)}
              placeholder="例: CLI Integration"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={isIssuing}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isIssuing ? "発行中..." : "発行"}
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-md border border-gray-200 p-4">
          <h2 className="text-base font-semibold text-gray-900">
            既存のAPIキー
          </h2>

          {!isLoading && apiKeys.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">
              APIキーはまだありません。
            </p>
          ) : null}

          {apiKeys.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {apiKeys.map((key) => (
                <li
                  key={key.id}
                  className="rounded-md border border-gray-200 p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{key.name}</p>
                      <p className="mt-1 text-gray-600">
                        prefix: {key.keyPrefix}
                      </p>
                      <p className="mt-1 text-gray-600">
                        scope: {key.scopes.join(", ")}
                      </p>
                      <p className="mt-1 text-gray-600">
                        作成日:{" "}
                        {new Date(key.createdAt).toLocaleString("ja-JP")}
                      </p>
                      <p className="mt-1 text-gray-600">
                        最終利用日:{" "}
                        {key.lastUsedAt
                          ? new Date(key.lastUsedAt).toLocaleString("ja-JP")
                          : "未使用"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevokeApiKey(key.id)}
                      disabled={revokingKeyId === key.id}
                      className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {revokingKeyId === key.id ? "失効中..." : "失効"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </main>
  );
}
