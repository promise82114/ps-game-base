# 換機交接與執行進度

更新日期：2026-10-17（Asia/Taipei）。本文件是交接快照；接手先讀 [AGENTS.md](../AGENTS.md)，再核對 Git 與實際檔案。使用操作及資料格式詳見 [README](../README.md)，獎盃測試細節見 [trophy-probe.md](trophy-probe.md)。

## 先看這裡

- 遊戲庫、分類、版本合併、JSON／Drive 差異比較已有實作；程式直接位於 `dist/`，沒有建置步驟。
- 獎盃仍是獨立小範圍研究。已能攔截數位庫清單、取得 Sony 登入工作階段，但瀏覽器取得授權碼失敗，**尚未取得任何真實獎盃結果**。
- 最新 probe 為 **0.1.5**，新增本機授權助手，**待 Chrome 真實帳號測試**。不要把模擬測試或 Sony 工作階段 HTTP 200 當成獎盃查詢成功。
- **獎盃腳本、助手、對應測試及說明隨本次交接提交納入版本管理。** 新電腦取得本次提交後即可接續；最新 hash 請以 `git log -1` 核對。
- 更換電腦還需要另行搬移個人 JSON；Git 不包含瀏覽器存檔、Chrome／Sony 登入狀態或已安裝的 Tampermonkey 版本。

## Git 快照

| 項目 | 交接時狀態 |
| --- | --- |
| 本機 repo | `D:\gitp\ps-game-base` |
| 分支 | `main` |
| 交接提交前的基準 HEAD | `91fa0258db995814c8a75c23fb2d6d39a5738038` |
| 基準提交 | `fix: 修正 Google Drive 同步版本保護資訊取得` |
| origin | `https://github.com/promise82114/ps-game-base.git` |
| 遠端／部署 | 本次已獲授權提交並推送 main；是否完成以 Git 遠端核對及操作回報為準，部署另看 Actions |

近期已提交的里程碑：

| Commit | 內容 |
| --- | --- |
| `91fa025` | Drive 版本保護修正：v2 metadata JSON 取得 ETag、v2 PUT／If-Match 更新；v3 查詢、下載與首次建立 |
| `dfe0402` | JSON／Drive 差異預覽、合併與保留本機進度、操作訊息及復原備份 |
| `cce9ef8` | 再次點擊已選快捷分類可取消 |
| `60ee60d` | 沒有 conceptId 時依 productId 合併版本 |
| `00c2f69` | 圖片快捷分類、移除收藏介面 |
| `74fda8f` | 自動合併版本、簡化個人分類與移除評分 UI |
| `863e7b8` | 正式腳本混合參數解析與失敗診斷 |
| `85deeed` | 禁止搜尋收錄的頁面設定 |
| `fc9d26b` | main 分支 GitHub Pages 發布設定 |

本次交接提交包含以下內容；這些是研究及開發所需檔案，不是可清除的暫存檔：

| 路徑 | 狀態／用途 |
| --- | --- |
| `README.md` | 已修改：獎盃說明、驗證資訊及交接入口 |
| `AGENTS.md` | 新增：協作、產品約束、commit 與安全規則 |
| `docs/HANDOFF.md` | 新增：本交接快照 |
| `docs/trophy-probe.md` | 新增：獎盃測試操作、診斷與版本進度 |
| `dist/scripts/ps-game-base-trophy-probe.user.js` | 新增：v0.1.5 獎盃研究腳本 |
| `tools/trophy-auth-helper.mjs` | 新增：暫時本機授權助手 |
| `tests/trophy-probe.test.cjs` | 新增：30 項腳本模擬測試 |
| `tests/trophy-auth-helper.test.mjs` | 新增：8 項助手測試 |

整理文件時上述內容原本未提交；已依使用者後續的 commit & push 指示納入本次提交。接手仍須重新檢查未追蹤檔與 staged／unstaged diff，避免漏掉之後新增的工作。

## 專案綱要與已定行為

這是個人的 PlayStation 數位庫整理頁，保留官方授權來源與個人整理兩份資料。先從 JSON 匯入，或另開官方已購買分頁，透過 userscript 撈取後回傳管理頁預覽。同步不能默默蓋掉本機整理。

| 位置 | 責任 |
| --- | --- |
| `dist/index.html`、`style.css`、`icons.js` | 網頁、版面與本機 SVG |
| `dist/app.js` | UI、事件、匯入、瀏覽器儲存及同步操作 |
| `dist/model.js` | 白名單解析、遊戲分組、分類及個人資料 |
| `dist/sync.js` | 差異比較、衝突選擇與合併模型 |
| `dist/shared/google-auth.js`、`drive-appdata.js` | Google 暫存授權與 Drive appData 備份 |
| `dist/scripts/ps-game-base.user.js` | 正式遊戲庫撈取副本，v0.2.2 |
| `dist/scripts/ps-game-base-trophy-probe.user.js` | 獨立獎盃 probe，v0.1.5，尚未整合正式流程 |
| `tools/trophy-auth-helper.mjs` | 獎盃研究專用暫時服務，不隨 Pages 執行 |
| `tests/` | Node 測試，包含模型、合成 DOM、腳本、Drive 與助手 |
| `server.mjs` | 本機靜態伺服器，預設 127.0.0.1:4175 |
| `.github/workflows/deploy.yml` | main 的 Pages 發布，直接上傳 dist |

