# 配車最適化アプリ

サッカーチームの試合会場への送迎について、全車の走行距離の合計が最小になる配車計画を作るアプリです。

- 仕様書：[docs/26W1004_spec.md](docs/26W1004_spec.md)
- 設計書：[docs/26W1004_design.md](docs/26W1004_design.md)

## 使い方（開発）

```bash
npm install
npm run dev      # http://localhost:5173 で起動
npm test         # テスト（T1〜T10）
npm run build    # dist/ に本番用ファイルを出力
```

初めて動かすときは「設定」→「サンプルデータを読み込む」で、架空のデータを使って試せます。

## 配信（GitHub Pages）

`main` ブランチにプッシュすると、GitHub Actions がテストとビルドを行い、GitHub Pages に配置します。
初回のみ、リポジトリの Settings → Pages → Source を「GitHub Actions」にしてください。

## 個人情報について

- データは利用者の端末（ブラウザの IndexedDB）だけに保存し、サーバーやこのリポジトリには置きません。
- 本物の名簿やバックアップファイルはコミットしないでください（`real_data/` フォルダや `*.local.csv` は `.gitignore` で除外しています）。
- `sample_data/` は架空の名前と町丁目までの住所です。
