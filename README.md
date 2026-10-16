# PS Game Base · 個人遊戲庫

本機優先的 PlayStation 遊戲庫管理頁。原生 HTML / CSS / JavaScript，無須安裝 npm 套件，不會自動上傳資料。

## 啟動

需要 Node.js 20 或以上。在 PowerShell 執行：

```powershell
cd D:\gitp\ps-game-base
npm start
```

開啟 http://127.0.0.1:4175 。請固定使用相同主機及連接埠，瀏覽器本機存檔依 origin 區分。不要直接雙擊 HTML（ES module、OAuth 與分頁回傳均需要 HTTP 來源）。靜態部署時以 `dist` 為網站根目錄即可。

## GitHub Pages 發布

發布設定檔為 `.github/workflows/deploy.yml`，沿用 EDF 專案的 Pages Actions 流程，直接將 `dist` 上傳發布，無須建置。

- 推送到 `main` 時自動發布；也可在 Actions 手動執行。手動選擇其他分支時會跳過部署。
- GitHub repo 的 Settings → Pages → Build and deployment → Source 須選擇 **GitHub Actions**。
- 此 repo 的預設 Pages 網址為 `https://promise82114.github.io/ps-game-base/`；實際發布網址以 Actions 的部署結果為準。
- 已在腳本中允許 `https://promise82114.github.io` 回傳來源。更新網站後，仍須重新安裝／更新 Tampermonkey 中的腳本至 0.2.1。
- Google OAuth Client 的「已授權 JavaScript 來源」須加入 `https://promise82114.github.io`（僅 origin，不含 `/ps-game-base/`）。此設定需由 Google Cloud 管理者操作。
- 本機與 Pages 的瀏覽器存檔分開；可透過完整 JSON 備份搬移。
- 與 EDF 相同，首頁設定 `<meta name="robots" content="noindex, nofollow">`，要求支援此規則的搜尋引擎不要收錄。這不是存取控制，知道公開網址的人仍可開啟網站；個人匯入資料不隨靜態網站發布。參考 [Google noindex 說明](https://developers.google.com/search/docs/crawling-indexing/block-indexing)。

本次只準備發布設定，不會自動推送遠端或變更 GitHub / Google Cloud 設定。

## 使用

1. 按「匯入 JSON」，選擇既有撈取腳本產生的 JSON，先看筆數與完整性，再確認匯入。
2. 點遊戲名稱編輯狀態、收藏、分類、標籤、評分與私人筆記。
3. 側欄可篩選收藏、遊玩中、待玩與自訂分類；手機版使用分類下拉選單。
4. 勾選遊戲或「選取此頁」，可跨頁保留選取，再批次變更狀態、加入分類、加入收藏。
5. 「資料與同步」可匯出遊戲 JSON、個人分類 JSON 或完整備份。清除瀏覽器資料、切換網址、換瀏覽器前先備份。

空庫提供示範模式；示範中的修改與匯入不寫入你的本機存檔，亦不能連接雲端。由「資料與同步 → 離開示範」返回。

## 分頁撈取更新

開發副本位於 `dist/scripts/ps-game-base.user.js`，版本 0.2.1，從 `D:\gitp\tampermonkey-scripts\ps-game-base\ps-game-base.user.js` 複製後獨立開發，原檔未修改。

1. 先在 Chrome / Edge 安裝 Tampermonkey。
2. 在頁面的「資料與同步」點「安裝 / 更新 Tampermonkey 腳本」，或將副本內容貼入 Tampermonkey 新腳本。
3. 回到管理頁按「更新遊戲庫」，保留管理頁開啟；官方遊戲庫會另開分頁。
4. 登入並選「已購買」。腳本在觀察到官方 `getPurchasedGameList` 查詢後，自動循序撈取，完成後回傳管理頁供預覽、確認匯入。
5. 若瀏覽器／官方登入跳轉使 opener 或網址片段失效，五分鐘後會提示。可在官方分頁開啟 PS Game Base 面板，手動同步、匯出 JSON 再匯入。

回傳限制來源為腳本內的 `MANAGER_ORIGINS`（允許本專案的 `http://127.0.0.1:4175`、`http://localhost:4175` 與 `https://promise82114.github.io`）。改埠或改用其他部署網址時，請將你信任的完整 origin 明確加入該清單，再更新已安裝的腳本。不可直接信任任意網址片段提供的來源，否則其他網站也可能開啟官方庫並接收資料。

管理頁同時核對官方 origin、它開啟的分頁物件與隨機 session；僅完整結果可自動回傳，部分結果需手動匯入。Bearer / Cookie 不會傳給管理頁、JSON 或 Drive；Bearer 只存在官方分頁閉包，Cookie 交由瀏覽器管理。切換 PSN 帳號前重新整理官方分頁。本版管理一個人的遊戲庫，未提供帳號隔離，不要混合匯入不同人的資料。

### 原始研究資料的差異

建立本專案時，原腳本檔案標示 0.1.1，但同目錄 README / 測試已記錄 0.1.3 的 `/recently-purchased`、URL-encoded POST 與無 Bearer 工作階段支援。新副本已補上這些行為，並沿用原有測試確認。這不代表新副本的跨分頁流程已經過 Sony 真實帳號驗收。

## 分類管理設計

| 行為 | 用途 |
| --- | --- |
| 遊玩狀態 | 未開始、想玩、遊玩中、已破關、已白金、暫停、不再遊玩 |
| 收藏 | 建立隨時想回來看的短名單 |
| 自訂分類，可複選 | 如週末雙人、劇情精選、親子同樂、挑戰清單；可新增、改名、刪除 |
| 自訂標籤 | 比分類更細的關鍵字，如短篇、控制器、需要攻略；以逗號分隔 |
| 個人評分 | 1–5 分；0 代表尚未評分 |
| 私人筆記 | 記錄進度、擱置原因與下一次目標 |
| 批次整理 | 跨頁選取後套用狀態、加入分類或收藏 |
| 篩選與排序 | 名稱／標籤／筆記搜尋、平台、來源、狀態、分類；名稱、評分與最近整理排序 |
| 同步差異 | 完整同步未出現的授權另外標示，保留遊戲與個人紀錄；部分同步不判定新缺少授權 |

不以名稱合併，因為不同版別、平台或授權可能同名。每張卡片代表 entitlement，不保證等於一個遊戲作品。未出現在同步中不等於已退款、訂閱過期或確定失去授權。來源 `NONE` 包含免費遊戲，不標為付費；沒有來源的項目單獨顯示未分類。

後續可再擴充「跨版本作品群組」、「本機實體遊戲紀錄」、「待玩優先順序／預計遊玩月份」及「智慧分類規則」。這些需要新的資料來源或操作規則，因此本版先保留原始授權粒度。

## JSON 與資料保護

瀏覽器使用單一 localStorage key `ps-game-base.v1` 儲存容器，裡面的 `library` 與 `personal` 分離；個人 JSON 可獨立匯入／匯出。

```json
{
  "schemaVersion": 1,
  "kind": "ps-game-base-personal",
  "categories": ["週末雙人"],
  "records": {
    "ENTITLEMENT_ID": {
      "status": "想玩",
      "favorite": true,
      "rating": 0,
      "categories": ["週末雙人"],
      "tags": ["合作"],
      "note": "和朋友一起玩",
      "updatedAt": "2026-10-16T00:00:00.000Z"
    }
  }
}
```

- 遊戲 JSON：`schemaVersion: 1`、`complete` 布林值、`games` 陣列；每筆必須有唯一的 `entitlementId` 和 `name`，其餘採白名單。
- 遊戲 JSON 匯入採 ID 合併；不存在於新完整資料的遊戲保留在庫內並標示，不刪除個人整理。一般遊戲匯出排除這些已標示缺少的歷史項目；完整備份保留它們。
- 個人 JSON 匯入採整份取代，不做難以判定意圖的自動合併。可先匯入分類、之後再匯入遊戲；暫無對應遊戲的紀錄仍會保留。
- 完整備份：`kind: ps-game-base-backup`，包含 `library`、`personal`、`missingIds` 和匯出時間。匯入遊戲仍採合併，個人資料整份取代；不是清空本機還原。
- 檔案限制 5 MB；格式錯誤不變更目前資料。分類／標籤每項上限 100 字，筆記上限 10,000 字。
- 寫入失敗會提示立即匯出。偵測其他分頁更新時暫停此頁寫入，避免舊分頁覆蓋新資料。
- 圖片只接受 HTTPS，文字以 textContent 顯示。圖片載入失敗顯示名稱縮寫；不額外擷取遊玩時數、價格或付款資料。

## Google Drive

沿用 EDF 專案的公開 OAuth Client ID，沒有 Client Secret。共用原有 `shared/google-auth.js` 與 `shared/drive-appdata.js` 的副本，使用獨立檔名 `ps-game-base.json`。

Google GIS Token Model 在使用者點擊後取得暫存 access token；Drive scope 僅 `drive.appdata`，備份位於應用程式隱藏資料夾。請確認此 OAuth Client 的「已授權 JavaScript 來源」含你使用的 origin（本機預設 `http://127.0.0.1:4175`）；同時啟用 Drive API，測試模式下帳號需在測試使用者中。這些 Google Cloud 設定並未由本專案自動變更。

操作為「載入授權服務 → 再次點擊連接 → 下載並預覽 → 決定匯入或上傳」。上傳前必須先讀取版本；檔案版本、ETag / If-Match 保護更新，衝突時停止。同名多份檔案也會停止。斷線只清除本分頁 token，不刪除雲端備份，亦不撤銷 Google 帳號的既有授權。

官方文件：[Token Model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)、[Drive appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata)。

## 驗證

```powershell
npm test
node --check dist/app.js
node --check dist/scripts/ps-game-base.user.js
```

29 項 Node 測試：原撈取測試、匯入白名單、重複 ID、個人資料格式、完整／部分結果、缺少項目保留、備份往返、原型特殊 key、分頁自動同步及回傳來源限制。測試資料全為合成資料，不含私人遊戲庫。

已用本機瀏覽器檢查示範庫、單筆編輯、標籤搜尋、批次分類與 390px 手機版；合成 JSON 的檔案選取、預覽及合併亦已實測（8 筆示範加 2 筆匯入，保留原分類，缺少的舊授權有標示）。Sony 真實帳號自動回傳、Google OAuth 與 Drive 實際讀寫仍需使用者登入驗收；本機與模擬測試不代表外部服務 E2E 成功。

## 來源與授權

撈取查詢與分頁原先參考 psn-mcp，Copyright (c) 2026 TMRP，MIT。保留副本中的來源註解與 `dist/scripts/LICENSE`。
