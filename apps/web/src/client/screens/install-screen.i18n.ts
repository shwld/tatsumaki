const cliReadme =
  "https://github.com/shwld/tatsumaki/blob/main/apps/cli/README.md";
const agentDocs =
  "https://github.com/shwld/tatsumaki/blob/main/docs/agent-integrations.md";

export const installScreenJa = {
  installScreen: {
    title: "インストール",
    intro:
      "tatsumaki の CLI (tm) と、agent から tatsumaki を操作するための連携を導入する方法です。",
    cli: {
      title: "CLI (tm)",
      platforms:
        "配布済みの対応環境: macOS (Apple Silicon / arm64)。その他の環境は README のビルド手順でソースからビルドしてください。",
      download:
        "GitHub Releases の最新の cli-v タグを確認し、TM_VERSION をそのバージョンに合わせて tm-aarch64-apple-darwin.tar.gz と sha256sums.txt を取得します。",
      verify: "チェックサムを検証してから展開します。",
      install:
        "展開した tm を ~/.local/bin に配置し、PATH に追加します (永続化はシェルの設定ファイルに追記してください)。",
      configure: "接続先を設定してからサインインし、ユーザーを確認します。",
      confirm:
        "確認: tm --version でバージョンが表示され、tm whoami でユーザーが表示されること。",
      releases: "GitHub Releases",
      detail: "CLI の詳細 (README)",
    },
    agent: {
      title: "Agent 連携",
      intro:
        "配布物は tm CLI を操作面とする手順ガイドです。リポジトリを取得したうえで、利用する agent ごとに導入します。",
      codex: {
        title: "Codex (Plugin)",
        body: "リポジトリのルートで次を実行して marketplace を追加します。配布物は agent-integrations/codex/plugins/tatsumaki/ にあります。",
      },
      claude: {
        title: "Claude Code (Plugin)",
        body: "開発中は次のコマンドで plugin ディレクトリを直接読み込みます。配布用 marketplace は .claude-plugin/marketplace.json です。",
      },
      cursor: {
        title: "Cursor (Agent Skill)",
        body: "Plugin ではなく Agent Skill として配布します。agent-integrations/cursor/skills/tatsumaki/ を .cursor/skills/ または ~/.cursor/skills/ にコピーまたは symlink します。",
      },
      detail: "Agent 連携の詳細",
    },
    links: { cliReadme, agentDocs },
  },
} as const;

export const installScreenEn = {
  installScreen: {
    title: "Install",
    intro:
      "How to install the tatsumaki CLI (tm) and the integrations that let agents operate tatsumaki.",
    cli: {
      title: "CLI (tm)",
      platforms:
        "Published build: macOS (Apple Silicon / arm64). On other platforms, build from source by following the README build steps.",
      download:
        "Check the latest cli-v tag on GitHub Releases, set TM_VERSION to that version, then download tm-aarch64-apple-darwin.tar.gz and sha256sums.txt.",
      verify: "Verify the checksum, then extract the archive.",
      install:
        "Place the extracted tm in ~/.local/bin and add it to your PATH (add the export to your shell profile to persist it).",
      configure: "Set the server URL, sign in, and confirm the user.",
      confirm:
        "Check: tm --version prints the version and tm whoami shows your user.",
      releases: "GitHub Releases",
      detail: "CLI details (README)",
    },
    agent: {
      title: "Agent integrations",
      intro:
        "The distributions are operating guides that use the tm CLI. Get the repository, then install the one for the agent you use.",
      codex: {
        title: "Codex (Plugin)",
        body: "Run this at the repository root to add the marketplace. The plugin lives in agent-integrations/codex/plugins/tatsumaki/.",
      },
      claude: {
        title: "Claude Code (Plugin)",
        body: "During development, load the plugin directory directly with this command. The distribution marketplace is .claude-plugin/marketplace.json.",
      },
      cursor: {
        title: "Cursor (Agent Skill)",
        body: "Distributed as an Agent Skill, not a plugin. Copy or symlink agent-integrations/cursor/skills/tatsumaki/ into .cursor/skills/ or ~/.cursor/skills/.",
      },
      detail: "Agent integration details",
    },
    links: { cliReadme, agentDocs },
  },
} as const;
