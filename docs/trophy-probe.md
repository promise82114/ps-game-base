# 獎盃小範圍測試

Tampermonkey 整合腳本目前 v0.4.2（`dist/scripts/ps-game-base.user.js`），提供選用研究模式，以及由管理頁按鈕啟動的白金標記同步。2026-10-19 使用者提供 v0.1.5 本機助手模式的真實結果：授權及三個獎盃請求均 HTTP 200、`complete: true`，部分樣本有成功對應；未對應仍保留未知。同日使用者完成新版 Chrome 白金標記同步驗收，回覆「完成，看到新增白金筆數」。瀏覽器直接授權路徑仍未驗證成功。

## v0.4.2：限定 Tampermonkey 的傳輸對照

使用者選擇「希望只保留 Tampermonkey 腳本」，不安裝專用 Chrome 擴充套件，不以常駐／自動啟動助手取代需求。正式直接授權仍未修通；本版只加入手動診斷以定位傳輸差異，不盲目改 Cookie／端點／白金邏輯。

官方白金面板與一般研究面板均提供「檢查瀏覽器連線（不改資料）」，不需候選遊戲；只在手動點擊後執行，最多 4 個請求：

1. ssocookie，GM 一般模式。
2. ssocookie，GM fetch:true。
3. ssocookie，GM redirect:manual。
4. 同一 Sony authorize 端點，GM redirect:manual、anonymous:true，不注入 Cookie、Authorization 或 NPSSO。

每組僅一次；預期比較 network 失敗，因此非限流的 network 可繼續下一個不同對照組。401／403／429、取消則停止後續組。無 token exchange、獎盃 API、本機助手、PM 白金結果或存檔寫入。既有暫存 token 在檢查前後清空。

輸出沿用 probe schema，authMethod:browser-transport-check、checks 陣列；匯出為 `ps-game-base-auth-checks-日期_時分.json`。只記錄狀態、transport、時間、hasSession、redirectTarget／hasAccessCode 等分類／布林，無完整 Location 或登入本文。complete 只表示四組已完成，不表示授權成功。

163 項 Node 測試通過，包含 Fetch 全失敗／只有 OAuth 失敗、固定 Sony 目的地與最多 4 次、無敏感資料、無助手／獎盃／回傳標記、限流／授權錯誤停止及取消。實際 Chrome 結果仍待使用者提供，不能將合成結果作根因結論。

## v0.4.1：Chrome 實測仍失敗（2026-10-19）

收到使用者 v0.4.1、Tampermonkey 5.5.1 的實際授權診斷（05:35:21Z）：

| 階段 | 結果 |
| --- | --- |
| sony-session | HTTP 200，326ms；後續程式已驗證 NPSSO 格式並進入授權碼請求 |
| sony-access-code | network／408，576ms，failed-to-fetch；explicitSessionCookie: true，沒有 Location 或可驗證 code |
| sony-access-token | 未執行 |
| 獎盃 API | 0 次，未取得白金結果，未更動標記 |
| 官方庫捕捉 | 14 個 GraphQL 已解碼，4 個已購買回應，96 筆原始列，解析錯誤 0 |

這確認 v0.4.1 仍未排除原來的授權碼失敗；explicitSessionCookie 只證明腳本設定了 GM 選項，不證明 Cookie 實際送達 Sony 或 Sony 已接受。408 出現在管理器的 network callback，不能直接認定是 Sony HTTP 逾時，也不能由沒有 Location 推定 Sony 沒有發出重新導向。

本次不再試改 Cookie 名稱、批次速度或白金判斷；失敗發生在獎盃查詢之前。現階段不能宣稱 Tampermonkey 直接模式可取代已成功的 Node 助手，也不能把根因直接定為瀏覽器缺陷。若採專用 Chrome 擴充套件，可研究其 webRequest 的回應標頭／重新導向事件，但須另行實測，尚無成品或成功承諾；使用者已選擇只保留 Tampermonkey，故不採擴充套件方案。

私人原始 JSON 不加入 repo；下方為原候選修正的實作與合成測試記錄。

## v0.4.1：直接授權候選修正（原實作記錄）

使用者要求免開 PowerShell。正式同步改呼叫 `authorize(run,'browser')`，使用 GM `cookie` 選項把已讀得的 NPSSO 明確帶給固定的 Sony `/api/authz/v3/oauth/authorize`，搭配 manual redirect；只接受既有 app URI 的唯一安全 code。交換 token 也使用 manual redirect，失敗不繼續獎盃 API、不改連本機助手。診斷僅增加 `explicitSessionCookie` 布林，不保存 Cookie 本文。

