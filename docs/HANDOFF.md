# 換機交接與執行進度

更新日期：2026-10-19（Asia/Taipei）。本文件是交接快照；接手先讀 [AGENTS.md](../AGENTS.md)，再核對 Git 與實際檔案。使用操作及資料格式詳見 [README](../README.md)，獎盃測試細節見 [trophy-probe.md](trophy-probe.md)。

## 2026-10-19 v0.4.5 提交範圍與驗證

- 使用者已要求 commit & push。本次提交整合 v0.4.3 至 v0.4.5 的免助手研究、成功的 sso_token 正式授權、單筆診斷、操作提示、資源版號及交接文件；基準 HEAD `a6c00c2`，main。提交 hash 與遠端是否同步以實際 Git 紀錄為準，下方各階段「未 commit／push」為當時快照。
- 提交前完整 175 項 Node 測試、腳本語法及差異檢查通過；變更只含 10 個已追蹤的專案檔案，沒有私人 JSON、憑證、臨時測試頁或未追蹤檔。研究測試成功提示改為可直接回管理頁同步，移除先前候選階段的過時指示。
- Sony 授權／單筆獎盃已有使用者真實成功報告；免助手全庫操作仍待驗收。推送 main 會觸發 Pages，部署完成需另以 Actions 狀態確認，不能只憑 push 成功判定。

## 2026-10-19 14:33 純 Tampermonkey 實測成功，v0.4.5 接回正式同步

- 使用者實際報告 v0.4.4、Tampermonkey 5.5.1：Sony 登入 200／493ms、sso_token 交換 200／702ms、獎盃摘要 200／713ms，取得一筆合法樣本；complete、sessionReadVerified、tokenExchangeVerified、trophyAccessVerified 均 true。純 Tampermonkey 路徑已證實，不再記為授權失敗或待單筆驗收。私人 JSON／遊戲內容不加入 Git。
- v0.4.5 將正式 syncPlatinum 的授權改為 browser-sso-token，一般研究摘要按鈕亦採同路徑；正式診斷模式同步更新。保留 5 ID／批、兩批並行、取消／失敗停止及全輪成功才回傳、嚴格已取得白金判定與所有個人資料保護。無 fallback、無助手或舊 App authorize 請求；研究工具的明確助手備援與舊內部對照未擴大。
- 管理頁原等待訊息仍含「本機助手正在運作」的過時文字，本輪一併修正；舊 helper 錯誤改提示更新整合腳本。index 版本／說明及現行文件改為成功的授權方式，快取版號 20261019-5。更新已安裝腳本、關閉舊官方頁、重整管理頁後可直接按「資料與同步 → 同步白金標記」。
- 基準 HEAD `a6c00c2`、main；開始時既有 10 檔未提交修改，保留延續，本輪仍在同一組檔案內。未 commit／push。174 項 Node 測試通過；正式授權 fixtures 更新為兩步直換並檢查無 authorize／Cookie／loopback，另涵蓋 grant 拒絕後停止、原分批與資料套用測試。真實成功目前限授權與單筆 API，免助手全庫查詢／補標／儲存及長時間限流仍待使用者操作驗收。
- 最終驗證更新為 175 項，另含一般研究摘要採 SSO 及原查詢上限。獨立 4177 真實瀏覽器以完整腳本與合成管理訊息／GM 回應跑正式 syncPlatinum：12 個版本、5 次請求（2 授權 + 3 批）、只回傳 2 個白金版本，助手／authorize 請求均 0；實際管理頁確認 v0.4.5 資料面板、安裝連結及免助手說明。這仍屬合成流程，未寫真實使用者存檔。臨時測試頁及服務已清除。

## 2026-10-19 14:21 實測失敗後，v0.4.4 改測直接權杖交換