重要既定決策：

- 版本依每筆授權的 concept → product → entitlement 優先選 key，僅相同 key 合併，不靠名稱。PS4／PS5 合成一張作品卡，但保留逐筆原始授權與 ID。
- 三個互斥標記為白金／追蹤／忽略，可回到未分類；儲存碼仍是 `已白金`／`想玩`／`不再遊玩`，清除為 `未開始`。保留自訂分類、標籤、筆記及批次操作。
- 追蹤已取代收藏，評分 UI 已移除。忽略仍在所有遊戲中，由使用者篩選。圖片滑入展開三圖示，移出只留選取圖示，再點選取項可取消。
- 個人資料支援舊 `records` 與作品共用 `works`；原始授權紀錄及相容欄位不直接刪除。新分組有共用整理時優先採用，否則沿用相容來源。
- JSON／Drive 先比較：本機獨有、來源獨有、衝突、相同；預設保留本機衝突、合併獨有紀錄與分類，提供逐筆選擇與明確整份採用來源。下載不直接覆蓋。
- 套用前保存最近一次復原備份；多分頁偵測到他頁更新時停止舊頁寫入。Drive 上傳前重新讀取版本並核對 ETag，衝突不能無條件蓋掉。
- 首頁 noindex／nofollow，只是請搜尋引擎不要收錄，並不是網站存取限制。私人資料不放在網站檔案中。

原始 userscript 參考位置為 `D:\gitp\tampermonkey-scripts\ps-game-base\ps-game-base.user.js`，本 repo 副本獨立開發；Google 連接參考 `D:\gitp\edfwb2-checklist`。一般啟動不需要這兩個相鄰 repo，不要把本次修改自動寫回它們。

## 獎盃研究進度與卡點

目標：在取得數位庫時得知獎盃總數，尤其「有沒有白金」；另可呈現帳號已取得數量、進度與已取得白金。**有白金規格和個人已白金是兩件事。**

預期欄位包括 `npCommunicationId`／`npServiceName`、`definedTrophies`、`totalTrophies`、`hasPlatinum`、`earnedTrophies`、`earnedCount`、`platinumEarned`、`progress`、版本與更新時間。缺資料保留 null／unknown，不能當成零或沒有白金。`titleId` 與 NPWR 獎盃組 ID 不同。

每輪最多選 5 個 title ID，最多 3 個獎盃請求：指定 title 的個人摘要、最近 5 筆摘要、選填已知 ASTRO’s PLAYROOM 獎盃組規格。已知組範例不是所選遊戲或擁有證明；最近清單不能靠名稱硬配。

### 已有證據

- 使用者 Chrome／Tampermonkey 5.5.1 的 v0.1.3／0.1.4 回報：GraphQL 已解碼、已購買回應存在、解析錯誤 0，候選 24 個。原始遊戲 48–72 是多次回應累計，不是完整庫的唯一遊戲總數。
- `sony-session`：`GET ca.account.sony.com/api/v1/ssocookie` HTTP 200，證明此步能取得登入工作階段。
- `sony-access-code`：`GET ca.account.sony.com/api/authz/v3/oauth/authorize` 的 `manual-redirect` 失敗，GM 回報 408，約 350ms，`networkReason: failed-to-fetch`；沒有 redirect／access code。
- v0.1.4 調整 Cookie 覆寫後仍失敗。不能斷定只是網址錯誤、網路、權限，或 Sony 真正回傳逾時。
- 實際報告仍為 `complete: false`、`byTitle: []`、`recentSample: []`、`catalogExample: null`。尚無真實獎盃數量。
- 匿名 Node 探測曾得到 Sony 302 登入錯誤重新導向，只能支持端點可連線，不能支持已登入授權成功。

### 已完成但尚待實測

- v0.1.5 提供「本機助手測試（建議）」：Chrome 讀取 Sony 工作階段，由同電腦 Node 助手處理固定 Sony 授權交換，避開目前失敗的瀏覽器重新導向路徑。
- 助手只監聽 `127.0.0.1:4176`，15 分鐘後停止接收連線；驗證 Host、來源、自訂標頭及 nonce，限制本文大小、並行與頻率。只回傳短期 access token，不保存或輸出憑證。
- 此路徑只有使用者按助手按鈕才會將 Sony 暫存登入資料送至自己的 loopback，不傳到管理頁、Drive 或第三方。不能為了排錯改成公開綁定或放寬所有網域。
- 測試腳本與助手仍未整合主程式，不更新個人分類或雲端。

### 接手後下一步

