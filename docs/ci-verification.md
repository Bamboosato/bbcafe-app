# CI導入記録

## 実装

2026-10-06、[検討案](./ci-dependency-check-design.md)に沿い、`.github/workflows/ci.yml`へ次の独立ジョブを追加した。

| チェック名 | 内容 |
| --- | --- |
| Quality | Node 24、npm ci、lint、Next型生成、typecheck、全既存Vitest、build |
| Dependency security | 判定ポリシーテスト、本番／全依存の監査、失敗時を含むJSON保存 |
| Firebase SDK compatibility | Java 21、firebase-tools 15.32.1、専用Auth／Firestore Emulator、SDK通信 |

main向けPR、mainへのpush、workflow_dispatchで起動する。権限はcontents: read。同じrefの古い実行をキャンセルする。ジョブ内は順次実行し、本番の鍵・LINE／Gemini／Push資格情報を渡さない。監査JSONは14日、失敗時のEmulatorログは7日保存する。

Firebase 12.19.0への更新だけではgrpc 1.9.16が残ったため、`@firebase/firestore`配下に限定して`@grpc/grpc-js 1.14.5`をoverrideした。Admin SDKの依存系列は変更していない。Next ESLint設定はNext本体と同じ16.3.6へ合わせた。

## 監査と期限付き例外

本番依存は重大度にかかわらず1件でも失敗し、例外は適用しない。全依存は`security-audit-exception.json`のアドバイザリ・名前・バージョン・lockfileパス・dev-only区分がすべて一致した場合だけ許可する。別経路・別アドバイザリ・Critical・本番依存化・期限切れは失敗する。npm通信障害・不正JSON・件数不整合・不整合な終了コードも失敗とし、可能な範囲で報告を保存する。

現在の例外は[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)だけ。braces 3.0.3、micromatch 4.0.8、fast-glob 3.3.1、@next/eslint-plugin-next 16.3.6、eslint-config-next 16.3.6のdev経路を受け入れる。担当はBamboosato、有効期限は2026-11-05T00:00:00Z（JST 09:00）。期限の自動延長はしない。修正版の確認・依存更新・例外削除を優先し、継続が必要なら理由と新しい期限をレビューする。例外は最長30日。

`npm run audit:security`は`.security-audit/production.json`、`full.json`と各判定レポートを保存する。GitHubではDependency securityのログとsecurity-audit Artifactを確認する。監査成功は開発依存の指摘0件を意味しない。

## 検証観点と範囲

観点は検討案の機能・非機能・データ・UI／運用に従う。全既存単体は依存更新の影響が全体に及ぶため全件を選択する。監査判定は固定データ・固定時刻で正常／異常／境界／状態遷移を確認する。通信監査は別に実行する。

Firebaseスモークは毎回一意なユーザー・文書を作り、Auth作成・再ログイン・AdminによるIDトークン照合、Admin／Web Firestoreのwrite/read/deleteと相互参照を確認する。プロジェクトは`demo-bbcafe-security`固定、接続先はloopbackのみ、90秒の通信上限を設ける。本番rulesとアプリのサービスアカウント初期化は変更しない。この検査はSDK互換性であり、アプリの認可や本番環境の保証ではない。

E2Eは未導入・未実施。既存Playwright設定・ケースがなく、今回の変更は依存とCIのため、初回は単体・ビルド・Emulatorを選択した。クロスブラウザー、画面操作、実LINE／Gemini／Web Push、定時Cron、本番デプロイは対象外。

## ローカル再現

```powershell
npm ci
npm run lint
npm run typegen
npm run typecheck
npm test
npm run test:security
npm run audit:security
npm run build
npm run test:firebase
```

Node 24、Java 21以上とパッケージ／Emulator取得用ネットワークが必要。Emulator用の9099／8080番ポートを空け、同じEmulatorへの検査を並列に実行しない。CIと同じtypegen順序により、生成済み.nextだけへの依存を避ける。

## 検証結果

2026-10-06、Windows／Node 24.13.0／npm 11.6.2で確認した。

| 検証 | 結果 |
| --- | --- |
| npm ci | 成功。lockfileとoverrideの整合を確認 |
| lint・typegen・typecheck | 成功 |
| 既存Vitest | 20ファイル・124件成功 |
| 監査判定テスト | 9件成功。通信不能・終了コード不整合も含む |
| 本番監査 | 0件、例外なしで成功 |
| 全依存監査 | High 5件。指定したdev例外だけを許容して成功 |
| build | 成功 |
| Firebase Emulator（Windows） | 検査開始前にAndroid Studio付属Java 21のUnixDomainSockets.connectでInvalid argument。短いjava.io.tmpdirでも再現し、WindowsSelectorProvider指定でも起動失敗。SDK互換性の合否は未判定 |
| E2E・クロスブラウザー | 未実施。前述の範囲選定による |

最初のVitest・build・Node標準テストはsandboxの子プロセスspawn EPERMで失敗し、通常権限で再実行して成功した。実装の試験失敗とは区別する。GitHubでの起動・Ubuntu上のEmulator・Artifact保存は公開後に確認し、ローカルの成功から推定しない。

ブランチ保護の必須チェック設定、定期監査、E2E追加は今回の設定に含めない。