- 收到使用者 v0.4.3／TM 5.5.1 實測：sony-session 200／330ms，anonymous 單一 Cookie 的 session 200／310ms，sessionCookieVerified:true；authorize network／408／624ms，failed-to-fetch，無 Location／code；未交換 token，獎盃 0、標記未變更。私人報告不加入 Git。排除原有 Cookie 的方案沒修通，不再重跑該組當修正。
- 續查找到 andshrew/PlayStation-Stars 的 sso_token 範例，使用相同公開 client、scope、Sony token 端點直接 POST，不經 authorize／App URI。開發端用假 NPSSO 進行一次 Node 探測，HTTP 400、invalid_grant、無 token；沒有使用真實帳號登入資料，不代表有效登入會成功或 Chrome 驗收通過。
- v0.4.4 將研究／白金面板的候選按鈕更新為「測試直接交換權杖（只查 1 筆）」，最多 3 次 Sony 請求；無候選遊戲需求、不呼叫助手／authorize、不回退或重試、失敗／取消即停。輸出 browser-sso-token、sessionReadVerified／tokenExchangeVerified／trophyAccessVerified；授權診斷增加安全 grantType／白名單 oauthError。所有結束清除 token，不寫標記或管理頁結果。獨立 Cookie 只保留內部對照，正式白金流程尚未改用候選。
- 開始時已存在前輪 10 個修改檔案，保留並延續；基準 HEAD `a6c00c2`、main。本輪變更同一組腳本／測試／文件與 index 版本說明，資源版號更新為 20261019-4。未 commit／push。曾評估沿用網頁登入的方向，但找到更直接的 grant 範例後未保留該試作，最終沒有共用／匯出遊戲庫 Bearer 或新增網頁登入測試按鈕。
- 驗證：完整 173 項 Node 測試通過、語法／差異檢查通過；涵蓋直接 grant 的固定端點與三次上限、未呼叫 authorize／助手、無管理頁標記結果、OAuth 錯誤白名單／敏感內容排除、所有階段錯誤／取消、無效 token 及空獎盃清單。獨立 4177 真實瀏覽器搭配合成 GM 回應，確認新按鈕鍵盤操作、成功 3 次／拒絕 2 次即停止，授權碼／助手／標記結果皆 0；不是 Sony 實測。HTTP 已確認本機 4175 提供 v0.4.4；測試頁與 4177 臨時服務已清除。下一步由使用者 Chrome 更新 v0.4.4 並按新測試按鈕，提供匯出 JSON。

## 2026-10-19 v0.4.3 獨立 Cookie 授權候選測試

- 使用者授權繼續找純 Tampermonkey 授權方法並準備下一步小範圍測試。核對 TM issue #2754 維護者對舊版 cookie 合併的說明與 anonymous 建議；這不是本案已確認根因。沒有新增套件、grant／connect、擴充套件或助手依賴。
- 新增「測試免助手授權（只查 1 筆）」，一般研究工具及白金面板皆可手動點擊、不需候選遊戲。最多 5 次固定 Sony 請求：一般登入、anonymous 單一 npsso 的登入一致性驗證、相同選項 authorize、token、最近 1 筆獎盃摘要。維持原 client／scope／redirect URI；非預期 HTTP、network、格式失敗或取消即停，不重試、不換路徑。
- 輸出 authMethod:browser-isolated-cookie、sessionCookieVerified、trophyAccessVerified、安全診斷與至多一筆摘要；檔名 ps-game-base-browser-auth-日期_時分.json。成功須真的通過獎盃 HTTP 200 與結構驗證；有效空清單代表沒有樣本。所有結束路徑清除 token，不刪 Cookie、不回傳管理頁結果或寫標記／Drive。
- 正式同步維持原授權路徑；候選需使用者 Chrome／Tampermonkey 真實成功後再接回。此次不是單純重跑 v0.4.2 四組，也不宣稱已解決 App URI 或成功取代助手。
- 工作基準 HEAD `a6c00c2`（main）；開始時 README、HANDOFF、trophy-probe 有前輪診斷文件修改，保留並延續。本輪修改整合腳本、trophy-probe 測試、index 版本／說明、AGENTS 及上述文件；資源版本更新為 20261019-3（既有工具改 index／app／sync／platinum 相依網址）。未 commit／push。
- 驗證：完整 169 項 Node 測試通過、語法檢查通過；新增候選流程成功、Cookie 不一致、每一步 401／403／429／network、取消、重複啟動、隱私、回應上限及合法空清單驗證。Sony 實測仍待使用者更新 v0.4.3 回報，不能把合成測試當授權成功。
- 獨立 127.0.0.1:4177 的真實瀏覽器搭配合成 GM 回應，確認 v0.4.3 新按鈕可用鍵盤操作；成功情境請求 5、顯示一筆摘要，失敗情境在 authorize 的第 3 個請求停止，登入已驗證／獎盃未確認的狀態清楚可見。兩者助手及管理頁標記結果均 0。測試頁不接 Sony，臨時頁與服務已清除；此為 UI 驗證，並非 Chrome／Tampermonkey／Sony 授權成功。

