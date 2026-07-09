/**
 * AIプレイヤー基盤
 * - Anthropic API をブラウザから直接呼び出す（BYOK方式）
 * - 各AIは {thought(本音), speech/target(行動)} を構造化出力で返す
 * - APIキー不要の mock プロバイダも持つ（デモ・テスト用）
 */
const AI = (function () {
  'use strict';

  const STORE_KEY = 'jinro_ai_config';
  const API_URL = 'https://api.anthropic.com/v1/messages';

  const MODELS = [
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8（最も賢い・既定）' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5（速い・バランス）' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5（最速・安価）' },
  ];

  // ---- 設定の保存/読み込み ----
  function loadConfig() {
    try {
      return Object.assign(
        { provider: 'mock', apiKey: '', model: 'claude-opus-4-8' },
        JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
      );
    } catch (e) {
      return { provider: 'mock', apiKey: '', model: 'claude-opus-4-8' };
    }
  }

  function saveConfig(cfg) {
    localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
  }

  // ---- JSONの頑健なパース ----
  function safeParseJson(text) {
    if (!text) throw new Error('空の応答');
    try {
      return JSON.parse(text);
    } catch (e) {
      // ```json ... ``` や前後の余計な文字を除去して再挑戦
      const m = text.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      throw new Error('AIの応答をJSONとして解釈できませんでした: ' + text.slice(0, 120));
    }
  }

  // ---- 実API呼び出し ----
  async function callReal(cfg, system, userText, schema) {
    const body = {
      model: cfg.model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userText }],
      output_config: { format: { type: 'json_schema', schema } },
    };

    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });
    } catch (netErr) {
      throw new Error('ネットワークエラー: ' + netErr.message);
    }

    if (!res.ok) {
      let detail = '';
      try {
        const err = await res.json();
        detail = err.error && err.error.message ? err.error.message : JSON.stringify(err);
      } catch (e) { /* ignore */ }
      if (res.status === 401) throw new Error('APIキーが無効です（401）。設定を確認してください。');
      if (res.status === 429) throw new Error('レート制限に達しました（429）。少し待って再試行してください。');
      throw new Error(`APIエラー ${res.status}: ${detail}`);
    }

    const data = await res.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return safeParseJson(text);
  }

  // ---- モック（APIキー不要）----
  const MOCK_LINES = {
    villager: {
      thought: ['自分は村人。誰が人狼か手がかりがない…発言の矛盾を探そう。', '占い師が出てくれると助かる。今は様子見だ。'],
      speech: ['まだ情報が少ないですね。占い師の方はいませんか？', '昨夜の襲撃を考えると、誰かが疑われるのを避けている気がします。', '私は村人です。皆の発言をよく見て判断したい。'],
    },
    werewolf: {
      thought: ['自分は人狼。だが仲間が誰かは分からない…襲撃で仲間を殺してしまうかもしれない。', '正体を悟られないよう村人のふりをしつつ、発言から仲間の人狼を探りたい。'],
      speech: ['私は村人です。皆で協力して人狼を見つけましょう。', 'あの人、少し発言が慎重すぎませんか？怪しいと思います。', '占い師を騙る人には気をつけたほうがいい。混乱を狙っているかも。'],
    },
    seer: {
      thought: ['自分は占い師。占い結果をいつ公開するかが鍵。人狼に襲われないよう慎重に。', '結果を明かせば信用を得られるが、狙われるリスクもある。'],
      speech: ['私は占い師です。昨夜の占い結果を共有します。', '皆さんの発言を注意深く見ています。矛盾があれば指摘します。', 'まだ全ては明かせませんが、確かな情報を持っています。'],
    },
    hunter: {
      thought: ['自分はボディーガード。今夜狙われそうな人を読んで守りたい。自分は守れないのが辛い。', '占い師らしき人がいれば最優先で護衛すべきだ。'],
      speech: ['昨夜の襲撃パターンから、人狼の狙いが見えてきた気がします。', '大事な役職の人は、あまり目立たないほうがいいかもしれません。', '私は村人陣営です。発言の矛盾を探しましょう。'],
    },
    madman: {
      thought: ['自分は狂人。人狼陣営の勝利が目的。占い師を騙って場を混乱させよう。', '人狼が誰かは知らないが、村を疑心暗鬼にすれば勝機がある。'],
      speech: ['実は私が占い師です。信じてください。', 'あの人は白でした。むしろ発言の少ない人が怪しい。', '結束して吊り先を決めましょう、迷っている時間はありません。'],
    },
  };

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  async function callMock(ctx, kind, candidates) {
    // 少し待って「考えている」感を出す
    await new Promise((r) => setTimeout(r, 350 + Math.random() * 400));
    const bank = MOCK_LINES[ctx.role] || MOCK_LINES.villager;
    if (kind === 'speech') {
      return { thought: pick(bank.thought), speech: pick(bank.speech) };
    }
    // vote / night action: ランダムな候補を選ぶ
    const target = pick(candidates);
    const thoughtByKind = {
      vote: `${target}が一番怪しいと感じる。ここに投票して流れを作りたい。`,
      attack: `${target}を襲撃したい。ただ仲間の人狼かもしれないのが怖い…。`,
      divine: `${target}を占って白黒はっきりさせたい。`,
      guard: `${target}が今夜狙われそうだ。護衛してみよう。`,
    };
    return { thought: thoughtByKind[kind] || `${target}を選ぶ。`, target };
  }

  // ---- 公開インターフェース ----
  // ctx: { role, name }, kind: 'speech'|'vote'|'attack'|'divine'
  async function ask(cfg, { system, userText, schema, ctx, kind, candidates }) {
    if (cfg.provider === 'mock') {
      return callMock(ctx, kind, candidates);
    }
    return callReal(cfg, system, userText, schema);
  }

  return { MODELS, loadConfig, saveConfig, ask, safeParseJson };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AI };
}
