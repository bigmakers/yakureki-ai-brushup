const apiKeyInput = document.getElementById("apiKey");
const apiKeyLabel = document.getElementById("apiKeyLabel");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");
const modelToggle = document.getElementById("modelToggle");
const modelHint = document.getElementById("modelHint");
const apiLinkAnchor = document.getElementById("apiLinkAnchor");
const apiLink = document.getElementById("apiLink");
const providerBtns = document.querySelectorAll(".provider-btn");
const focusChecks = document.querySelectorAll(".focus-check");
const focusComment = document.getElementById("focusComment");
const volumeBtns = document.querySelectorAll(".volume-btn");
const volumeHint = document.getElementById("volumeHint");
const ollamaModelArea = document.getElementById("ollamaModelArea");
const ollamaModelToggle = document.getElementById("ollamaModelToggle");
const fetchModelsBtn = document.getElementById("fetchModelsBtn");

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
  },
  ollama: {
    models: [],
    placeholder: "http://localhost:11434",
    linkUrl: "",
    linkText: ""
  }
};

let selectedProvider = "gemini";
let selectedModel = "gemini-flash";
let selectedVolume = 70;
let ollamaModels = [];

// APIキーはプロバイダーごとに保存する
let apiKeys = {};

// 保存済みの設定を読み込み
chrome.storage.sync.get(["aiProvider", "aiModel", "apiKeys", "focusItems", "focusComment", "outputVolume"], (data) => {
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
  // 情報量の復元
  if (data.outputVolume) {
    selectedVolume = data.outputVolume;
  }
  updateVolumeButtons();

  if (apiKeys[selectedProvider]) {
    showStatus("設定済み", "success");
  }

  // Ollamaで既にURLが設定されていたら自動でモデル一覧を取得
  if (selectedProvider === "ollama" && apiKeys["ollama"]) {
    fetchOllamaModels();
  }
});

// プロバイダー切り替え
providerBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    selectedProvider = btn.dataset.provider;
    const prov = PROVIDERS[selectedProvider];
    if (prov.models.length > 0) {
      selectedModel = prov.models[0].id;
    }
    updateProviderUI();
    updateModelButtons();
    loadApiKey();
  });
});

function updateProviderUI() {
  const isOllama = selectedProvider === "ollama";

  providerBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.provider === selectedProvider);
  });

  const prov = PROVIDERS[selectedProvider];
  apiKeyInput.placeholder = prov.placeholder;
  apiKeyInput.type = isOllama ? "text" : "password";
  apiKeyLabel.textContent = isOllama ? "Ollama URL" : "APIキー";

  if (isOllama) {
    apiLink.style.display = "none";
  } else {
    apiLink.style.display = "";
    apiLinkAnchor.href = prov.linkUrl;
    apiLinkAnchor.textContent = prov.linkText;
  }
}

function updateModelButtons() {
  const prov = PROVIDERS[selectedProvider];
  const isOllama = selectedProvider === "ollama";

  modelToggle.innerHTML = "";

  if (isOllama) {
    modelToggle.style.display = "none";
    ollamaModelArea.style.display = "";
    renderOllamaModelButtons();
    return;
  }

  modelToggle.style.display = "";
  ollamaModelArea.style.display = "none";

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

function renderOllamaModelButtons() {
  ollamaModelToggle.innerHTML = "";

  if (ollamaModels.length === 0) {
    modelHint.textContent = "「モデル一覧を取得」を押してください";
    return;
  }

  ollamaModels.forEach(name => {
    const btn = document.createElement("button");
    btn.type = "button";
    const shortName = name.replace(/:latest$/, "");
    btn.className = "model-btn" + (name === selectedModel ? " active" : "");
    btn.textContent = shortName;
    btn.title = name;
    btn.addEventListener("click", () => {
      selectedModel = name;
      ollamaModelToggle.querySelectorAll(".model-btn").forEach(b => {
        b.classList.toggle("active", b.title === name);
      });
      modelHint.textContent = name;
    });
    ollamaModelToggle.appendChild(btn);
  });

  modelHint.textContent = ollamaModels.includes(selectedModel) ? selectedModel : "モデルを選択してください";
}

function fetchOllamaModels() {
  const baseUrl = (apiKeyInput.value.trim() || "http://localhost:11434").replace(/\/+$/, "");

  fetchModelsBtn.disabled = true;
  fetchModelsBtn.textContent = "取得中...";
  modelHint.textContent = "";

  chrome.runtime.sendMessage({ action: "fetchOllamaModels", baseUrl }, (response) => {
    fetchModelsBtn.disabled = false;
    fetchModelsBtn.textContent = "モデル一覧を取得";

    if (response && response.success) {
      ollamaModels = response.models;
      if (ollamaModels.length === 0) {
        modelHint.textContent = "モデルが見つかりません。ollama pull でモデルを追加してください";
      } else {
        if (!ollamaModels.includes(selectedModel)) {
          selectedModel = ollamaModels[0];
        }
        renderOllamaModelButtons();
      }
    } else {
      modelHint.textContent = "取得失敗: " + (response?.error || "Ollamaに接続できません");
    }
  });
}

fetchModelsBtn.addEventListener("click", fetchOllamaModels);

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
  const isOllama = selectedProvider === "ollama";

  if (isOllama) {
    apiKeys[selectedProvider] = key || "http://localhost:11434";
    if (!selectedModel || ollamaModels.length === 0 || !ollamaModels.includes(selectedModel)) {
      showStatus("モデルを選択してください", "error");
      return;
    }
  } else {
    if (!key) {
      showStatus("APIキーを入力してください", "error");
      return;
    }
    apiKeys[selectedProvider] = key;
  }

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
    focusComment: focusComment.value.trim(),
    outputVolume: selectedVolume
  }, () => {
    const provNames = { gemini: "Gemini", openai: "OpenAI", claude: "Claude", ollama: "Ollama" };
    const provName = provNames[selectedProvider] || selectedProvider;
    if (isOllama) {
      const shortModel = selectedModel.replace(/:latest$/, "");
      showStatus("保存: " + provName + " " + shortModel, "success");
    } else {
      const current = PROVIDERS[selectedProvider].models.find(m => m.id === selectedModel);
      showStatus("保存: " + provName + " " + (current ? current.label : ""), "success");
    }
  });
});

