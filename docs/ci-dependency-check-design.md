# GitHub Actions・依存関係検査 導入検討

## 1. 結論と対象

`tennis-organizing-app`のCIを参考に、bbcafe-appへ「基本検証、本番／全依存の監査、監査ポリシーのテスト、監査JSONの保存、隔離したFirebase SDK互換性確認」を導入する案を推奨する。Playwright E2Eは現在のbbcafe-appに設定・ケースがないため、初回導入には含めず、対象ケースを設計した後に追加する。

本書は導入前に作成した検討案と調査基準の記録。2026-10-06に実装へ進み、ワークフロー・監査スクリプト・依存修正・限定dev例外を追加した。現行の実装・検証結果は[CI導入記録](./ci-verification.md)を参照する。以下の「最新main」「未実施」は検討時点の状態を示す。

| 項目 | 確認内容 |
| --- | --- |
| 確認日 | 2026-10-06（JST） |
| 参照CI | [tennis-organizing-appのci.yml](https://github.com/Bamboosato/tennis-organizing-app/blob/main/.github/workflows/ci.yml) |
| ローカルHEAD | `6bedc6abec09cf4ce0b413a5e267be0d18d6dd37` |
| 取得した最新origin/main | `91d435d5922974bbd1c3f4a56752df57f6ec45fd` |
| 差分 | package.jsonとpackage-lock.jsonのみ。ローカルに未コミット文書があるためcheckout・mergeはしていない |
| 監査基準 | 最新origin/mainのpackage.jsonとlockfileを隔離した分析用ディレクトリへ展開してnpm auditを実行。インストール・自動修正なし |
| Node | ローカル確認環境Node 24.13.0／npm 11.6.2。参照CIもNode 24 |

## 2. 現状と導入前の課題

bbcafe-appには独自の`.github/workflows`、監査スクリプト、Playwright設定がない。既存のnpm scriptsはlint、typecheck、Vitest、buildを持ち、単体テストは20ファイル。Firebase・LINE・Gemini等の本番接続を必要としないテストと、SDKの実互換性確認は分ける必要がある。

最新origin/mainにはNext.js 16.3.6、Vitest 5.0.3等の更新が入っているが、2026-10-06の監査結果は以下だった。

| 対象 | コマンド | 結果 |
| --- | --- | --- |
| 本番依存 | `npm audit --json --omit=dev` | exit 1、High 4、Critical 0、計4 |
| 全依存 | `npm audit --json` | exit 1、High 9、Critical 0、計9 |

これは親パッケージへ伝播した指摘も含むnpm auditの件数で、独立した脆弱性9種類や本番での悪用可能性を示す数ではない。監査結果はアドバイザリ更新で変わるため、実装時に同じ基準コミットで再確認する。

### 2.1 本番依存：先に修正が必要

指摘は`@grpc/grpc-js`、その依存元の`@firebase/firestore`／`@firebase/firestore-compat`／`firebase`へ伝播している。

最新lockfileにはルートの`@grpc/grpc-js 1.14.5`とは別に、`node_modules/@firebase/firestore/node_modules/@grpc/grpc-js 1.9.16`が残る。Firestore側の要求は`~1.9.0`で、ルートだけを更新しても置き換わらない。対象アドバイザリの修正系列は1.13.6または1.14.5である。[GitHub Advisory](https://github.com/advisories/GHSA-m9gg-hp2v-232j)

通常のFirebase更新で解消可能かを確認し、解消しなければネストした依存にも効く限定的なoverrideを検討する。後者はFirestoreが要求する系列を越えるため、監査が通ることと実際のSDK互換性を別に確認する。npm auditが提示するFirebase旧メジャーへの変更を、そのまま適用する方針にはしない。

本番依存を例外で通す案は採用しない。strictな監査を有効にしただけでは現在のmainは失敗するため、依存経路の修正と検証を同じ導入作業で扱う。

### 2.2 開発依存：例外を使う場合の条件

残る開発側の指摘は`braces`からmicromatch、fast-glob、Next ESLint設定への経路。2026-10-06の公式アドバイザリには修正版なしと記載されている。[GitHub Advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)

参照プロジェクトの例外JSONは丸ごと流用しない。bbcafe-appの実バージョンは次のとおりで、Next ESLint設定は参照先と異なる。

| 開発依存 | 最新mainのバージョン |
| --- | --- |
| braces | 3.0.3 |
| micromatch | 4.0.8 |
| fast-glob | 3.3.1 |
| @next/eslint-plugin-next | 16.2.6 |
| eslint-config-next | 16.2.6 |

例外を導入する場合は、アドバイザリ`GHSA-vfj7-8cjw-p6xm`、上記バージョン、lockfile上のパス、dev-onlyであること、担当、理由、UTCの有効期限を固定する。最長30日の期限を初期案とし、期限切れ・別アドバイザリ追加・本番依存化・Critical化・想定外の依存パスはCI失敗とする。例外採用は未実施。

## 3. 推奨構成

| 検査 | 初回導入案 | 理由・調整 |
| --- | --- | --- |
| トリガー | main向けpull_request、mainへのpush、手動workflow_dispatch | 変更と統合後の状態を同じ基準で確認する |
| 実行環境 | ubuntu-latest、Node 24、npmキャッシュ | 参照CIと合わせ、Windowsローカルの成功だけに依存しない |
| 権限 | contents: readを基本とする | 通常検査にリポジトリ書込みは不要 |
| インストール | npm ci | package.jsonとlockfileの不一致を検出し、CI内でlockfileを更新しない |
| 品質 | lint、Next型生成、typecheck、全既存Vitest、build | 依存更新の影響がアプリ全体へ及ぶため、既存単体テストは全件を選ぶ |
| 監査ポリシー | Node標準テストによる判定ロジックのテスト | 例外判定の広がりや監査レスポンス異常の見逃しを防ぐ |
| 本番監査 | npm audit --json --omit=dev | 重大度を問わず指摘があれば失敗。例外なし |
| 全体監査 | npm audit --json | 事前に定義した限定的なdev例外以外は失敗 |
| 証跡 | production.json／full.jsonをalwaysでArtifact保存 | 監査失敗でも比較・原因切り分けを可能にする |
| SDK互換性 | Firebase Auth／Firestore Emulatorの独立ジョブ | overrideやSDK更新で実通信が壊れていないか確認する |
| E2E | 初回は未導入 | 現在Playwright設定・テストがない。既存CIのコマンドだけをコピーすると失敗する |

監査と基本検証を独立ジョブにし、監査失敗でもlint・テスト・buildの結果を取得する。Firebase互換性ジョブも独立させて、監査検出とSDKの実行障害を区別する。

`next-env.d.ts`は`.next/types/routes.d.ts`を参照している。クリーンcheckoutでtypecheckを実行する前に`npx --no-install next typegen`で生成する案とする。ローカルに既存の.nextがある状態の成功だけでは確認しない。

通常のCIへ本番Firebase鍵・LINE Token・Gemini鍵・VAPID秘密鍵を渡さない。公開Firebase設定にはテスト用の値を設定し、外部通信を行う単体テストはモックする。実LINE送信や本番CronをCIから起動しない。

### 3.1 Firebase互換性確認

参照先と同じAuth／Firestore Emulatorを、`demo-bbcafe-security`のような専用デモプロジェクトで起動する。Node・Java・firebase-toolsの検証したバージョンを固定し、起動・通信にタイムアウトを設ける。

専用スクリプトでテストユーザー作成・ログイン、Web AuthのIDトークンとAdmin SDKの照合、Admin Firestoreのwrite/read/deleteを行い、必要ならWeb Firestoreのwrite/read/deleteも追加して、今回問題になったネストしたSDK経路を明示的に通す。Web Firestore用にはEmulator専用のテストルールを使い、本番の直読み拒否ルールは変更しない。

現行`src/lib/server/firebase.ts`はサービスアカウントcertを要求するため、そのままエミュレーターへ向ければ動くとは扱わない。互換性用スクリプトは独立したSDK初期化を行う。これでアプリの認可や本番設定を検証したことにはしない。

### 3.2 E2Eの後続範囲

追加するなら、未ログインの8画面、旧ログイン拒否、通知非対応時の表示、エミュレーターを使ったログイン・アカウント分離・設定保存から対象を選ぶ。LINEやGeminiはモックする。まずChromiumの対象ケースをworkers=1で実行し、OS・ブラウザ差が問題になる範囲だけ別途拡張する。

## 4. 想定する実装ファイル

| ファイル | 用途 |
| --- | --- |
| `.github/workflows/ci.yml` | 基本検証・監査・SDK互換性ジョブ |
| `scripts/security-audit.mjs` | 2種類の監査、JSON保存、判定 |
| `scripts/security-audit-policy.mjs` | アドバイザリ・期限・依存種別・バージョンに基づく判定 |
| `scripts/security-audit-policy.test.mjs` | 判定ロジックの単体テスト |
| `security-audit-exception.json` | dev例外を採用する場合の限定条件 |
| `scripts/firebase-security-smoke.mjs` | SDK通信の互換性確認 |
| `scripts/firebase-smoke.config.json`／専用rules | 隔離したEmulator設定 |
| `package.json`／`package-lock.json` | scripts追加と必要な依存修正 |
| `.gitignore` | .security-audit等の生成物除外 |
| README・Preview手順 | CI検査とローカル再現手順 |

これらは作成予定の一覧で、実装済みファイルではない。

## 5. テスト観点

詳細ケースの前に、次を確認する。

| 観点 | 意図 |
| --- | --- |
| 機能 | CI起動、監査2種、失敗判定、JSON保存、基本検証、SDK通信が連動する |
| 非機能 | npm障害・タイムアウト・Ubuntu／Windows差・同時実行・外部サービス隔離を扱う |
| データ | lockfile、dev／production区分、依存経路、GHSA、期限・バージョンを固定する |
| UI・運用 | PRチェック名・失敗理由・Artifactから担当者が原因を切り分けられる |

### 確認ケース

前提：監査判定テストは固定JSONと固定現在時刻を使う。npmへの実通信試験とモック判定試験を分離し、Emulatorは実行ごとに初期化する。秘密値を証跡へ出さない。

| 区分 | 前提・操作 | 検証意図 |
| --- | --- | --- |
| 正常系 | 本番0件、全体0件、または有効な限定dev例外だけ | 正常な監査を通し、JSONと判定理由を残す |
| 正常系 | npm ciから全既存単体・build、Emulator通信 | lockfileの実インストールとSDK互換性を確認する |
| 異常系 | 本番に1指摘、別GHSA、Critical、例外パッケージの本番依存化 | 例外が誤って広がらずCI失敗になる |
| 異常系 | npm監査の通信失敗・タイムアウト・不正JSON・件数不一致 | 監査不能を0件として通さない。可能な範囲で失敗レポートを保存する |
| 境界値 | 例外期限の直前・ちょうど・直後、指摘0／1件 | 期限は現在時刻が期限未満の場合のみ許容する |
| 境界値 | 同名別バージョン、ネストした同名依存、重複・循環したvia | パッケージ名だけの除外や依存経路の見落としを防ぐ |
| 状態遷移 | 脆弱なネスト依存→修正→監査→Emulator | ルート更新だけの見かけの解消を防ぎ、互換性も確認する |
| 状態遷移 | dev例外適用→期限切れ／新規脆弱性追加 | 以前成功したCIが適切に失敗へ変わる |
| 実行順序 | .nextなしのcheckout→typegen→typecheck、通し実行 | ローカルの生成済みファイルへの依存と通しだけの失敗を検出する |

実機・同一LINEアカウントへの送信スクリプトは並列実行しない。CI内の隔離された純粋単体テストは並列化できるが、ブラウザや共有Emulatorを使う試験は状態を共有しないようにする。

## 6. 導入順と運用

1. 最新mainを作業の基準へ取り込み、未コミット文書を保持したまま依存差分を確認する。
2. Firebase配下のgrpcを修正する方法を選び、本番監査0件とSDK互換性を確認する。
3. 修正版未公開の開発依存について、限定例外を採用するか決める。参照先のバージョンをコピーしない。
4. CI・監査スクリプト・判定テスト・Artifact保存・Firebase互換性ジョブを追加する。
5. クリーンインストールでlint・型・全既存単体・buildを実行し、GitHub上の実行結果も確認する。
6. GitHubのブランチ保護で各CIジョブを必須チェックにする場合は、リポジトリ設定として別途適用する。workflowを追加するだけではマージ制限にならない。

PRでの検査に加え、定期監査を後続で追加する案も有効。依存を変更しない日でもアドバイザリが追加されるため。初回はPR／pushの動作を確認し、必要なら毎週1回の再監査と報告方法を決める。Dependabotは更新提案、CIは合否判定として併用する。

## 7. 今回の確認範囲

最新mainの依存・ネスト経路・既存テスト構成と2種類の実監査、参照CI、公式アドバイザリを確認した。CI導入、依存修正、例外の有効化、Emulator実行、全件単体、E2E、GitHub公開は未実施。前の文書監査の83テスト成功は更新前依存の結果であり、最新Next／Vitestの互換性確認に流用しない。
