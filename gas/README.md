# gas

このフォルダはGoogle Apps Scriptの実運用コードです。

## 配置ファイル
- Code.gs: WebアプリAPI本体
- appsscript.json: GASマニフェスト

## シート構成
- 商品マスター
- 商品振り分け
- 棚卸データ

`Code.gs` は初回実行時にヘッダーを自動作成します。

## デプロイ手順
1. スプレッドシートを作成し、Apps Scriptを開く
2. `gas/Code.gs` と `gas/appsscript.json` を反映
3. 「デプロイ > 新しいデプロイ > ウェブアプリ」で公開
4. 発行されたURLを控える

## フロント設定
ブラウザコンソールで以下を1回実行します。

```javascript
localStorage.setItem("inventory-app-use-gas", "1");
localStorage.setItem("inventory-app-gas-endpoint", "YOUR_GAS_WEB_APP_URL");
location.reload();
```

ローカルに戻す場合:

```javascript
localStorage.setItem("inventory-app-use-gas", "0");
localStorage.removeItem("inventory-app-gas-endpoint");
location.reload();
```