## 2026-10-19 13:59 Chrome 傳輸對照已收到

- 基準 HEAD `a6c00c2`（main，開始時與 origin/main 一致且工作目錄乾淨），v0.4.2 診斷已在該提交內。本輪只更新 README、本交接文件與 trophy-probe 實測記錄，未修改正式程式、未 commit／push；私人 JSON 不加入 Git。
- 使用者真實報告：Tampermonkey 5.5.1，一般／Fetch／manual 的 ssocookie 均 HTTP 200，耗時 308／609／303ms，hasSession 均 true；anonymous manual authorize HTTP 301／341ms，可讀到 sony-web 轉址，無 code。四組完成、獎盃請求 0、沒有 token 交換或標記變更。官方庫 9 次解碼、2 次已購買回應、48 筆原始列、解析錯誤 0。
- 排除所有 Fetch／manual 請求皆失效的推論；匿名的 Sony 網站轉址可讀，不等於帶登入資料的授權成功，也沒驗證 App 專用 URI。v0.4.1 的帶登入資料 authorize 仍是 network／408；Cookie 實際處理與 App URI 的差異尚未分開證實，不直接定因 Chrome／Tampermonkey。
- 已核對 psn-api 授權原始碼與 Tampermonkey 文件：前者從 App 專用 Location 取得 code，後者 manual 強制使用 Fetch。需先取得能分離該差異的證據或已驗證的同環境解法，再改正式授權；不要要求使用者重跑相同四組，或以更改白金批次、擴大權限處理。僅保留 Tampermonkey 的限制不變，免助手同步尚未修通。
- 本輪為文件變更：核對原始報告數值、文件連結與 git diff --check；沒有重跑程式測試。先前 163 項合成測試通過不代表 Sony 授權成功。下方「待提供 v0.4.2 報告」為歷史快照，已由本節取代。

## 2026-10-19 v0.4.2 傳輸對照：只保留 Tampermonkey

- 使用者已回覆「希望只保留 Tampermonkey 腳本」。不新增擴充套件、公開授權代理、常駐助手；正式直接授權仍未成功，不宣稱這版已修通。
- 整合腳本升 v0.4.2，新增「檢查瀏覽器連線（不改資料）」：手動最多 4 個 Sony 控制請求（一般／Fetch／manual 的 ssocookie，以及 anonymous manual authorize），不交換 token、不查獎盃、不連 loopback、不回傳標記或寫存檔。各組一次，network 可繼續下一個不同對照；401／403／429、取消停止後續派送。
- 輸出為 ps-game-base-auth-checks-日期_時分.json，沿用 probe kind，authMethod 為 browser-transport-check，checks 含 transport／狀態／時間／安全布林與重新導向分類。原始登入回應只即時判斷格式，不持久化、不顯示憑證。complete 代表檢查跑完，不代表授權成功。
- 163 項完整 Node 測試通過，涵蓋傳輸組別差異、隱私、固定目的地／最大次數、無自動啟動／助手／獎盃寫入、限流與停止；語法／差異檢查通過；獨立 4177 的真實瀏覽器以合成回應確認新增按鈕、鍵盤啟動、四組結果、完成後可匯出、本機助手計數 0。臨時驗證頁已刪除；不是 Sony 實測。下一步由 Chrome 更新 v0.4.2、重開官方白金分頁、手動跑此診斷再提供結果。
- 基準 HEAD d67d3cd（main）。此輪變更限本次診斷 userscript／tests、index 提示與文件；資源版號另透過既有工具統一換為 20261019-2，避免安裝入口快取。未 commit／push；私人報告未加入 repo。

## 2026-10-19 直接授權實測失敗與下一步

