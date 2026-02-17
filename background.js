// コンテキストメニューの登録
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "brushup-yakureki",
    title: "薬歴をAIでブラッシュアップ",
    contexts: ["editable"]
  });
});

// コンテキストメニュークリック時の処理
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "brushup-yakureki") return;

  try {
    // content.jsからテキストエリアの内容を取得
    const [response] = await chrome.tabs.sendMessage(tab.id, {
      action: "getTextareaValue"
    }).then(r => [r]).catch(() => [null]);

    if (!response) {
      chrome.tabs.sendMessage(tab.id, {
        action: "showError",
        message: "テキストエリアの内容を取得できませんでした"
      });
      return;
    }

    // ローディング表示開始
    chrome.tabs.sendMessage(tab.id, { action: "showLoading" });

    // APIキー・プロバイダー・モデル設定を取得
    const { apiKeys, aiProvider, aiModel } = await chrome.storage.sync.get(["apiKeys", "aiProvider", "aiModel"]);
    const provider = aiProvider || "gemini";
    const model = aiModel || "gemini-flash";
    const apiKey = apiKeys?.[provider];

    if (!apiKey) {
      chrome.tabs.sendMessage(tab.id, { action: "hideLoading" });
      chrome.tabs.sendMessage(tab.id, {
        action: "showError",
        message: "APIキーが設定されていません。拡張機能のアイコンをクリックして設定してください。"
      });
      return;
    }

    // 支Bフラグ確認
    const hasShiB = response.hasShiB === true;
    console.log("[薬歴AI] 支Bフラグ:", hasShiB, "プロバイダー:", provider, "モデル:", model);

    // AIを呼び出し
    const brushedUp = await callAI(provider, model, apiKey, response.value, response.prescription || "", response.pastData || "", hasShiB);

    // 結果をテキストエリアに書き戻し
    chrome.tabs.sendMessage(tab.id, {
      action: "setTextareaValue",
      value: brushedUp
    });
  } catch (error) {
    console.error("ブラッシュアップエラー:", error);
    chrome.tabs.sendMessage(tab.id, { action: "hideLoading" });
    chrome.tabs.sendMessage(tab.id, {
      action: "showError",
      message: `エラーが発生しました: ${error.message}`
    });
  }
});

