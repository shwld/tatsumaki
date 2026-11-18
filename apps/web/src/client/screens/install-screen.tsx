import { useTranslation } from "react-i18next";

const RELEASES_URL = "https://github.com/shwld/tatsumaki/releases";
const RELEASE_BASE = `${RELEASES_URL}/download/cli-v<version>`;

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-gray-900 px-3 py-2 text-xs text-gray-100">
      <code>{children}</code>
    </pre>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-sm font-medium text-blue-700 hover:text-blue-800"
    >
      {label}
    </a>
  );
}

export function InstallScreen() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4">
      <header>
        <h1 className="text-xl font-bold text-gray-900">
          {t("installScreen.title")}
        </h1>
        <p className="mt-1 text-sm text-gray-600">{t("installScreen.intro")}</p>
      </header>

      <section aria-labelledby="install-cli" className="space-y-3">
        <h2 id="install-cli" className="text-base font-semibold text-gray-900">
          {t("installScreen.cli.title")}
        </h2>
        <p className="text-sm text-gray-700">
          {t("installScreen.cli.platforms")}
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
          <li>{t("installScreen.cli.download")}</li>
          <li>{t("installScreen.cli.verify")}</li>
          <li>{t("installScreen.cli.install")}</li>
          <li>{t("installScreen.cli.configure")}</li>
        </ol>
        <Code>{`curl -LO ${RELEASE_BASE}/tm-aarch64-apple-darwin.tar.gz
curl -LO ${RELEASE_BASE}/sha256sums.txt
shasum -a 256 -c sha256sums.txt --ignore-missing
tar -xzf tm-aarch64-apple-darwin.tar.gz
install -m 755 tm /usr/local/bin/tm
tm config set base-url ${window.location.origin}
tm login
tm whoami
tm --version`}</Code>
        <p className="text-sm text-gray-700">
          {t("installScreen.cli.confirm")}
        </p>
        <div className="flex gap-4">
          <ExternalLink
            href={RELEASES_URL}
            label={t("installScreen.cli.releases")}
          />
          <ExternalLink
            href={t("installScreen.links.cliReadme")}
            label={t("installScreen.cli.detail")}
          />
        </div>
      </section>

      <section aria-labelledby="install-agent" className="space-y-3">
        <h2
          id="install-agent"
          className="text-base font-semibold text-gray-900"
        >
          {t("installScreen.agent.title")}
        </h2>
        <p className="text-sm text-gray-700">
          {t("installScreen.agent.intro")}
        </p>

        <h3 className="text-sm font-semibold text-gray-900">
          {t("installScreen.agent.codex.title")}
        </h3>
        <p className="text-sm text-gray-700">
          {t("installScreen.agent.codex.body")}
        </p>
        <Code>codex plugin marketplace add .</Code>

        <h3 className="text-sm font-semibold text-gray-900">
          {t("installScreen.agent.claude.title")}
        </h3>
        <p className="text-sm text-gray-700">
          {t("installScreen.agent.claude.body")}
        </p>
        <Code>
          claude --plugin-dir ./agent-integrations/claude/plugins/tatsumaki
        </Code>

        <h3 className="text-sm font-semibold text-gray-900">
          {t("installScreen.agent.cursor.title")}
        </h3>
        <p className="text-sm text-gray-700">
          {t("installScreen.agent.cursor.body")}
        </p>

        <ExternalLink
          href={t("installScreen.links.agentDocs")}
          label={t("installScreen.agent.detail")}
        />
      </section>
    </main>
  );
}