- 使用者提供 v0.4.1 真實診斷，Tampermonkey 5.5.1：sony-session HTTP 200／326ms；sony-access-code network／408／576ms、failed-to-fetch，explicitSessionCookie: true，無 Location／code；沒有 token 交換，獎盃請求為 0。官方庫捕捉 14 次解碼、4 次已購買回應、96 筆原始列，解析錯誤 0。原始私人 JSON 未加入 Git。
- 這證明直接模式尚未成功，不能把舊助手成功算作 v0.4.1 驗收。GM cookie 選項有設定，不等於已證明 Cookie 送達／Sony 接受；network callback 的 408 不等於已確認 Sony HTTP 逾時。沒有足夠證據歸因 Chrome、Tampermonkey、憑證或 Sony。
- 本次只記錄實測，未再改正式授權、分類或速度；未修改瀏覽器設定，也不要求反覆重登。已詢問使用者是否接受專用 Chrome 擴充套件以研究回應標頭／重新導向事件，或必須只保留 Tampermonkey；使用者隨後選擇只保留 Tampermonkey，尚未開發／安裝擴充套件，不能宣稱該替代路徑已成功。
- 本次基準 HEAD `d67d3cd`（main），快取版號修正已是目前 HEAD；開始讀取時存在其他工作中的快取修改，隨後由外部操作提交，本輪沒有還原／覆寫它們。此輪只有 AGENTS 與兩份研究／交接文件修改，未 commit／push。
- 文件驗證核對實際報告數值、來源連結及 git diff --check；本輪沒有程式變更，因此未重跑完整合成測試。先前的 157／159 項通過仍不代表 Sony 授權成功。

## 2026-10-19 JS／CSS 快取版本

- 基準 HEAD `36332c5`（main）；使用者已自行推送前次提交。新 HTML 混用舊 app.js 的情境已重現：舊版綁定已移除的 mobile-settings 時中斷，後續資料操作按鈕無事件；使用者確認強制重新整理後恢復。
- `dist/index.html` 的本機 JS／CSS（含腳本安裝連結）及 app／sync／platinum 的模組相依網址統一加上 `?v=20261019-1`。新增 `tools/version-assets.mjs`，保留其他查詢參數與 fragment，略過外部 URL，不修改 userscript 本文或其 metadata 版本。
- Pages 發布前自動以 `$GITHUB_SHA` 更新同組資源網址，之後每筆新提交部署都會換版；直接發布 dist 前可執行 `node tools/version-assets.mjs <新版本號>`。不新增套件、打包步驟或改動本機資料格式。
- 完整 Node 測試 159 項通過，包含跨層模組、重複執行、換版、外部來源及 userscript 保留；語法與 diff 檢查通過。獨立來源 `127.0.0.1:4181` 的真實瀏覽器確認 JS／CSS 帶一致版號、模組初始化並完成 render，無 console error／warning。使用者已要求提交及推送；最終提交與遠端狀態以 Git 核對，Pages 實際發布須待部署後另行驗收。

## 2026-10-19 免助手直接授權修正（待 Chrome 驗收）

- 使用者覺得每次開 PowerShell 麻煩，要求整合腳本直接完成白金同步。v0.4.1 正式按鈕不再呼叫本機助手，改用 GM `cookie` 選項向固定 Sony authorize 端點傳 NPSSO，manual redirect 嚴格驗證 code，再直接交換 token（token POST 也 manual）；不新增 connect／grant、不自動回退 localhost。
- 先前 v0.1.3 手動 Cookie 標頭與 v0.1.4 依賴 jar 均失敗，v0.4.1 改管理器 cookie 專用選項。這是針對兩種 transport 與成功 Node 路徑差異的候選修正，不能視為已確認根因或 Sony／Chrome 成功。
- 授權診斷增加 explicitSessionCookie 布林，官方白金面板提供「匯出授權診斷」；失敗送 auth 階段碼給管理頁，提示確認官方登入，不要求貼憑證。原有兩批並行、標記規則、備份與失敗整輪不套用均保留。
- 舊研究助手與 benchmark 仍保留明確選用方式；正式同步不需要啟動助手。UI、README 與最新操作說明已更新；下方舊章節是歷史快照。
- 完整 Node 測試 157 項通過：含全程不連 loopback、Cookie 僅發往 Sony authorize、失敗不回退、不發獎盃請求、不匯出憑證。語法／diff 檢查通過；獨立 4177 合成授權失敗頁確認請求 2、本機助手 0、明確 cookie 為 true、失敗提示與匯出授權診斷可見，非 Sony 實測。
- 12:41:17 發現腳本被寫回 v0.4.0 助手流程，而 app／index／測試／文件仍是 v0.4.1；已將當時原檔保存於工作區外的視覺驗證資料夾，保留現場後重套本次必要修正。程序列表未能證明寫入者；未歸因特定編輯器。再次核對磁碟、HTTP 回應與完整測試，不使用 restore／discard。
- 基準 HEAD 仍為 `3fa7054`，main；前次 benchmark／整合及本次授權修改都尚未 commit／push。已請使用者 Chrome 安裝 v0.4.1、停用獨立舊腳本、重開官方分頁並直接點白金同步；結果仍待回覆。

