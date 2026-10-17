# 獎盃小範圍測試

獨立 Tampermonkey 測試腳本，尚未整合至正式遊戲庫。Chrome 實測已確認清單攔截與 Sony 登入成功，但瀏覽器授權碼步驟失敗；本機助手路徑仍待真實帳號驗證。目的為確認數位庫 `titleId` 能否取得獎盃規格，尤其區分「遊戲有白金」與「帳號已取得白金」。

## 執行

1. Chrome／Tampermonkey 新增腳本，貼入 `dist/scripts/ps-game-base-trophy-probe.user.js` 的完整內容後儲存。與原本遊戲庫腳本的 namespace 不同，可以並存。
2. 同一個 Chrome 登入 `https://library.playstation.com/recently-purchased`，重新整理並切到「已購買」，右下出現測試面板。
3. 面板讀取官方頁面回傳的遊戲，也可載入遊戲庫 JSON。每輪選 1–5 個版本，建議含 PS4／PS5、玩過／未玩過，以及預期沒有白金的遊戲。最多顯示前 200 個候選，可載入較小的遊戲 JSON 測試其他遊戲。
4. 建議先由本機啟動 `node tools/trophy-auth-helper.mjs`，再按「本機助手測試（建議）」；這次 Codex 可以代為啟動，你不必自己操作終端。此按鈕會把 Sony 暫存登入資料送到自己電腦的 `http://127.0.0.1:4176`，再由助手只向 Sony 交換授權；只有按此按鈕才會傳送。助手不保存或記錄憑證。Tampermonkey 可能要求允許 `ca.account.sony.com`、`m.np.playstation.com` 與 `127.0.0.1`，不在頁面輸入密碼或貼 token。「瀏覽器直接測試」保留原流程，已知目前會卡在授權碼步驟。
5. 查看結果與「完整測試結果」，按「匯出測試 JSON」。結果含私人遊戲紀錄，既有 Git 忽略規則會排除 `ps-game-base-trophy-probe-日期.json`，不要加入 Git。

亦可啟動 `node server.mjs` 後，在 Chrome 開啟 `http://127.0.0.1:4175/scripts/ps-game-base-trophy-probe.user.js` 安裝。

若沒有授權碼，會提示登入或 Tampermonkey 手動重新導向支援問題。需使用支援 `GM_xmlhttpRequest` 的 `redirect: manual` 的版本；這段跨來源授權流程仍需實機驗證。錯誤只輸出階段及 HTTP 狀態，不輸出原始錯誤本文或授權標頭。

## 請求範圍

每輪最多三個獎盃 API 請求，不做全庫掃描、自動分頁或重試：

1. `users/me/titles/trophyTitles`：最多 5 個選定 title ID，取得對應與個人摘要。
2. `users/me/trophyTitles?limit=5&offset=0`：額外取得最近 5 筆帳號摘要作欄位對照，不用名稱硬配到數位庫。
3. 選填 `npCommunicationIds/NPWR20188_00/trophyGroups`：取得 ASTRO’s PLAYROOM 的已知獎盃組規格。這是獨立範例，不代表選定遊戲或使用者擁有／玩過此遊戲。

首次授權另有三個 Sony 請求。只有 access token 暫留分頁記憶體；NPSSO、授權碼、refresh token 不寫入畫面、console、localStorage、Drive 或 JSON。「停止／清除授權」中止請求並清除 access token，重新整理清除測試結果。沒有修改正式遊戲庫分類／存檔的程式碼。

任一步驟失敗會停止後續查詢，`complete` 為 false；部分結果仍可匯出。HTTP 401／403 另清除 access token。

## 結果欄位

| 欄位 | 意義 |
| --- | --- |
| `samples` | 選定的 title ID、名稱、平台 |
| `byTitle[].status` | `matched` 有獎盃組；`unknown` 無可用對應 |
| `npCommunicationId`／`npServiceName` | 獎盃組 ID 及服務，與商品 ID 不同 |
| `definedTrophies`／`totalTrophies` | 各級總數及四級加總 |
| `hasPlatinum` | 白金總數大於零；缺資料為 null，不能當成 false |
| `earnedTrophies`／`earnedCount` | 帳號已取得的各級數量與加總 |
| `platinumEarned` | 帳號是否已取得白金，無個人資料為 null |
| `progress` | API 回傳的個人進度，不自行以數量換算 |
| `trophySetVersion`／`lastUpdatedDateTime` | 獎盃組版本與個人最近更新時間 |
| `recentSample` | 最近 5 筆摘要，非選定遊戲的自動對應結果 |
| `catalogExample` | 已知 ASTRO’s PLAYROOM 獎盃組規格 |
| `requests` | 獎盃請求路徑、狀態、耗時 |
| `authRequests` | 授權步驟代碼、固定主機／路徑、HTTP 狀態、請求模式及結果；不含 query、標頭、本文或 redirect URL |
| `probeVersion`／`manager` | 測試腳本版本、可取得時的腳本管理器名稱與版本 |

