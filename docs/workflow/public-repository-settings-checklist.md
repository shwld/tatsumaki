# Public Repository Settings Checklist

公開用の履歴なし repository を作成した後に、GitHub 側で確認する運用 checklist。

## Default Branch Protection

- `main` に branch protection または ruleset を設定する
- Pull Request review を必須にする
- Required status checks に `CI / check`, release 関連 check, `Scorecard / OpenSSF Scorecard` を追加する
- Conversation resolution を必須にする
- Force push と branch deletion を許可しない
- 管理者 bypass を許可する場合も、通常運用では Pull Request を使う

## Security Features

- Private vulnerability reporting を有効化する
- Dependabot alerts と Dependabot security updates を有効化する
- Secret scanning と push protection を有効化する
- Code scanning alerts に OpenSSF Scorecard SARIF が届くことを確認する

## Repository Presentation

- Repository description に product category を入れる
- Topics に `project-management`, `scrum`, `agile`, `cloudflare-workers`, `typescript`, `rust` を設定する
- Website URL は hosted SaaS または documentation URL が決まってから設定する
- Sponsor button が `FUNDING.yml` から表示されることを確認する

## Community Profile

- GitHub Community profile checklist で README, LICENSE, Code of Conduct, Contributing, Security policy, Issue templates, Pull Request template が認識されることを確認する
- Issues を有効化する
- Discussions は user support を受け始める段階で有効化する

## Release And Secrets

- `desktop-release.yml` の Apple signing secrets は `desktop-release` GitHub Environment protection 配下に置く
  - Environment に required reviewers を設定する
  - Apple signing secrets は repository secrets ではなく `desktop-release` environment secrets として登録する
- Release tag pattern と tag protection/ruleset を設定する
- GitHub Actions の default `GITHUB_TOKEN` permissions は read-only を維持する
- Fork Pull Request から secret を使う workflow が起動しないことを確認する

## GitHub Actions Supply Chain

- Third-party actions は full-length commit SHA に pin する
- SHA の横に参照元 tag をコメントで残し、更新時は tag の実体 SHA を確認して差し替える
- Repository または Organization の Actions policy で full-length SHA pinning を要求する
