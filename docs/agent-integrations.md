# Agent Integrations

## Purpose

tatsumaki を外部 agent から安全に使うための配布物と導入手順を定義する。

初版では `tm` CLI を公式操作面として使う。配布物は `tm` のコマンド集ではなく、agent が tatsumaki の story、project、work-item を扱うための操作ガイドである。

## Distribution Layout

| Target | Distribution unit | Path |
| --- | --- | --- |
| Codex | Plugin | `agent-integrations/codex/plugins/tatsumaki/` |
| Claude Code | Plugin | `agent-integrations/claude/plugins/tatsumaki/` |
| Cursor | Agent Skill | `agent-integrations/cursor/skills/tatsumaki/` |

`tatsumaki-agent-pack.tar.gz`、installer、`tm agent install` は初版では作らない。各配布物は単体で読めるように自己完結させる。重複 drift を防ぐため、skill 本文の source of truth は `agent-integrations/shared/skills/tatsumaki/SKILL.md` に置き、各配布先の `SKILL.md` は `bash scripts/sync-agent-integration-skills.sh` で同期する。

## Codex

Codex 用 plugin は次の構成で配布する。

```text
.agents/
└── plugins/
    └── marketplace.json
agent-integrations/
└── codex/
    └── plugins/
        └── tatsumaki/
            ├── .codex-plugin/
            │   └── plugin.json
            └── skills/
                └── tatsumaki/
                    └── SKILL.md
```

Codex の repo marketplace は `.agents/plugins/marketplace.json` に置く。plugin source は repository root からの相対 path として `./agent-integrations/codex/plugins/tatsumaki` を指す。

ローカル導入例:

```bash
codex plugin marketplace add .
```

## Claude Code

Claude Code 用 plugin は次の構成で配布する。

```text
.claude-plugin/
└── marketplace.json
agent-integrations/
└── claude/
    └── plugins/
        └── tatsumaki/
            ├── .claude-plugin/
            │   └── plugin.json
            └── skills/
                └── tatsumaki/
                    └── SKILL.md
```

開発中は plugin directory を直接読み込んで検証する。

```bash
claude --plugin-dir ./agent-integrations/claude/plugins/tatsumaki
```

配布時は `.claude-plugin/marketplace.json` を marketplace catalog として使う。marketplace 内の plugin source は repository root からの相対 path として `./agent-integrations/claude/plugins/tatsumaki` を指す。

## Cursor

Cursor は Agent Skills として配布する。

```text
agent-integrations/cursor/
└── skills/
    └── tatsumaki/
        └── SKILL.md
```

導入先では次のいずれかに `tatsumaki` skill directory を copy または symlink する。

- `.cursor/skills/tatsumaki/`
- `.agents/skills/tatsumaki/`
- `~/.cursor/skills/tatsumaki/`
- `~/.agents/skills/tatsumaki/`

Cursor rule は初版では作らない。tatsumaki の integration は常時適用 rule ではなく、story、project、work-item を扱うときに呼ばれる手順型 skill として扱う。

## Agent Operating Rules

各配布物は次の方針を直接含める。

- tatsumaki の作業対象は story、project、work-item。
- v1 の公式操作面は `tm` CLI。
- `tm --version`、`tm config show`、`tm --json whoami` で CLI、接続先、認証を確認する。
- 認証優先順位は `TATSUMAKI_TOKEN`、次に Keychain などの local credential store。
- sandboxed agent では Keychain 読み取りに追加権限が必要な場合がある。
- read は `--json` を優先し、write 操作はユーザー確認後に限定する。
- `gh issue view` など provider CLI の直叩きは tatsumaki work-item の正本操作として使わない。

## Maintenance

- skill 本文を変更するときは `agent-integrations/shared/skills/tatsumaki/SKILL.md` を更新する。
- 変更後は `bash scripts/sync-agent-integration-skills.sh` を実行して各配布物へ反映する。
- 配布物側の `SKILL.md` を直接編集しない。

## Sources

- [Codex plugin build docs](https://developers.openai.com/codex/plugins/build)
- [Codex plugins overview](https://help.openai.com/nl-nl/articles/20001256-plugins-in-codex)
- [Claude Code plugin docs](https://code.claude.com/docs/en/plugins)
- [Claude Code marketplace docs](https://code.claude.com/docs/en/plugin-marketplaces)
- [Claude Code discover plugins docs](https://code.claude.com/docs/en/discover-plugins)
- [Cursor 2.4 changelog](https://cursor.com/changelog/2-4)
- [Cursor Agent Skills docs](https://cursor.com/docs/context/skills)
