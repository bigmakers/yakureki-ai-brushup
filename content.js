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

        // 1. 前回・前々回の過去データを個別に取得（支Bの記述は除外する）
        let pastData = "";
        const filterShiB = (text) => text.split("\n").filter(line => !/支\s*[BＢb]/.test(line)).join("\n");

        const lastTimeEl = document.getElementById("last-time");
        const twoTimesBeforeEl = document.getElementById("two-times-before");

        if (lastTimeEl || twoTimesBeforeEl) {
          if (lastTimeEl) {
            const rawLastTime = lastTimeEl.innerText || lastTimeEl.textContent || "";
            pastData += "【前回の来局データ】\n" + filterShiB(rawLastTime).trim();
          }
          if (twoTimesBeforeEl) {
            const rawTwoTimesBefore = twoTimesBeforeEl.innerText || twoTimesBeforeEl.textContent || "";
            const filtered = filterShiB(rawTwoTimesBefore).trim();
            if (filtered) {
              pastData += (pastData ? "\n\n" : "") + "【前々回の来局データ】\n" + filtered;
            }
          }
        } else {
          // フォールバック：#left から一括取得
          const leftEl = document.getElementById("left");
          if (leftEl) {
            const rawPast = leftEl.innerText || leftEl.textContent || "";
            pastData = filterShiB(rawPast);
          }
        }

        // 2. 次に #this-time から処方内容を取得し、各種フラグを判定
        let prescription = "";
        let hasShiB = false;
        let hasYakuB = false;
        let hasYaku3A = false;
        let hasYaku3B = false;
        let hasYakuC = false;
        let hasFukuBHa = false;
        const thisTimeEl = document.getElementById("this-time");
        if (thisTimeEl) {
          prescription = thisTimeEl.innerText || thisTimeEl.textContent || "";

          // フラグは .mark-div 内の span に隠れている場合があるので、
          // innerText に加えて .mark-div 内の全 span テキストも収集する
          let markText = "";
          const markSpans = thisTimeEl.querySelectorAll(".mark-div span, .header-info span");
          markSpans.forEach(span => {
            markText += " " + (span.innerText || span.textContent || "");
          });

          // prescription + markText を合わせてフラグ判定
          const flagSource = prescription + " " + markText;
          console.log("[薬歴AI] markText:", markText.trim());

          hasShiB = /支\s*[BＢb]/.test(flagSource);
          hasYakuB = /薬\s*[BＢb]/.test(flagSource);
          hasYaku3A = /薬\s*[3３]\s*[AＡa]/.test(flagSource);
          hasYaku3B = /薬\s*[3３]\s*[BＢb]/.test(flagSource);
          hasYakuC = /薬\s*[CＣc]/.test(flagSource);
          hasFukuBHa = /服\s*[BＢb]\s*[ハはﾊ]/.test(flagSource);
        }

        console.log("[薬歴AI] hasShiB:", hasShiB, "hasYakuB:", hasYakuB, "hasYaku3A:", hasYaku3A, "hasYaku3B:", hasYaku3B, "hasYakuC:", hasYakuC, "hasFukuBHa:", hasFukuBHa, "prescription:", prescription.substring(0, 200));
        // デバッグ：薬・支・服を含む行を出力
        const flagLines = prescription.split("\n").filter(line => /[薬支服]/.test(line));
        if (flagLines.length > 0) console.log("[薬歴AI] フラグ関連行:", flagLines);

        sendResponse({ value, prescription: prescription.trim(), pastData: pastData.trim(), hasShiB, hasYakuB, hasYaku3A, hasYaku3B, hasYakuC, hasFukuBHa });
      } else {
        sendResponse({ value: null });
      }
      return true;

    case "setTextareaValue":
      if (lastRightClickedElement) {
        // OAP・A単独モードの場合は既存テキストに追記する
        let finalValue = message.value;
        if (message.mode === "a-only" || message.mode === "oap") {
          const currentValue = lastRightClickedElement.isContentEditable
            ? lastRightClickedElement.innerText
            : lastRightClickedElement.value;
          if (currentValue && currentValue.trim()) {
            finalValue = currentValue.trimEnd() + "\n\n" + message.value;
          }
        }

        if (lastRightClickedElement.isContentEditable) {
          lastRightClickedElement.innerText = finalValue;
        } else {
          // Reactなどのフレームワーク対応のためネイティブsetterを使用
          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, "value"
          )?.set || Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value"
          )?.set;

          if (nativeSetter) {
            nativeSetter.call(lastRightClickedElement, finalValue);
          } else {
            lastRightClickedElement.value = finalValue;
          }

          // input/changeイベントを発火してフレームワークに変更を通知
          lastRightClickedElement.dispatchEvent(new Event("input", { bubbles: true }));
          lastRightClickedElement.dispatchEvent(new Event("change", { bubbles: true }));
        }

        // Pセクションから「？」で終わる行を抽出して #sent-matter-textarea にペースト
        try {
          const outputText = message.value;
          // P（計画）セクションを抽出（Pから次のセクションやハイリスク薬、または末尾まで）
          const pMatch = outputText.match(/(?:【P】|P[（(]計画[）)])\s*\n([\s\S]*?)(?=\n(?:ハイリスク薬|【[SOA]】|S[（(]|O[（(]|A[（(])|\s*$)/);
          let questionLines = [];
          if (pMatch) {
            const pContent = pMatch[1];
            questionLines = pContent.split("\n")
              .map(line => line.replace(/^[-・\s]+/, "").trim())
              .filter(line => line.endsWith("？") || line.endsWith("?"));
          }

          if (questionLines.length > 0) {
            const sentMatterEl = document.querySelector("#sent-matter-textarea");
            if (sentMatterEl) {
              const questionText = questionLines.join("\n");
              console.log("[薬歴AI] 申し送り事項に記載:", questionText);

              if (sentMatterEl.isContentEditable) {
                sentMatterEl.innerText = questionText;
              } else {
                const sentNativeSetter = Object.getOwnPropertyDescriptor(
                  window.HTMLTextAreaElement.prototype, "value"
                )?.set || Object.getOwnPropertyDescriptor(
                  window.HTMLInputElement.prototype, "value"
                )?.set;

                if (sentNativeSetter) {
                  sentNativeSetter.call(sentMatterEl, questionText);
                } else {
                  sentMatterEl.value = questionText;
                }

                sentMatterEl.dispatchEvent(new Event("input", { bubbles: true }));
                sentMatterEl.dispatchEvent(new Event("change", { bubbles: true }));
              }
            } else {
              console.log("[薬歴AI] #sent-matter-textarea が見つかりません");
            }
          }
        } catch (e) {
          console.error("[薬歴AI] 申し送り事項の抽出エラー:", e);
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
    <div class="yakureki-loading-text">AIがナビゲーション中...</div>
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