## 2026-10-19 納入實測、單一腳本與資料面板

- 實際報告 v0.3.0 完整完成：24 個版本；單次 10／15 個各 HTTP 400。四組每批 5 個皆 HTTP 200、結果一致；循序 350ms 4.003 秒、循序零間隔 2.480 秒、兩批並行 1.822 秒、三批並行 1.892 秒。無 429。報告含私人資料，不加入 repo。
- 使用者授權優化後，整合腳本 v0.4.0 正式白金同步改為每批 5 個、兩批並行、零間隔。進度依已完成版本累加；一般錯誤停止派送、等待在途結束，整輪不套用；取消中止在途，不重試。1,800 個版本約 1 分 59 秒僅為短測粗估，非全庫實測。
- 唯一安裝檔 `dist/scripts/ps-game-base.user.js`：沿用原遊戲庫名稱／namespace，新增既有獎盃所需 grant／固定 connect。舊 `ps-game-base-trophy-probe.user.js` 已移除；使用者須更新遊戲庫腳本並停用／移除已安裝的獨立獎盃腳本。助手仍需同電腦啟動。
- 兩種資料操作保留獨立狀態、origin／child／session 驗證及資料格式；遊戲庫在新增 grant 後使用 unsafeWindow 觀察官方請求。一般官方頁只有遊戲庫入口，手動點「獎盃研究工具」才展開研究面板；白金橋接分頁不掛載遊戲庫面板。
- 網頁右上角只留「資料與同步」入口；面板先腳本資訊，接著更新與同步、匯入與匯出、Google Drive。既有比較、訊息、復原與個人資料保護流程保留。
- 基準 HEAD `3fa7054`（main）。包含上次尚未提交的 benchmark 與本次整合優化；本次未獲 commit／push 指示。變更涉及 AGENTS、README、HANDOFF／獎盃文件、app／index／style、整合腳本、刪除獨立獎盃腳本及相關測試。驗證最終結果以下方更新為準。
- 驗證：完整 Node 測試 154 項通過，0 失敗／跳過；包含兩批並行、回應順序不同、錯誤／取消停止後續派送、既有資料保留、面板入口與完整整合腳本的 unsafeWindow 回傳。語法及 diff 檢查通過。
- 瀏覽器：獨立 `127.0.0.1:4177` 驗證桌面及 390px iframe 窄版面、面板內操作訊息、單一安裝入口；另以真正整合腳本及 24 個合成版本驗證遊戲庫／研究工具切換、鍵盤返回、候選讀取與背景獎盃請求為 0。臨時頁已刪除。未驗證更新後的 Chrome／Tampermonkey、Sony 全庫或 Google Drive；不以合成測試代替真實帳號驗收。

以下為先前各階段快照；其中腳本版本／路徑與「待收到報告」已由上述最新記錄取代。

## 2026-10-19 獎盃容量與速度測試

- 使用者要求實測單次 10／15 個是否仍失敗，以及加速分批。獎盃腳本升至 v0.3.0，新增獨立效能測試按鈕；正式白金同步仍為每批 5 個、循序 350ms，不自動更改速度或整理資料。
- 取前 15–30 個候選，先用每批 5 個建立基準，再測 10／15 個，與循序零間隔、2／3 批並行對照。最多 26 個獎盃請求，另 3 個授權步驟；組別間冷卻 1 秒。無背景掃描、失敗重試或雲端寫入。
- 除 HTTP 及耗時，也比對已知獎盃組與已取得白金數；把可對應 ID 放在大請求尾端，避免 HTTP 200 但只處理前 5 個被當成成功。尾端無可用對應時標記證據不足。
- 429／401／403／網路或取消停止後續請求；在途最多 3 個可稍後結束。匯出 benchmark JSON 含部分結果、HTTP、最大並行數、耗時、一致性與 1,800 個版本的粗估，不含憑證或原始回應。
- 工作基準 `3fa7054`（main）。本次尚未 commit／push；變更為 `AGENTS.md`、README、交接／獎盃說明、`dist/index.html` 腳本版本提示、獎盃 userscript 及對應測試。原始 tampermonkey-scripts repo 不動。
- 合成測試涵蓋 400 拒絕、200 靜默截斷、沒有尾端對應、不超過 3 個 workers、最多 26 次、限流／授權失效、停止及敏感資料排除。Sony 實際容量與加速結果仍待使用者 Chrome 報告；不能以 mock 或文件宣稱已實測成功。
- 完整 Node 測試 147 項通過；另以獨立的合成回應頁面在內建瀏覽器驗證按鈕、執行中的停用狀態、完成摘要、容量拒絕及 4 組速度結果。臨時 UI 驗證頁已刪除，不納入發布，也不代表 Sony 實測。
- 助手已於本次啟動供測試（15 分鐘後停止接收連線）。下一步由 Chrome 更新 v0.3.0、重新整理官方頁、按效能測試並匯出 JSON，再依實際結果決定正式同步速度。

