const apiKeyInput = document.getElementById("apiKey");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");
const modelToggle = document.getElementById("modelToggle");
const modelHint = document.getElementById("modelHint");
const apiLinkAnchor = document.getElementById("apiLinkAnchor");
const providerBtns = document.querySelectorAll(".provider-btn");
const focusChecks = document.querySelectorAll(".focus-check");
const focusComment = document.getElementById("focusComment");

// プロバイダーごとの設定
const PROVIDERS = {
  gemini: {
    models: [
      { id: "gemini-flash", label: "Flash", hint: "高速・低コスト" },
      { id: "gemini-pro", label: "Pro", hint: "高精度・高コスト" }
    ],
    placeholder: "Gemini APIキーを入力",
    linkUrl: "https://aistudio.google.com/apikey",
    linkText: "Gemini APIキーを取得"
  },
  openai: {
    models: [
      { id: "gpt-4o-mini", label: "4o-mini", hint: "高速・低コスト" },
      { id: "gpt-4o", label: "4o", hint: "高精度・高コスト" }
    ],
    placeholder: "OpenAI APIキーを入力",
    linkUrl: "https://platform.openai.com/api-keys",
    linkText: "OpenAI APIキーを取得"
  },
  claude: {
    models: [
      { id: "claude-haiku", label: "Haiku", hint: "高速・低コスト" },
      { id: "claude-sonnet", label: "Sonnet", hint: "高精度・高コスト" }
    ],
    placeholder: "Anthropic APIキーを入力",
    linkUrl: "https://console.anthropic.com/settings/keys",
    linkText: "Claude APIキーを取得"
  }
};

let selectedProvider = "gemini";
let selectedModel = "gemini-flash";

// APIキーはプロバイダーごとに保存する
let apiKeys = {};

// 保存済みの設定を読み込み
chrome.storage.sync.get(["aiProvider", "aiModel", "apiKeys", "focusItems", "focusComment"], (data) => {
  if (data.apiKeys) apiKeys = data.apiKeys;
  if (data.aiProvider) selectedProvider = data.aiProvider;
  if (data.aiModel) selectedModel = data.aiModel;

  updateProviderUI();
  updateModelButtons();
  loadApiKey();

  // 重視項目の復元
  if (data.focusItems && Array.isArray(data.focusItems)) {
    focusChecks.forEach(cb => {
      cb.checked = data.focusItems.includes(cb.value);
    });
  }
  // フリーコメントの復元
  if (data.focusComment) {
    focusComment.value = data.focusComment;
  }

  if (apiKeys[selectedProvider]) {
    showStatus("設定済み", "success");
  }
});

// プロバイダー切り替え
providerBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    selectedProvider = btn.dataset.provider;
    // モデルをそのプロバイダーのデフォルト（最初）に
    selectedModel = PROVIDERS[selectedProvider].models[0].id;
    updateProviderUI();
    updateModelButtons();
    loadApiKey();
  });
});

function updateProviderUI() {
  providerBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.provider === selectedProvider);
  });

  const prov = PROVIDERS[selectedProvider];
  apiKeyInput.placeholder = prov.placeholder;
  apiLinkAnchor.href = prov.linkUrl;
  apiLinkAnchor.textContent = prov.linkText;
}

function updateModelButtons() {
  const prov = PROVIDERS[selectedProvider];
  modelToggle.innerHTML = "";

  prov.models.forEach(m => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "model-btn" + (m.id === selectedModel ? " active" : "");
    btn.textContent = m.label;
    btn.addEventListener("click", () => {
      selectedModel = m.id;
      updateModelActive();
    });
    modelToggle.appendChild(btn);
  });

  updateModelActive();
}

function updateModelActive() {
  const prov = PROVIDERS[selectedProvider];
  const btns = modelToggle.querySelectorAll(".model-btn");
  btns.forEach((btn, i) => {
    btn.classList.toggle("active", prov.models[i].id === selectedModel);
  });
  const current = prov.models.find(m => m.id === selectedModel);
  modelHint.textContent = current ? current.label + ": " + current.hint : "";
}

function loadApiKey() {
  apiKeyInput.value = apiKeys[selectedProvider] || "";
}

saveBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showStatus("APIキーを入力してください", "error");
    return;
  }

  apiKeys[selectedProvider] = key;

  // 重視項目を収集
  const focusItems = [];
  focusChecks.forEach(cb => {
    if (cb.checked) focusItems.push(cb.value);
  });

  chrome.storage.sync.set({
    aiProvider: selectedProvider,
    aiModel: selectedModel,
    apiKeys: apiKeys,
    focusItems: focusItems,
    focusComment: focusComment.value.trim()
  }, () => {
    const provName = selectedProvider === "gemini" ? "Gemini" : selectedProvider === "openai" ? "OpenAI" : "Claude";
    const current = PROVIDERS[selectedProvider].models.find(m => m.id === selectedModel);
    showStatus("保存: " + provName + " " + (current ? current.label : ""), "success");
  });
});

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = "status " + type;
}