同一 title ID 若有多份獎盃組，各自呈現，不直接加總。缺漏或格式錯誤的計數保留 null。

## 判讀界線

- 以 title ID 查個人對應，文件明示可能只對已玩過的遊戲有用。查不到不能判定沒有白金、沒有獎盃或未白金。
- 已知獎盃組 ID 可直接查規格；未玩過且沒有對應 ID 的遊戲，仍需可靠的對應來源，不能只靠名稱猜測。
- 玩過的遊戲測試成功，不代表所有已購買、未玩過的數位遊戲皆能取得獎盃數量。
- 模擬測試驗證資料判讀、請求上限、授權組裝、錯誤及敏感資料排除，不代表 Sony／Chrome／Tampermonkey 真實查詢成功。

參考：[使用者獎盃 API](https://psn-api.achievements.app/api-docs/user-trophies)、[規格 API](https://psn-api.achievements.app/api-docs/title-trophies)、[授權流程](https://psn-api.achievements.app/authentication/authenticating-manually)、[Tampermonkey API](https://www.tampermonkey.net/documentation.php?q=GM_xmlhttpRequest)。

## v0.1.1：授權失敗診斷

舊版若 `requests` 為空，只能確定尚未到獎盃查詢，無法分辨卡在三個授權步驟的哪一步。新版補上 `authRequests`，也把一般請求不必要的 `redirect: manual` 移除，僅授權碼請求使用。這是相容性調整，不代表已確認舊版失敗根因。

- `sony-session`：取得現有 Sony 登入工作階段。
- `sony-access-code`：換取授權碼。
- `sony-access-token`：換取獎盃 API 暫存權杖。
- `outcome: network` 且 status 為 0／null：請求未正常完成；仍不能只靠它區分網路、權限或管理器限制。
- `redirectTarget` 只回報 `psn-app`／`sony-web`／`other`／`none` 分類，不包含 URL 或授權碼。

更新腳本後重新整理官方遊戲庫，確認面板顯示 v0.1.5，再測試並匯出 JSON。不要提供 NPSSO、Cookie 或 token。

## v0.1.2：有面板但沒有遊戲候選

- 回應攔截新增 GraphQL 批次陣列支援，URL 判斷不依賴跨 JavaScript realm 的 instanceof。
- Fetch、XHR 的攔截安裝各自容錯；其中一個不可用時，不阻止面板及 JSON 載入。
- 面板顯示攔截狀態、Fetch／XHR 請求數、GraphQL 數、已購買回應數、原始遊戲筆數、有效候選與解析錯誤。診斷不保存 request body 或網址 query。
- 即使完全沒有候選，也可匯出診斷 JSON，結果增加 capture 區塊。
- 「載入遊戲庫／測試 JSON」支援先前的測試結果 samples，可直接重用 v0.1.0／0.1.1 的五款遊戲，避開頁面快取或尚未攔到請求的問題，不必重新選樣本。
- 有面板表示網址匹配及腳本啟動成功。切換分類若使用頁面快取，未必產生新請求；更新後請先重新整理官方遊戲庫。攔截計數只能幫忙定位，尚不能單靠空清單確認 Chrome 的根因。

## v0.1.3：GraphQL 已攔到，但全部記為解析錯誤

使用者回報 Fetch／XHR 均 installed、GraphQL 15 次、已購買 0、解析錯誤 15，最後記錄的 HTTP 狀態為 200。這能排除完全未攔到請求，但舊版同一個 catch 包含了 clone、讀取與資料處理，不能確認全是 JSON 語法錯誤，也不能由最後一次狀態推定全部請求都成功。

- 優先觀察頁面正常呼叫的 Response.json／text 結果，保留原始 Promise 與回傳值，不另消耗原始本文；兩種讀取器均能掛接時不再 clone。掛接不可用時保留 clone 後讀文字的方式。
- 文字資料在測試腳本內 JSON.parse，支援 BOM 與批次陣列；XHR 亦共用此處理。
- capture 增加讀取器掛接狀態、讀取次數、已解碼與未識別回應數。
- captureFailures 最多保留 10 筆，分辨 fetch-clone、fetch-read、parse-json、process-library、reader-json／text、xhr-read 等步驟。只保存錯誤類型與固定原因代碼；不保存原始錯誤文字、本文或標頭。另記錄 bodyUsed、Content-Type 分類與必要時的本文長度／HTML 分類。
- 新增回應先被頁面讀取的回歸測試，以及文字讀取、BOM、錯誤階段與敏感資料排除測試。這證明已處理該模擬情境，不代表使用者此次 Chrome 問題已被確定為相同原因。

更新後可重新整理並切到「已購買」測攔截；若只要先驗證獎盃，仍可直接載入先前測試 JSON 的五款樣本再按開始，無須等待攔截。若清單仍空，匯出結果／診斷 JSON，重點檢查 capture 與 captureFailures。

## v0.1.4：Sony 工作階段成功，授權碼步驟 network／408

Chrome 實測回報 Tampermonkey 5.5.1：遊戲清單解析成功（48 筆原始遊戲、24 個候選、解析錯誤 0），sony-session HTTP 200；sony-access-code 在 355ms 回報 network／408、沒有 Location。這證明卡在授權碼步驟，但不能直接把管理器 onerror 的 408 當成 Sony HTTP 逾時。

- 授權碼請求改用瀏覽器既有 Sony Cookie，不再另外寫入 Cookie 標頭；仍使用 manual redirect，不自動跟隨到任意目的地。這是針對 Fetch 模式的相容性調整，尚待實機確認。
- 若 Location 或 finalUrl 已帶回預期 PS App URI 的 code，即使管理器因無法完成自訂協定重新導向而呼叫 onerror，也可在嚴格驗證後接續 token exchange。
- 驗證限定原有 app protocol、host、空／斜線路徑，禁止 userinfo、hash、OAuth error、多個 code 或不合法字元。沒有有效 code 的 network／408 繼續視為失敗，不偽造成功，也不盲目重試。
- authRequests 增加 hasAccessCode、codeSource、networkReason（只記錄固定分類如 failed-to-fetch、unsupported-redirect、certificate-error），不匯出完整 finalUrl、code 或原始錯誤。
- 目前新增 4 項回歸測試，包含使用者回報的無 code 快速 408、有 code 的自訂 app redirect、Cookie 選項及錯誤 callback URL 拒絕；仍不代表 Chrome 的授權已成功。

[管理器文件](https://www.tampermonkey.net/documentation.php?q=GM_xmlhttpRequest) 說明 manual redirect 會強制 Fetch 模式。[管理器 issue #2226](https://github.com/Tampermonkey/tampermonkey/issues/2226) 亦顯示 408／Failed to fetch 可來自管理器的網路失敗，該 issue 的實際原因是憑證，不能套用為本次 Sony 問題的已確認原因。

## v0.1.5：暫時本機授權助手

v0.1.4 實測移除手動 Cookie 後，授權碼步驟仍在約 350ms 回報 network／408／failed-to-fetch，且無可驗證 code；不能視為已解決。另以不帶帳號憑證的 Node 請求驗證同端點會回 302 導向 Sony 登入頁，表示需正確處理重新導向，並未證明使用者登入後的實際失敗原因。

為避免繼續微調相同瀏覽器路徑，增加 `tools/trophy-auth-helper.mjs`：

- 只監聽 IPv4 `127.0.0.1:4176`，不監聽區域網路，預設 15 分鐘後停止接收連線；不適用 GitHub Pages 部署。
- 本機助手模式仍由 Chrome 讀取 Sony 暫存登入資料；只在使用者點按助手按鈕後傳給本機，不需貼 NPSSO。
- 本機助手用 Node 的 manual redirect 從 Sony Location 讀 code，再 POST 至 Sony token 端點；固定 Sony 端點，不接受任意代理 URL，也不自動追蹤重新導向。
- 對 Chrome 回傳的只有短效 access token 與期限，不包含 refresh token、ID token 或 code。所有憑證僅留請求中的記憶體，不輸出 console、不寫檔案／localStorage／Drive／診斷 JSON。
- Host 限定 loopback；拒絕非預期網站 Origin，檢查專用 client header、隨機 nonce、JSON 類型、4 KB 上限，限制並行與請求頻率。瀏覽器中止本機連線會取消助手的 Sony 請求。
- 新增 `authMethod: local-helper`，authRequests 記錄 local-session／local-access-token；助手錯誤只匯出固定的 helperError 代碼。
- 8 項本機 HTTP／授權交換測試與 3 項腳本助手連接模擬測試均使用合成資料，不代表 Sony 真實帳號 E2E 成功。

這條路徑是本機小範圍測試的替代授權方式；未把本機服務需求加入正式遊戲庫，也未改變既有分類或 Drive 同步。若要未來純網頁一鍵同步，仍需另決定可長期使用的授權架構。
