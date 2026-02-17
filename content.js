// 右クリックされたテキストエリアを記憶
let lastRightClickedElement = null;

document.addEventListener("contextmenu", (e) => {
  const target = e.target;
  if (
    target.tagName === "TEXTAREA" ||
    (target.tagName === "INPUT" && target.type === "text") ||
    target.isContentEditable
  ) {
    lastRightClickedElement = target;
  }
});

// ローディング用のスタイルを事前にページに追加
const yakurekiStyle = document.createElement("style");
yakurekiStyle.textContent = `
  #yakureki-loading-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.85);
    z-index: 2147483647;
    border-radius: 4px;
    pointer-events: none;
    position: fixed;
  }
  .yakureki-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #e0e0e0;
    border-top: 3px solid #4285f4;
    border-radius: 50%;
    animation: yakureki-spin 0.8s linear infinite;
  }
  .yakureki-loading-text {
    margin-top: 8px;
    font-size: 13px;
    color: #333;
    font-family: sans-serif;
  }
  @keyframes yakureki-spin {
    to { transform: rotate(360deg); }
  }
`;
document.documentElement.appendChild(yakurekiStyle);

// background.jsからのメッセージを処理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "getTextareaValue":
      if (lastRightClickedElement) {
        const value = lastRightClickedElement.isContentEditable
          ? lastRightClickedElement.innerText
          : lastRightClickedElement.value;

        // 1. まず #left から過去データを取得（支Bの記述は除外する）
        let pastData = "";
        const leftEl = document.getElementById("left");
        if (leftEl) {
          const rawPast = leftEl.innerText || leftEl.textContent || "";
          pastData = rawPast.split("\n").filter(line => !line.includes("支B")).join("\n");
        }

        // 2. 次に #this-time から処方内容を取得し、支Bフラグを判定
        let prescription = "";
        let hasShiB = false;
        const thisTimeEl = document.getElementById("this-time");
        if (thisTimeEl) {
          prescription = thisTimeEl.innerText || thisTimeEl.textContent || "";
          hasShiB = /支B/.test(prescription);
        }

        console.log("[薬歴AI] hasShiB:", hasShiB, "prescription:", prescription.substring(0, 100));

        sendResponse({ value, prescription: prescription.trim(), pastData: pastData.trim(), hasShiB });
      } else {
        sendResponse({ value: null });
      }
      return true;

    case "setTextareaValue":
      if (lastRightClickedElement) {
        if (lastRightClickedElement.isContentEditable) {
          lastRightClickedElement.innerText = message.value;
        } else {
          // Reactなどのフレームワーク対応のためネイティブsetterを使用
          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, "value"
          )?.set || Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value"
          )?.set;

          if (nativeSetter) {
            nativeSetter.call(lastRightClickedElement, message.value);
          } else {
            lastRightClickedElement.value = message.value;
          }

          // input/changeイベントを発火してフレームワークに変更を通知
          lastRightClickedElement.dispatchEvent(new Event("input", { bubbles: true }));
          lastRightClickedElement.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      hideLoading();
      sendResponse({ success: true });
      return true;

    case "showLoading":
      showLoading();
      sendResponse({ success: true });
      return true;

    case "hideLoading":
      hideLoading();
      sendResponse({ success: true });
      return true;

    case "showError":
      hideLoading();
      showNotification(message.message, "error");
      sendResponse({ success: true });
      return true;
  }
});

function showLoading() {
  if (!lastRightClickedElement) return;

  // 既存のオーバーレイを除去
  hideLoading();

  const rect = lastRightClickedElement.getBoundingClientRect();

  const overlay = document.createElement("div");
  overlay.id = "yakureki-loading-overlay";
  overlay.style.top = rect.top + "px";
  overlay.style.left = rect.left + "px";
  overlay.style.width = rect.width + "px";
  overlay.style.height = rect.height + "px";
  overlay.innerHTML = `
    <div class="yakureki-spinner"></div>
    <div class="yakureki-loading-text">AIがブラッシュアップ中...</div>
  `;

  document.body.appendChild(overlay);
}

function hideLoading() {
  const overlay = document.getElementById("yakureki-loading-overlay");
  if (overlay) overlay.remove();
}

function showNotification(message, type = "info") {
  // 既存の通知を消す
  const existing = document.getElementById("yakureki-notification");
  if (existing) existing.remove();

  const notification = document.createElement("div");
  notification.id = "yakureki-notification";
  const bgColor = type === "error" ? "#f44336" : "#4285f4";
  notification.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    background: ${bgColor};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-family: sans-serif;
    z-index: 2147483647;
    max-width: 400px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 4000);
}