// プロンプトを組み立てる
function buildPrompt(text, prescription, pastData, hasShiB) {
  let prescriptionSection = "";
  if (prescription) {
    prescriptionSection = `
■ 今回の処方内容：
${prescription}

`;
  }

  let pastDataSection = "";
  if (pastData) {
    pastDataSection = `
■ 過去の処方・薬歴データ（#left から取得）：
${pastData}

`;
  }

  return `あなたは薬剤師向けの薬歴記録（SOAP形式）のブラッシュアップアシスタントです。
以下の薬歴内容、今回の処方内容、過去データを元に、SOAP形式で書き直してください。
薬歴内容が空の場合は、処方内容を元にSOAPを新規作成してください。
${prescriptionSection}${pastDataSection}■ まず処方内容を分析し、内服薬のみか、外用薬のみか、混在かを判断すること。
処方タイプによって以下のように書き分ける。

=== 内服薬が含まれる場合の書き方 ===

S（主観的情報）
- 患者の訴えを記載する（体調良好、特になし等）
- 前回のP（計画）の内容についても問題なかった旨を記載する

O（客観的情報）
- 客観的所見を記載する（バイタル正常、特記事項なし等）
- 処方されている内服薬からランダムに2種類を選び、それぞれの軽微な副作用を推論して、確認した情報と「なし」という結果を記載する
- 過去データがある場合、今回の処方と過去2回分の処方を比較する
- 過去2回との医薬品の一致率が50%以上であれば「定期薬」と判断し、Oに「定期処方」である旨を記載する
- 過去の処方から変更があった場合（薬の追加、削除、用量変更など）は、Oにその変更点を具体的に記載する

A（評価）
- 服薬状況良好と判断した旨を記載する
- 処方されている医薬品からランダムに1種類を選び、その薬の処方妥当性について記載する
- また、次回までの生活上気になることについて患者への問いを立てる

P（計画）
- 次回経過観察とする
- 前回のAで立てた問いに答えた形で、問題なかったことを記載する
- 処方されている医薬品からランダムに1種類を選び、次回確認すべき副作用を記載する

=== 内服薬の副作用に便秘があり、かつ便秘薬も処方されている場合の追加ルール ===
処方されている内服薬の中に副作用として便秘が考えられる薬（例：抗コリン薬、オピオイド、Ca拮抗薬、鉄剤など）があり、同時に便秘薬（センノシド、酸化マグネシウム、ピコスルファート、テレミンソフト等）も処方されている場合は、便秘の症状があると判断し、以下を追加で記載する：

S - 便秘の症状がある旨を記載する
A - 該当する内服薬の副作用として便秘が起こりうることへの注意喚起を記載する
A - 水分摂取を十分に行い、服薬を継続する旨の文言を記載する
P - 次回、便秘が悪化していないかを確認する旨を記載する

=== 外用薬のみの場合の書き方 ===

S（主観的情報）
- 患者の訴えを記載する
- 使用部位の状態について記載する（処方内容に使用部位の指示があればそれを反映する）

O（客観的情報）
- 使用部位の状態を記載する（処方内容に記載された使用部位を明記する）
- 外用薬の使用状況を記載する

A（評価）
- 処方された外用薬を塗布して様子を見る旨を記載する
- 複数の外用薬が処方されている場合は、併用に問題がない旨を記載する

P（計画）
- 次回経過観察とする
- 使用部位の状態確認を行う旨を記載する

=== 便秘薬（坐薬・頓用含む）の場合の書き方 ===
（テレミンソフト坐薬、センノシド錠、ピコスルファートナトリウム内用液など、「便秘時」の用法で処方されている薬が含まれる場合）

S（主観的情報）
- 便通に問題がある旨を記載する（排便困難、便秘気味など）

O（客観的情報）
- 便通の状況を記載する
- 過去データに他の便秘薬（酸化マグネシウム、センノシド等）が処方されている場合は、既存の便秘薬では効果不十分のため追加処方された旨を記載する

A（評価）
- 処方された便秘薬を使用して様子を見る旨を記載する

P（計画）
- 次回経過観察とする
- 便通の改善状況を確認する旨を記載する

=== 湿布・貼付薬の場合の書き方 ===
（アドフィードパップ、ロキソプロフェンテープ、モーラステープなど、貼付剤が処方されている場合）

S（主観的情報）
- 貼付部位に痛みがある旨を記載する
- 処方内容に使用部位の指示があればその部位を具体的に記載する（例：胸部、腰部、両膝など）

O（客観的情報）
- 使用部位の疼痛の状況を記載する
- 処方内容に記載された使用部位を明記する

A（評価）
- 処方された湿布薬を貼付して様子を見る旨を記載する

P（計画）
- 次回経過観察とする
- 疼痛の改善状況を確認する旨を記載する

■ 一包化に関するルール（この判定は確定済みなので従うこと）：
- 一包化: ${hasShiB ? "記載する" : "記載しない"}
${hasShiB ? "- SOAPのどこか適切な箇所に必ず以下を記載すること：\n  「一包化：心身の特性により適正な服用量を適正な服用時間に服用できないため一包化を行う」" : "- 一包化に関する記述は一切行わないこと"}

■ 注意事項：
- 処方内容に含まれる医薬品名を把握し、SOAPの内容に反映すること
- 誤字脱字を修正すること
- 医療・薬学の専門用語を適正に使用すること
- 文章は簡潔かつ明確にすること
- 改善した薬歴のみを出力すること。説明や補足は不要です。

■ 禁止事項（以下は絶対に守ること）：
- 「支B内服+2のため、」という表現は使用しない
- 「変更なし。」という表現は使用しない（変更がない場合は「前回処方から変更なく継続」など別の言い回しにすること）
- アスタリスク(*)、シャープ(#)、バッククォート(\`)などのマークダウン記法は一切使用しないこと。プレーンテキストで出力すること。
- 出力は日本語と英単語（医薬品名等）のみとすること。ロシア語、中国語、韓国語、その他の言語は絶対に使用しないこと。

■ 最終整合性チェック（出力前に必ず以下を確認すること）：
1. S/O/A/Pの内容が互いに矛盾していないか確認する
2. Sで述べた症状がO/Aに適切に反映されているか確認する
3. Aで立てた問いや評価がPの計画に対応しているか確認する
4. 処方内容に記載された医薬品がSOAPの中で正しく言及されているか確認する
5. 一包化フラグの指示通りに記載されている（または記載されていない）か確認する
6. 禁止事項に該当する表現が含まれていないか確認する
7. 日本語と英単語以外の言語が含まれていないか確認する
8. マークダウン記法が含まれていないか確認する
9. 処方タイプ（内服/外用/便秘薬/湿布等）に合った書き方になっているか確認する
10. 不整合があれば修正してから出力すること

薬歴内容：
${text}`;
}

// AI呼び出しの振り分け
async function callAI(provider, model, apiKey, text, prescription, pastData, hasShiB) {
  const prompt = buildPrompt(text, prescription, pastData, hasShiB);

  switch (provider) {
    case "gemini":
      return await callGemini(apiKey, prompt, model);
    case "openai":
      return await callOpenAI(apiKey, prompt, model);
    case "claude":
      return await callClaude(apiKey, prompt, model);
    default:
      throw new Error("不明なプロバイダー: " + provider);
  }
}

// Gemini API
async function callGemini(apiKey, prompt, model) {
  const modelName = model === "gemini-pro" ? "gemini-2.5-pro" : "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Gemini API失敗 (${res.status}): ${errorBody}`);
  }

  const data = await res.json();
  const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!resultText) throw new Error("Geminiから有効な応答が得られませんでした");
  return resultText.trim();
}

// OpenAI API
async function callOpenAI(apiKey, prompt, model) {
  const modelName = model === "gpt-4o" ? "gpt-4o" : "gpt-4o-mini";
  const url = "https://api.openai.com/v1/chat/completions";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3
    })
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`OpenAI API失敗 (${res.status}): ${errorBody}`);
  }

  const data = await res.json();
  const resultText = data.choices?.[0]?.message?.content;
  if (!resultText) throw new Error("OpenAIから有効な応答が得られませんでした");
  return resultText.trim();
}

// Claude API
async function callClaude(apiKey, prompt, model) {
  const modelName = model === "claude-sonnet" ? "claude-sonnet-4-20250514" : "claude-haiku-4-20250514";
  const url = "https://api.anthropic.com/v1/messages";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Claude API失敗 (${res.status}): ${errorBody}`);
  }

  const data = await res.json();
  const resultText = data.content?.[0]?.text;
  if (!resultText) throw new Error("Claudeから有効な応答が得られませんでした");
  return resultText.trim();
}