先前 v0.1.3 曾使用手動 Cookie 標頭、v0.1.4 改依賴 jar，兩者均失敗；本次改用管理器專用 cookie 選項，不把「改了選項」宣稱為已確認根因或已成功。管理器文件支持此介面，但必須由使用者 Chrome／Tampermonkey 實測。v0.4.1 的合成回歸涵蓋授權與獎盃全程不呼叫 localhost、Cookie 目的地限制、取消、失敗不回退及診斷不洩漏資料；完整 157 項通過。

官方白金面板保留「匯出授權診斷」，失敗時可提供診斷 JSON，無須貼登入憑證。遊戲庫面板的研究工具仍可手動選擇「本機助手測試（備用）」；容量測試仍明確使用助手。以下版本章節為歷史記錄，最新正式白金流程以本節為準。

參考：[Tampermonkey cookie／redirect 介面](https://www.tampermonkey.net/documentation.php?ext=d2&q=GM_xmlhttpRequest)、[psn-api 固定 Sony 交換流程](https://github.com/achievements-app/psn-api/blob/main/src/authenticate/exchangeNpssoForAccessCode.ts)。

## v0.4.0：整合與加速

右上角「資料與同步」先提供一支整合腳本的安裝資訊，集中更新遊戲庫、同步白金及 JSON／Drive 操作。一般官方分頁不自動展開獎盃面板；獎盃研究工具由遊戲庫面板手動展開。白金管理橋接分頁只顯示白金同步面板，不啟動數位庫同步。

2026-10-19 收到使用者 v0.3.0 實測：24 個版本、22 個獎盃請求，20 次 HTTP 200、單次 10／15 個各一次 HTTP 400，無 429。四組結果一致：循序 350ms 4.003 秒、循序零間隔 2.480 秒、兩批並行 1.822 秒、三批並行 1.892 秒。正式採每批 5 個、兩批並行、零間隔。

依短測平均延遲推估 1,800 個版本約 1 分 59 秒，尚未驗證全庫長時間查詢。結果回傳順序不影響判斷；進度只累加已完成版本。一般失敗停止派送後續批次，等待在途請求結束，整輪不套用；取消中止在途請求，不重試。白金補標及資料保護規則不變。私密原始報告不納入 Git。

## v0.3.0：容量與分批速度實測

在一般官方遊戲庫分頁的獎盃面板按「測試容量與分批速度（本機助手）」。須先更新腳本至 v0.3.0、啟動同電腦的本機助手；這不是管理頁的「同步白金標記」，不會回傳套用標記。

候選至少 15 個，取前 30 個不同 title ID，不受摘要測試的 5 個勾選限制影響。候選不足時可用「載入遊戲庫／測試 JSON」載入遊戲庫或完整備份。所有組別使用同一批候選：

| 測試 | 每請求版本數 | 並行數 | 批次間隔 |
| --- | --- | --- | --- |
| 基準 | 5 | 1 | 350ms |
| 單次容量 | 10、15 各一次 | 1 | 不適用 |
| 循序加速 | 5 | 1 | 0ms |
| 並行對照 | 5 | 2 | 0ms |
| 並行對照 | 5 | 3 | 0ms |

- 基準先查完取樣版本，再實送 10／15 個；單次 5 個的容量結果沿用基準第一個請求。若有已知獎盃組，將其中一個對應版本移到 10／15 個請求的尾端，以識別 HTTP 200 卻僅處理前 5 個的情況。
- 每組比較回傳的 title 對應、獎盃組及已取得白金數是否與基準一致，忽略名稱、更新時間等無關欄位。若沒有任何有效獎盃組對應，即使回應一致也標示尾端證據不足，不宣稱較大容量已證實。
- 最多 `4 × ceil(候選數 / 5) + 2` 個獎盃請求；30 個候選時為 26 個，另有 3 個授權步驟。組別間冷卻 1 秒，不做全庫測試或失敗重試。
- 10／15 個的 HTTP 400 等拒絕會記錄後繼續比較；基準或速度組失敗則停止後續組別。任何 429、401、403、網路失敗或使用者停止都會中止新增請求；已在途的最多 3 個請求可能稍後結束。429 的數字 Retry-After 會記錄，不自動重試。
- 結果顯示 HTTP 狀態、成功請求數、組別總耗時、平均請求耗時、實際最大並行數、與基準一致性及最快相符組別。1,800 個「版本」的粗估依平均請求時間及批次設定計算，不含授權／分頁／組別間冷卻；不代表長時間限流或全庫實測結果。
- 按「匯出結果／診斷 JSON」產生 `ps-game-base-trophy-benchmark-YYYY-MM-DD_HH-mm.json`，含 `limitTests`、`profiles`、`requests`、`authRequests`，無原始回應本文或憑證。取樣遊戲及 ID 仍是私人資料，不加入 Git；可重新載入此 JSON 作候選。
- v0.3.0 測試當時正式同步為每批 5 個、循序 350ms；效能測試本身不自動調整設定，也不更新個人分類、localStorage、Drive 或作品狀態。實際結果已收到，見下方 v0.4.0 記錄。

## v0.2.0：同步白金標記

- 管理頁新增「同步白金標記」。v0.2.0 當時須先更新本腳本、啟動同電腦的 `node tools/trophy-auth-helper.mjs`，再從管理頁點擊；v0.4.1 正式按鈕已改直接授權（見最新記錄）。開頁面、搜尋及正式數位庫同步不會觸發獎盃查詢。
- 本次查詢範圍由管理頁指定為尚未標白金的現有有效作品之已知 PS4／PS5 title ID，每批最多 5 個、兩批並行且無額外間隔，最多接受 20,000 個 ID；不另查最近摘要或規格範例，不做背景排程或失敗重試。
- 僅採正整數 `earnedTrophies.platinum > 0`，不以 `definedTrophies`、100% 進度、名稱或其他帳號推斷。相同作品任一已知版本符合即補標。其他情況保留；未發現白金不撤回既有標記。
- 只有完整成功結果才回傳套用；HTTP 404 批次略過，其他連線／HTTP／格式錯誤或停止操作則不套用本次結果。已完成變更只寫作品狀態與整理時間，保存操作前備份；不改庫、分類、標籤、筆記或 Drive。
- 雙向橋接使用 `psgbPlatinumOrigin`／`psgbPlatinumSession`，避免觸發正式數位庫腳本的自動同步。雙方驗證固定來源、opener／child 與隨機 session，管理頁另限制回傳 ID 為本次查詢範圍。不回傳任何授權材料。
- 下列「執行」及歷史版本說明屬獨立研究模式；其 5 個版本／最多 3 個獎盃請求限制仍維持，不影響按鈕啟動的分批同步。

## 執行

1. Chrome／Tampermonkey 新增腳本，貼入 `dist/scripts/ps-game-base.user.js` 的完整內容後儲存。直接更新原遊戲庫腳本；停用／移除先前的獨立「PS Game Base 獎盃小範圍測試」，只保留整合腳本。
2. 同一個 Chrome 登入 `https://library.playstation.com/recently-purchased`，重新整理並切到「已購買」，右下由 PS Game Base 開啟遊戲庫面板，再點「獎盃研究工具」。
3. 面板讀取官方頁面回傳的遊戲，也可載入遊戲庫 JSON。每輪選 1–5 個版本，建議含 PS4／PS5、玩過／未玩過，以及預期沒有白金的遊戲。最多顯示前 200 個候選，可載入較小的遊戲 JSON 測試其他遊戲。
4. 建議先由本機啟動 `node tools/trophy-auth-helper.mjs`，再按「本機助手測試（備用）」；這次 Codex 可以代為啟動，你不必自己操作終端。此按鈕會把 Sony 暫存登入資料送到自己電腦的 `http://127.0.0.1:4176`，再由助手只向 Sony 交換授權；只有按此按鈕才會傳送。助手不保存或記錄憑證。Tampermonkey 可能要求允許 `ca.account.sony.com`、`m.np.playstation.com` 與 `127.0.0.1`，不在頁面輸入密碼或貼 token。「瀏覽器直接測試」保留原流程，已知目前會卡在授權碼步驟。
5. 查看結果與「完整測試結果」，按「匯出測試 JSON」。結果含私人遊戲紀錄，既有 Git 忽略規則會排除 `ps-game-base-trophy-probe-日期.json`，不要加入 Git。

亦可啟動 `node server.mjs` 後，在 Chrome 開啟 `http://127.0.0.1:4175/scripts/ps-game-base.user.js` 安裝。

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

更新腳本後重新整理官方遊戲庫，確認研究面板顯示 v0.4.1，再測試並匯出 JSON。不要提供 NPSSO、Cookie 或 token。

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