## 2026-10-19 匯出檔名補時分

- 管理頁所有 JSON 匯出、數位庫腳本 JSON／CSV、獎盃測試 JSON 的檔名統一採瀏覽器本機時間 `YYYY-MM-DD_HH-mm`，例如 `ps-game-base-backup-2026-10-19_14-35.json`。使用安全分隔符，不含 Windows 禁用的冒號。
- 數位庫腳本更新至 v0.2.3、白金／獎盃腳本至 v0.2.1；已安裝的 Tampermonkey 腳本須更新才會採用新檔名。原始 tampermonkey-scripts repo 不動。
- 僅改下載命名與版本資訊，JSON 內 ISO 時間、資料內容、分類、同步及 Drive 檔名不變；與白金同步功能一併依使用者要求提交並推送 main，結果以 Git 遠端核對為準。
- 驗證：三個匯出入口的時間格式與補零檢查、語法及 diff 檢查通過，完整 Node 測試仍為 141 項通過。

## 2026-10-19 手動同步白金標記

- 使用者已確認需求並授權實作：以現有有效數位庫作品為範圍，任一已知 PS4／PS5 版本已取得白金即補標；保留既有白金、未對應及尚未白金項目。可取代追蹤／忽略，其他整理資料不動。
- 使用者提供 v0.1.5 真實測試報告，`complete: true`，本機助手授權及三個獎盃 API 全數 HTTP 200，證實這條授權與查詢路徑可行。私人報告不加入 repo。
- 新版 v0.2.0 沿用同一獎盃腳本，新增 manager 橋接模式；按「同步白金標記」才開官方分頁、指定 ID 並分批查詢。正式數位庫腳本維持 v0.2.2，不需變更；研究模式仍可使用。
- 正向結果只更新作品 `status: 已白金` 與 `updatedAt`，保留其他欄位、legacy records 與原始庫。操作前備份、跨分頁防覆寫、來源／session／ID 驗證均保留；不寫 Drive。取消或一般錯誤不套用，404 批次略過。
- 有效範圍依現有庫的 `missingIds`／`isActive` 判斷，不新增商品或目錄查詢，不改既有清單顯示。現有資料無可靠對應的版本不以名稱硬配；同組歷史版本可識別仍有有效授權作品的白金。
- 本次提交前基準 `7f2e679`（main）。提交包含：`AGENTS.md`、`README.md`、本交接文件、`docs/trophy-probe.md`、`dist/app.js`、`dist/index.html`、`dist/platinum.js`、數位庫與獎盃 userscript、`tests/platinum.test.mjs`、`tests/sync-ui.test.mjs`、`tests/trophy-probe.test.cjs`。新提交 hash 以 `git log -1` 核對。
- 完整 Node 測試 **141 項通過，0 失敗、0 跳過**；包含跨版本補標、未對應／已白金不動、metadata 保留、授權與批次、可信訊息、停止、錯誤、儲存失敗與重新載入。全部使用合成資料。
- 真實瀏覽器以獨立來源 `127.0.0.1:4177` 檢查按鈕、空庫不啟動、示範模式不啟動、設定對話框的腳本入口與助手說明。2026-10-19 使用者另完成新版 Chrome／Tampermonkey 同步操作，回覆「完成，看到新增白金筆數」，作為實際帳號回傳與同步完成的驗收紀錄；未提供具體筆數。
- 本次功能已實作並獲使用者回報同步完成，使用者後續已要求 commit／push。日後使用白金功能至少需 v0.2.0；目前最新 v0.2.1 另含匯出檔名時分。須啟動同電腦 4176 助手（15 分鐘後停止接收連線）；程式碼更新不會自動更新 Tampermonkey。

