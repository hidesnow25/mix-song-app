# mix-song-app

2つの音声ファイルを左右チャンネルに割り当てて合成するフロントエンドのみの音声合成アプリ。

## 機能

- 2つの音声ファイルをドラッグ&ドロップ、またはクリックで選択して読み込み
- 「A:左 / B:右で再生」（ステレオ分離） / 「A・B両方を左右から再生」の2プリセットで再生パターンを切り替え
- プレビュー再生（書き出しと同一のレンダリング結果）
- WAV / MP3 を選んでダウンロード（デフォルトは入力ファイルの拡張子に合わせて自動選択）
- 処理中はプレビュー欄に控えめなローディング表示（画面全体はブロックしない）

すべてブラウザ内（Web Audio API）で完結し、サーバは不要です。

波形表示・ドラッグ範囲選択による無音化（パート分け編集）機能は一時的にUIから外していますが、`src/components/WaveformTrack.tsx` と `src/hooks/useMixEngine.ts` の `setRegions` にロジックは残してあり、将来UIに再度組み込めます。

## 開発

```bash
npm install
npm run dev      # 開発サーバ
npm test         # 音声処理コアロジックの単体テスト
npm run build    # 本番ビルド (dist/)
```

## アーキテクチャ

`src/audio/` 配下は `AudioBuffer`/`AudioContext`/`File` などのDOM型に依存しない、Float32Arrayとplainな型のみで完結した純粋関数群です（`silence.ts` / `mix.ts` / `wav.ts` / `mp3.ts` / `render.ts` / `format.ts`）。ブラウザ専用のファイル読み込み・デコード処理は `decode.ts` にのみ隔離されており、将来サーバサイド（Node.jsなど）へ移植する場合はこのファイルだけを差し替えれば残りのロジックはそのまま再利用できます。

## デプロイ

`main` ブランチへの push で GitHub Actions が自動的にビルドし、GitHub Pages に公開します（`.github/workflows/deploy.yml`）。
