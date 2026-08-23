# 課刻｜學生備忘錄

課刻是一款離線優先、為學生設計的備忘錄與待辦 App。首頁會直接列出「目前待辦」，不用進入多層頁面就能新增、查看與完成事項。

## 主要功能

- 快速新增筆記，支援標題、內容、自動儲存與語音輸入
- 課程、分類、標籤、顏色、置頂、封存與最近查看
- 搜尋標題與內容，並依日期、分類與標籤篩選
- 待辦、截止日期、子任務，以及今天到期、三天內到期與逾期狀態
- 指定時間、每日或每週重複提醒，以及到達地點提醒
- 圖片、拍照、錄音、手寫、附件、網址與勾選清單
- JSON 匯出、匯入與系統分享備份

## 支援平台

- Web / PWA
- Android（Capacitor）
- Windows 桌面啟動包

安裝檔不放進 Git 紀錄；每個版本的 APK 與 Windows ZIP 應放在 GitHub Releases，方便下載並避免原始碼儲存庫持續膨脹。

## 本機啟動

需要 Node.js 20 以上版本。

```powershell
npm.cmd install
npm.cmd run dev
```

## 測試與建置

```powershell
npm.cmd test
npm.cmd run build
```

Windows 桌面版：

```powershell
npm.cmd run desktop:build
```

Android Debug APK：

```powershell
npm.cmd run android:debug
```

## 資料與提醒

- 筆記與附件預設儲存在目前裝置的本機儲存空間。
- 設定頁可匯出 JSON，並透過系統分享選單存到雲端硬碟。
- Android 版會使用原生本機通知；網頁版的提醒會在 App 開啟時檢查。
- 單一附件限制 3 MB，避免塞滿儲存空間。