## 2026-10-18 遊戲庫全量顯示

- 移除原本每頁 48 部作品的限制與上一頁／下一頁控制，搜尋、篩選及排序結果全部顯示，可連續向下捲動；封面仍使用原生延遲載入。
- 「選取全部結果」選取目前符合條件的所有作品，仍可跨篩選保留選取、批次分類與取消選取。
- 本次提交範圍：`dist/app.js`、`dist/index.html`、`dist/style.css`、`tests/sync-ui.test.mjs`、`README.md`、`docs/HANDOFF.md`。使用者已要求 commit／push；提交後未提交清單與部署結果須以實際 Git／Actions 核對。
- 新增兩項合成 DOM 回歸測試，涵蓋 125 部作品全量顯示、搜尋／平台篩選、無結果、跨篩選全選及批次儲存。完整測試 **126 項通過，0 失敗**。
- 本機無可用的 `npm`；Node v24 需展開測試檔名：`$testFiles = @(rg --files tests | Where-Object { $_ -match '\.test\.(mjs|cjs|js)$' }); node --test @testFiles`。沙箱內助手測試因 loopback `EACCES` 失敗，沙箱外完整重跑全部通過。
- 真實瀏覽器使用獨立來源 `http://127.0.0.1:4177/` 及 1,001 部合成作品，確認卡片全數存在、可捲到最後一部、全選 1,001 部、平台篩選 501 部、搜尋末端作品、無結果提示、快捷分類滑入／移出、選取／再次取消、鍵盤方向鍵、重新載入保留分類及匯入對話框回饋。
- 卡點與下一步：本次需求已完成；未以私人全庫或手機觸控驗收，外部 Sony／Google 服務不在本次驗證範圍。依使用者指示提交並推送 main，之後檢查 Pages Actions。

## 先看這裡

- 遊戲庫、分類、版本合併、JSON／Drive 差異比較已有實作；程式直接位於 `dist/`，沒有建置步驟。
- 本機助手模式已取得真實獎盃結果；最新版 **0.3.0** 已加入管理頁手動補標白金，使用者已回報 Chrome 同步完成並看到新增白金筆數。瀏覽器直接授權路徑仍未驗證成功。
- **獎盃腳本、助手、對應測試及說明隨本次交接提交納入版本管理。** 新電腦取得本次提交後即可接續；最新 hash 請以 `git log -1` 核對。
- 更換電腦還需要另行搬移個人 JSON；Git 不包含瀏覽器存檔、Chrome／Sony 登入狀態或已安裝的 Tampermonkey 版本。

## Git 快照

| 項目 | 交接時狀態 |
| --- | --- |
| 本機 repo | `D:\gitp\ps-game-base` |
| 分支 | `main` |
| 本次工作基準 HEAD | `7f2e679` |
| 基準提交 | `feat: 移除遊戲庫分頁並全量顯示作品` |
| origin | `https://github.com/promise82114/ps-game-base.git` |
| 遠端／部署 | 本次已獲授權提交並推送 main；Git 遠端提交與 Pages 部署結果分別核對 |

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
| `dist/scripts/ps-game-base.user.js` | 正式遊戲庫撈取副本，v0.2.3 |
| `dist/scripts/ps-game-base-trophy-probe.user.js` | v0.3.0，手動白金同步及獨立獎盃研究 |
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

## 獎盃研究進度與卡點（2026-10-17 歷史快照）

本節保留初次研究的背景；2026-10-19 的成功結果與新功能請以文件頂端為準。

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

正式同步安裝本 repo 的 `dist/scripts/ps-game-base.user.js` **0.2.3**；白金同步／獎盃研究另安裝 `dist/scripts/ps-game-base-trophy-probe.user.js` **0.3.0**。磁碟檔更新不會自動讓 Tampermonkey 採用新版，須更新已安裝腳本並重新整理 Sony 頁面。自行在 Chrome 登入 Sony，不複製／索取 Cookie 或 token。

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