1. 在新電腦啟動靜態伺服器及本機助手；安裝 probe **0.1.5**，重新整理官方頁面，確認面板版本。
2. 先選 1–3 個版本，至少含一個確定玩過的遊戲；按「本機助手測試（建議）」，不要重複以已知失敗的瀏覽器直接模式判斷新路徑。
3. 匯出測試 JSON，先看 `authRequests` 的 `local-session`／`local-access-token`，再看 `requests` 是否真正呼叫獎盃服務。失敗時僅提供已清理的診斷，必要時看白名單 `helperError`。
4. 成功後追加未玩過的已購遊戲、PS4／PS5，以及預期無白金遊戲；確認 title → NPWR 對應與各級總數。個人 title 查詢可能只涵蓋玩過的遊戲，未玩過的對應來源仍未解決。
5. 取得真實結果後才評估快取、全庫批次及 UI 整合；目前不要全庫掃描。版本獎盃組各自保留，共用組依 service／NPWR 去重，不跨 PS4／PS5 加總或平均，也不自動改手動標記。

## 驗證紀錄與界線

2026-10-17 本次換機交接及提交前重新執行 `node --test --test-reporter=spec tests`：**124 項通過、0 失敗、0 跳過**，涵蓋目前工作樹（含本次納入的 probe／助手測試）。其中 probe 30 項、助手 8 項。

- 分組、匯入／比較／合併、Drive 版本保護、授權助手及腳本解析等有合成測試；Drive `91fa025` 的測試包含缺少 ETag、版本變更及 412 保護，不等於真實 Google 寫入通過。
- 既有分類 UI 與部分匯入流程曾用本機合成資料做瀏覽器驗證；新的同步比較介面及遮罩上通知仍缺真實畫面驗收。
- Sony 完整自動撈取回傳、Google OAuth／Drive 真實帳號讀寫、獎盃助手實際授權與獎盃查詢，均不能由 Node 測試結果宣稱成功。
- 本次未檢查線上 Pages 版本或發布結果。

## 換機步驟

### 舊電腦先保存

1. 在實際使用的遊戲庫網址，由「資料與同步」匯出**完整備份**；有需要另匯出「操作前復原備份」。`ps-game-base.v1.before-import` 只有最近一份，下次套用會更新，不是歷史備份庫。
2. 保留測試用遊戲 JSON、獎盃結果 JSON，作為私人檔案分開搬移，勿加入 repo。Git 忽略只涵蓋特定名稱，不代表任意 JSON 都安全。
3. 確認本次提交已推送後，可在新電腦 clone／pull main 取得上列檔案。若之後又有未提交工作，須額外搬移，或複製整個 repo，包含未追蹤檔及隱藏 `.git`。不要只複製 `git diff`，它不包含未追蹤檔。
4. 搬移前檢查沒有其他編輯器或工作仍在寫檔，複製後比對關鍵檔與 Git 狀態。不要將兩個版本的整個資料夾無條件互相覆蓋。

### 新電腦啟動

需要 Git、Node.js 20+、Chrome 與 Tampermonkey；沒有 npm 套件安裝需求。以下假設仍放在 `D:\gitp\ps-game-base`，若不同請調整路徑。

```powershell
cd D:\gitp\ps-game-base
git status --short --branch
git log -5 --oneline
node --version
npm test
npm start
```

開啟 [本機遊戲庫](http://127.0.0.1:4175/)，透過完整備份預覽後匯入。原有本機／localhost／Pages 的 localStorage 是分開的，即使網址相同，新電腦也沒有舊瀏覽器資料。

正式同步安裝本 repo 的 `dist/scripts/ps-game-base.user.js` **0.2.2**；獎盃研究另安裝 `dist/scripts/ps-game-base-trophy-probe.user.js` **0.1.5**。磁碟檔更新不會自動讓 Tampermonkey 採用新版，須更新已安裝腳本並重新整理 Sony 頁面。自行在 Chrome 登入 Sony，不複製／索取 Cookie 或 token。

獎盃研究另開終端執行：

```powershell
cd D:\gitp\ps-game-base
node tools/trophy-auth-helper.mjs
```

助手 15 分鐘後停止接收連線，測試前確認仍在運作；舊電腦的程序不會隨檔案搬移。助手機制不屬於 Pages 後端，也不是正式遊戲庫同步的必要條件。

若改 origin／port，必須重新檢查正式 userscript 的 `MANAGER_ORIGINS` 與 Google Cloud OAuth 已授權 JavaScript 來源；使用原本 `http://127.0.0.1:4175` 可沿用程式設定，但真實帳號仍需重新授權。Google Client 為公開 client ID，沒有需要搬移的 Client Secret；外部 Google 設定不會隨 Git 自動建立。

### 提交與發布提醒

完整規則以 [AGENTS.md](../AGENTS.md) 為準：要求 commit 才提交，明確 stage 相關檔，提交前後檢查差異；沒有要求 push 就不推送。推送 main 才會觸發 Pages，不能把本機 commit 當成已發布。

有過提交後檔案再次出現舊內容的情形，目前沒有證據確定是哪個程序造成。接手時保留現場，核對 diff／時間／歷史，不用 reset／restore 掩蓋；提交後的乾淨狀態也只代表檢查當下。
