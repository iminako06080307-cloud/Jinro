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
      thought: ['自分は村人。手がかりゼロ…とにかく発言の矛盾を探すしかない。', '占い師が出てくれたら助かるんだけどな。今は様子見。'],
      speech: ['えっと、まだ情報なくない？占い師さんいたら早めに教えてほしいな。', 'さっきの投票さぁ、ちょっと不自然じゃなかった？流れが変だったよ。', 'いや、俺は村人だって！疑うのは勝手だけどさ…', 'うーん、静かな人ほど気になるんだよね。何考えてるか分かんないし。'],
    },
    werewolf: {
      thought: ['自分は人狼。でも仲間が誰か分からない…襲撃で仲間を殺したらどうしよう。', '村人のふりをしつつ、発言の癖から仲間の人狼を探りたい。'],
      speech: ['いやいや、私は村人だって！なんでそんな目で見るのさ。', 'ってかさ、さっきから発言少ない人のほうが怪しくない？', '占い師騙りには気をつけなよ。混乱させるのが狙いなんだから。', 'その理屈はおかしくない？昨日の投票と言ってること違うじゃん。'],
    },
    seer: {
      thought: ['自分は占い師。結果をいつ出すかが勝負。早すぎると襲われる…。', '結果を明かせば信用は得られる。でも今夜狙われるだろうな。'],
      speech: ['…実は言おうか迷ってたんだけど、私、占い師なんだ。', '昨日の夜の結果、そろそろ共有したほうがいいよね。', 'まだ全部は言えない。でも確かな情報は持ってるから、焦らないで。'],
    },
    hunter: {
      thought: ['自分はボディーガード。今夜狙われそうな人を読まないと。自分を守れないのが辛い。', '占い師っぽい人がいたら最優先で護衛だな。'],
      speech: ['昨日の襲撃さ、狙いが偏ってる気がするんだよね。', '大事な役職の人はあんまり目立たないほうがいいって、ほんとに。', '俺は村側だよ。証明はできないけど、行動で見ててくれ。'],
    },
    madman: {
      thought: ['自分は狂人。人狼陣営の勝ちが自分の勝ち。占い師を騙って場を引っかき回そう。', '人狼が誰かは知らないけど、村が疑心暗鬼になれば勝ちが見えてくる。'],
      speech: ['言っちゃうけど、占い師は私！信じてくれていいよ。', 'あの人は白だったよ。それより無口な人のほうが怪しいって。', '迷ってる時間ないでしょ、さっさと決めようよ。'],
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