// 情報量ボタン
const volumeHints = {
  50: "少なめ：最小限の要点のみ記載",
  70: "標準：要点を絞って簡潔に記載",
  100: "多め：詳細に記載"
};

volumeBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    selectedVolume = parseInt(btn.dataset.volume);
    updateVolumeButtons();
  });
});

function updateVolumeButtons() {
  volumeBtns.forEach(btn => {
    btn.classList.toggle("active", parseInt(btn.dataset.volume) === selectedVolume);
  });
  volumeHint.textContent = volumeHints[selectedVolume] || "";
}

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = "status " + type;
}

// ログセクション
const downloadLogBtn = document.getElementById("downloadLogBtn");
const clearLogBtn = document.getElementById("clearLogBtn");
const logStatusEl = document.getElementById("logStatus");

downloadLogBtn.addEventListener("click", () => {
  chrome.storage.local.get(["logs"], (data) => {
    const logs = data.logs || [];
    if (logs.length === 0) {
      logStatusEl.textContent = "ログがありません";
      logStatusEl.className = "status error";
      return;
    }
    const json = JSON.stringify(logs, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const now = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = url;
    a.download = `yakureki-log-${now}.json`;
    a.click();
    URL.revokeObjectURL(url);
    logStatusEl.textContent = `${logs.length}件のログをダウンロードしました`;
    logStatusEl.className = "status success";
  });
});

clearLogBtn.addEventListener("click", () => {
  if (confirm("ログをすべて削除しますか？")) {
    chrome.storage.local.set({ logs: [] }, () => {
      logStatusEl.textContent = "ログをクリアしました";
      logStatusEl.className = "status success";
    });
  }
});

// プロンプト更新セクション
const fetchPromptsBtn = document.getElementById("fetchPromptsBtn");
const fetchStatusEl = document.getElementById("fetchStatus");
const promptVersionEl = document.getElementById("promptVersion");
const promptFetchedAtEl = document.getElementById("promptFetchedAt");

// 保存済みのプロンプトメタ情報を表示
chrome.runtime.sendMessage({ action: "getPromptMeta" }, (response) => {
  if (response && response.meta) {
    promptVersionEl.textContent = response.meta.version || "不明";
    if (response.meta.fetchedAt) {
      const d = new Date(response.meta.fetchedAt);
      promptFetchedAtEl.textContent = d.toLocaleString("ja-JP");
    }
  }
});

fetchPromptsBtn.addEventListener("click", () => {
  fetchPromptsBtn.disabled = true;
  fetchPromptsBtn.textContent = "読み込み中...";
  fetchStatusEl.textContent = "";
  fetchStatusEl.className = "status";

  chrome.runtime.sendMessage({ action: "fetchPrompts" }, (response) => {
    fetchPromptsBtn.disabled = false;
    fetchPromptsBtn.textContent = "最新のプロンプトを読み込む";

    if (response && response.success) {
      fetchStatusEl.textContent = "v" + response.meta.version + " を取得しました";
      fetchStatusEl.className = "status success";
      promptVersionEl.textContent = response.meta.version;
      promptFetchedAtEl.textContent = new Date().toLocaleString("ja-JP");
    } else {
      fetchStatusEl.textContent = "取得失敗: " + (response?.error || "不明なエラー");
      fetchStatusEl.className = "status error";
    }
  });
});
