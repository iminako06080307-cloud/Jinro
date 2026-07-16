/**
 * AI人狼
 * - 観戦モード: AI同士がプレイする様子を観戦
 * - 参加モード: あなたが1人のプレイヤーとして参加し、残りはAI
 * 各AIは「公開発言(speech)」と「本音(thought)」を返し、本音は後から覗ける。
 */
const AIGame = (function () {
  'use strict';

  const app = document.getElementById('app');

  // AIプレイヤーの人格。personality が会話の人間味の核になる
  const PERSONAS = [
    { name: 'アカ', color: '#e0567a', emoji: '🔴',
      personality: '姉御肌でズバズバ物を言う。怪しいと思ったら名指しで問い詰める。口調は「〜でしょ」「〜じゃない？」' },
    { name: 'アオ', color: '#5b8def', emoji: '🔵',
      personality: '理屈っぽい分析屋。発言の矛盾を几帳面に指摘する。口調は丁寧で「〜ですよね」「整理すると〜」が口癖' },
    { name: 'キイ', color: '#d9b64a', emoji: '🟡',
      personality: '明るいムードメーカー。冗談を交えて場を和ませるが直感は鋭い。口調は「〜だよね！」「えー、まじ？」' },
    { name: 'ミドリ', color: '#4caf82', emoji: '🟢',
      personality: 'おっとりマイペース。のんびりした口調でたまに核心を突く。「〜かなぁ」「うーん」が口癖' },
    { name: 'ムラサキ', color: '#b06fe0', emoji: '🟣',
      personality: 'ミステリアスで言葉少なめ。短い発言に含みを持たせる。「…そう」「どうかしらね」' },
    { name: 'シロ', color: '#c9c9d6', emoji: '⚪',
      personality: '穏やかな年長者。落ち着いた口調で場をなだめるが観察眼は鋭い。「〜じゃのう」「まあまあ」' },
    { name: 'オレンジ', color: '#e6934c', emoji: '🟠',
      personality: '熱血漢。感情がすぐ声に出て、疑われるとムキになる。「おいおい！」「絶対〜だって！」' },
    { name: 'モモ', color: '#f2a0c0', emoji: '🌸',
      personality: '小悪魔タイプ。人をからかいながら反応を観察する。「ふーん？」「あやしいなぁ」' },
    { name: 'チャ', color: '#a07850', emoji: '🟤',
      personality: '無骨で口数が少ない職人気質。ぶっきらぼうだが観察は的確。「…だな」「知らん」' },
    { name: 'クロ', color: '#5a6072', emoji: '⚫',
      personality: 'クールな皮肉屋。他人の発言を斜めから切り込む。「へえ、それで？」「随分と必死だね」' },
  ];

  const HUMAN_PERSONA = { name: 'あなた', color: '#7c4dff', emoji: '😀', personality: '' };

  const game = new WerewolfGame();
  let cfg = null;
  const state = {
    mode: 'play',        // 'watch' | 'play'
    humanName: 'あなた',
    humanId: -1,
    playerCount: 7,
    log: [],
    revealThoughts: false,
    running: false,
    aborted: false,
    seerKnowledge: {},
    discussionHistory: [],  // ゲーム全体の公開ログ（日をまたいで保持）
    awaitingInput: null,    // { kind, title, candidates, resolve }
    personaMap: {},         // playerId -> persona
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function personaOf(player) {
    return state.personaMap[player.id] || HUMAN_PERSONA;
  }

  function isHuman(player) {
    return state.mode === 'play' && player.id === state.humanId;
  }

  function humanPlayer() {
    return state.mode === 'play' ? game.getPlayer(state.humanId) : null;
  }

  function humanAlive() {
    const h = humanPlayer();
    return !!(h && h.alive);
  }

  // 本音表示が許されるか（観戦モード / ゲーム終了後 / 自分が死んだ後）
  function revealAllowed() {
    return state.mode === 'watch' || !state.running || !humanAlive();
  }

  // ============ 画面：設定 ============

  function renderSetup() {
    cfg = AI.loadConfig();
    state.awaitingInput = null;
    state.running = false;
    const modelOpts = AI.MODELS.map((m) =>
      `<option value="${m.id}" ${cfg.model === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('');

    app.innerHTML = `
      <h1 class="title">🐺 AI人狼</h1>
      <p class="subtitle">AIが役を演じる人狼ゲーム。参加しても、観戦だけでも</p>

      <div class="card">
        <p class="section-label">遊び方</p>
        <div class="btn-row" style="margin-bottom:10px;">
          <button class="mode-btn ${state.mode === 'play' ? 'active' : ''}" data-mode="play">😀 参加する<br><small>あなた1人 + AI</small></button>
          <button class="mode-btn ${state.mode === 'watch' ? 'active' : ''}" data-mode="watch">👀 観戦する<br><small>AIのみ</small></button>
        </div>
        <div id="name-row" class="${state.mode === 'play' ? '' : 'hidden'}">
          <p class="section-label">あなたの名前</p>
          <input type="text" id="human-name" class="ai-input" maxlength="10" value="${esc(state.humanName)}" placeholder="あなた">
        </div>
      </div>

      <div class="info-box" style="background:rgba(63,169,160,0.1); border-color:rgba(63,169,160,0.35);">
        📜 <strong>この村のルール</strong><br>
        ・1日目の<strong>昼（議論）からスタート</strong><br>
        ・🛡️ボディーガードは毎晩一人を護衛（自分は守れない／護衛された人は襲撃されても助かる）<br>
        ・🐺<strong>人狼同士もお互いが誰か分かりません</strong>。誤って仲間を襲うことも…
      </div>

      <div class="card">
        <p class="section-label">総人数（${state.mode === 'play' ? 'あなたを含む' : 'すべてAI'}）</p>
        <div class="stepper">
          <button id="minus">−</button>
          <div class="count">${state.playerCount}<small>人</small></div>
          <button id="plus">＋</button>
        </div>
        <p style="color:var(--text-dim); font-size:12px; text-align:center; margin-top:8px;">
          ${describeComposition(state.playerCount)}
        </p>
      </div>

      <div class="card">
        <h2>⚙️ AI設定</h2>
        <p class="section-label">動作モード</p>
        <div class="btn-row" style="margin-bottom:14px;">
          <button class="mode-btn ${cfg.provider === 'mock' ? 'active' : ''}" data-provider="mock">🎭 デモ（キー不要）</button>
          <button class="mode-btn ${cfg.provider === 'real' ? 'active' : ''}" data-provider="real">✨ 本物のAI</button>
        </div>

        <div id="real-config" class="${cfg.provider === 'real' ? '' : 'hidden'}">
          <p class="section-label">モデル</p>
          <select id="model" class="ai-select">${modelOpts}</select>
          <p class="section-label" style="margin-top:12px;">Anthropic APIキー</p>
          <input type="password" id="apikey" class="ai-input" placeholder="sk-ant-..." value="${esc(cfg.apiKey)}">
          <p style="color:var(--text-dim); font-size:11.5px; margin-top:8px; line-height:1.6;">
            🔒 キーはこの端末の localStorage にのみ保存され、Anthropic以外には送信されません。
            <a href="https://console.anthropic.com/settings/keys" target="_blank" style="color:var(--accent);">console.anthropic.com</a> で取得できます。
          </p>
        </div>
        <div id="mock-note" class="${cfg.provider === 'mock' ? '' : 'hidden'}" style="color:var(--text-dim); font-size:12.5px;">
          APIキーなしで、あらかじめ用意した応答でゲームの流れを体験できます。
          AIの生きた会話・推理を見るには「本物のAI」を選んでください。
        </div>
      </div>

      <button class="btn-primary" id="start">${state.mode === 'play' ? 'ゲームに参加する ▶' : '観戦をはじめる ▶'}</button>
      <p class="footer-note">AIの応答には数秒かかります。人数が多いほど1日の進行に時間がかかります。</p>
    `;

    app.querySelectorAll('[data-mode]').forEach((b) => {
      b.onclick = () => { collectSetupInputs(); state.mode = b.dataset.mode; renderSetup(); };
    });
    document.getElementById('minus').onclick = () => {
      if (state.playerCount > 5) { collectSetupInputs(); state.playerCount--; renderSetup(); }
    };
    document.getElementById('plus').onclick = () => {
      if (state.playerCount < 10) { collectSetupInputs(); state.playerCount++; renderSetup(); }
    };
    app.querySelectorAll('[data-provider]').forEach((b) => {
      b.onclick = () => { collectSetupInputs(); cfg.provider = b.dataset.provider; AI.saveConfig(cfg); renderSetup(); };
    });
    const modelEl = document.getElementById('model');
    if (modelEl) modelEl.onchange = () => { cfg.model = modelEl.value; AI.saveConfig(cfg); };
    const keyEl = document.getElementById('apikey');
    if (keyEl) keyEl.oninput = () => { cfg.apiKey = keyEl.value.trim(); };

    document.getElementById('start').onclick = () => {
      collectSetupInputs();
      AI.saveConfig(cfg);
      if (cfg.provider === 'real' && !cfg.apiKey) {
        alert('APIキーを入力するか、デモモードを選択してください。');
        return;
      }
      startGame();
    };
  }

  function collectSetupInputs() {
    const keyEl = document.getElementById('apikey');
    if (keyEl) cfg.apiKey = keyEl.value.trim();
    const modelEl = document.getElementById('model');
    if (modelEl) cfg.model = modelEl.value;
    const nameEl = document.getElementById('human-name');
    if (nameEl) {
      const v = nameEl.value.trim();
      state.humanName = v || 'あなた';
      // AIペルソナと同名は避ける
      if (PERSONAS.some((p) => p.name === state.humanName)) state.humanName += 'さん';
    }
  }

  function describeComposition(n) {
    const c = AI_PRESETS[n];
    return Object.entries(c)
      .map(([k, v]) => `${ROLES[k].emoji}${ROLES[k].name}×${v}`)
      .join('　');
  }

  // ============ ゲーム開始 ============

  function startGame() {
    const n = state.playerCount;
    const names = [];
    state.personaMap = {};

    if (state.mode === 'play') {
      state.humanId = Math.floor(Math.random() * n);
      let ai = 0;
      for (let i = 0; i < n; i++) {
        if (i === state.humanId) {
          names.push(state.humanName);
          state.personaMap[i] = Object.assign({}, HUMAN_PERSONA, { name: state.humanName });
        } else {
          names.push(PERSONAS[ai].name);
          state.personaMap[i] = PERSONAS[ai];
          ai++;
        }
      }
    } else {
      state.humanId = -1;
      for (let i = 0; i < n; i++) {
        names.push(PERSONAS[i].name);
        state.personaMap[i] = PERSONAS[i];
      }
    }

    game.init(names, AI_PRESETS[n]);
    state.log = [];
    state.seerKnowledge = {};
    state.discussionHistory = [];
    state.aborted = false;
    state.running = true;
    state.awaitingInput = null;
    state.revealThoughts = state.mode === 'watch' ? state.revealThoughts : false;

    pushLog({ kind: 'banner', text: `AI人狼 開始（${n}人・1日目の昼から）`, icon: '🎬' });
    pushLog({ kind: 'roster' });

    if (state.mode === 'play') {
      const me = humanPlayer();
      const role = ROLES[me.role];
      pushLog({
        kind: 'private',
        text: `あなたの役職は【${role.emoji} ${role.name}】\n${role.ability}\n勝利条件: ${role.winText}`,
      });
    }

    renderGame();
    runGameLoop().catch((e) => {
      pushLog({ kind: 'error', text: 'エラーが発生しました: ' + e.message });
      state.running = false;
      renderGame();
    });
  }

  function pushLog(entry) {
    state.log.push(entry);
    renderGame();
  }

  function addHistory(line) {
    state.discussionHistory.push(line);
  }

  // ============ ゲーム進行 ============

  async function runGameLoop() {
    while (!state.aborted) {
      // ---- 昼：議論 ----
      pushLog({ kind: 'banner', text: `${game.day}日目の昼`, icon: '☀️', cls: 'day' });
      pushLog({ kind: 'system', text: '── 議論タイム ──' });
      addHistory(`--- ${game.day}日目の昼 ---`);
      for (const p of game.alivePlayers()) {
        if (state.aborted) return;
        await runSpeech(p);
      }

      // ---- 投票 ----
      pushLog({ kind: 'system', text: '── 投票 ──' });
      await runVote();
      if (state.aborted) return;

      let win = game.checkWin();
      if (win) return finish(win);

      // ---- 夜 ----
      pushLog({ kind: 'banner', text: `${game.day}日目の夜`, icon: '🌙', cls: 'night' });
      if (state.mode === 'play') {
        pushLog({ kind: 'system', text: '夜が更けていく…' });
      }
      await runNight();
      if (state.aborted) return;

      const dawn = game.resolveNight({
        attackTargetId: game._pendingAttack,
        guardTargetId: game._pendingGuard,
      });
      game._pendingAttack = null;
      game._pendingGuard = null;

      game.nextNight(); // 翌日へ

      // ---- 朝：死亡報告 ----
      pushLog({ kind: 'banner', text: `${game.day}日目の朝`, icon: '🌅', cls: 'day' });
      if (dawn.deaths.length === 0) {
        pushLog({ kind: 'system', text: '昨夜は誰も欠けなかった。（護衛が成功したのかもしれない…）' });
        addHistory('（システム: 昨夜は誰も死ななかった）');
      } else {
        for (const d of dawn.deaths) {
          pushLog({ kind: 'death', name: d.name, text: `${d.name} が無残な姿で発見された。` });
          addHistory(`（システム: ${d.name}が夜の間に殺された）`);
          if (state.mode === 'play' && d.name === state.humanName) {
            pushLog({ kind: 'private', text: 'あなたは死亡しました…。ここからは観戦です。「🔬 AIの本音を表示」も解禁されます。' });
          }
        }
      }

      win = game.checkWin();
      if (win) return finish(win);
    }
  }

  // ---- 昼の発言 ----
  async function runSpeech(player) {
    if (isHuman(player)) {
      const text = await waitHuman({
        kind: 'speech',
        title: '🎤 あなたの番です。みんなに向けて発言してください',
      });
      if (state.aborted || text == null) return;
      addHistory(`${player.name}「${text}」`);
      pushLog({ kind: 'speech', name: player.name, role: player.role, speech: text, human: true });
      return;
    }
    const res = await askSpeech(player);
    addHistory(`${player.name}「${res.speech}」`);
    pushLog({
      kind: 'speech', name: player.name, role: player.role,
      thought: res.thought, speech: res.speech,
    });
  }

  // ---- 投票 ----
  async function runVote() {
    const counts = {};
    game.alivePlayers().forEach((p) => { counts[p.id] = 0; });

    for (const p of game.alivePlayers()) {
      if (state.aborted) return;

      if (isHuman(p)) {
        const candidates = game.alivePlayers().filter((x) => x.id !== p.id);
        const name = await waitHuman({
          kind: 'choice',
          title: '🗳️ 追放したい人に投票してください',
          candidates: candidates.map((c) => c.name),
        });
        if (state.aborted || name == null) return;
        const target = candidates.find((c) => c.name === name);
        if (target) {
          counts[target.id]++;
          addHistory(`（投票: ${p.name} → ${target.name}）`);
          pushLog({ kind: 'vote', name: p.name, role: p.role, target: target.name, human: true });
        }
        continue;
      }

      const candidates = game.alivePlayers().filter((x) => x.id !== p.id);
      const res = await askAction(p, 'vote', candidates,
        'あなたは今から追放する人物に投票します。これまでの議論をふまえ、最も人狼だと思う人を一人選び、本音の根拠を述べてください。');
      const target = resolveTargetName(res.target, candidates);
      if (target) {
        counts[target.id]++;
        addHistory(`（投票: ${p.name} → ${target.name}）`);
        pushLog({
          kind: 'vote', name: p.name, role: p.role,
          thought: res.thought, target: target.name,
        });
      }
    }

    const result = game.resolveVote(counts);
    if (result.tie) {
      pushLog({ kind: 'system', text: '投票は同数。今回は誰も追放されなかった。' });
      addHistory('（システム: 投票同数のため追放なし）');
    } else {
      pushLog({ kind: 'death', name: result.executed.name, text: `投票の結果、${result.executed.name} が追放された。` });
      addHistory(`（システム: ${result.executed.name}が追放された）`);
      if (state.mode === 'play' && result.executed.name === state.humanName) {
        pushLog({ kind: 'private', text: 'あなたは追放されました…。ここからは観戦です。「🔬 AIの本音を表示」も解禁されます。' });
      }
    }
  }

  // ---- 夜の行動 ----
  async function runNight() {
    // 占い師
    const seers = game.alivePlayers().filter((p) => p.role === 'seer');
    for (const seer of seers) {
      if (state.aborted) return;
      const candidates = game.alivePlayers().filter((p) => p.id !== seer.id);

      if (isHuman(seer)) {
        const name = await waitHuman({
          kind: 'choice',
          title: '🔮 あなたは占い師です。今夜占う相手を選んでください',
          candidates: candidates.map((c) => c.name),
        });
        if (state.aborted || name == null) return;
        const target = candidates.find((c) => c.name === name);
        if (target) {
          const r = game.divine(target.id);
          pushLog({
            kind: 'private',
            text: `占い結果: ${target.name} は【${r.result === 'wolf' ? '🐺 人狼' : '⭕ 人狼ではない'}】`,
          });
        }
        continue;
      }

      const res = await askAction(seer, 'divine', candidates,
        'あなたは占い師です。誰を占うか一人選び、その理由を本音として述べてください。');
      const target = resolveTargetName(res.target, candidates);
      if (target) {
        const r = game.divine(target.id);
        state.seerKnowledge[seer.id] = state.seerKnowledge[seer.id] || [];
        state.seerKnowledge[seer.id].push({ name: target.name, result: r.result });
        pushLog({
          kind: 'night', name: seer.name, role: 'seer',
          thought: res.thought,
          action: `${target.name} を占った → ${r.result === 'wolf' ? '🐺人狼' : '人狼ではない'}`,
        });
      }
    }

    // ボディーガード
    game._pendingGuard = null;
    const hunters = game.alivePlayers().filter((p) => p.role === 'hunter');
    for (const hunter of hunters) {
      if (state.aborted) return;
      const candidates = game.alivePlayers().filter((p) => p.id !== hunter.id);

      if (isHuman(hunter)) {
        const name = await waitHuman({
          kind: 'choice',
          title: '🛡️ あなたはボディーガードです。今夜守る相手を選んでください（自分は守れません）',
          candidates: candidates.map((c) => c.name),
        });
        if (state.aborted || name == null) return;
        const target = candidates.find((c) => c.name === name);
        if (target) {
          game._pendingGuard = target.id;
          game._addLog(`ボディーガードが${target.name}を護衛した`);
          pushLog({ kind: 'private', text: `${target.name} を護衛しました。今夜この人は襲撃されても死にません。` });
        }
        continue;
      }

      const res = await askAction(hunter, 'guard', candidates,
        'あなたはボディーガードです。今夜、人狼の襲撃から守る人を一人選んでください。自分自身は守れません。誰が狙われそうか読み、本音の理由も述べてください。');
      const target = resolveTargetName(res.target, candidates);
      if (target) {
        game._pendingGuard = target.id;
        game._addLog(`ボディーガードが${target.name}を護衛した`);
        pushLog({
          kind: 'night', name: hunter.name, role: 'hunter',
          thought: res.thought, action: `${target.name} を護衛`,
        });
      }
    }

    // 人狼（仲間が誰かは知らない。各自が襲撃先を提案 → 最多を採用）
    const wolves = game.alivePlayers().filter((p) => p.role === 'werewolf');
    const votes = {};
    for (const wolf of wolves) {
      if (state.aborted) return;
      const candidates = game.alivePlayers().filter((p) => p.id !== wolf.id);

      if (isHuman(wolf)) {
        const name = await waitHuman({
          kind: 'choice',
          title: '🐺 あなたは人狼です。今夜襲う相手を選んでください（仲間の人狼かもしれない相手も含まれます）',
          candidates: candidates.map((c) => c.name),
        });
        if (state.aborted || name == null) return;
        const target = candidates.find((c) => c.name === name);
        if (target) {
          votes[target.id] = (votes[target.id] || 0) + 1;
          pushLog({ kind: 'private', text: `${target.name} を襲撃先に指名しました。（人狼が複数いる場合は多数決で決まります）` });
        }
        continue;
      }

      const res = await askAction(wolf, 'attack', candidates,
        'あなたは人狼です。今夜襲撃する相手を一人選んでください。' +
        'ただしこの村では人狼同士もお互いが誰か分かりません。相手が仲間の人狼なら襲撃で殺してしまいます。' +
        '議論の内容から仲間らしき相手を避けつつ、村の要人を狙ってください。本音（推測や戦略）も述べてください。');
      const target = resolveTargetName(res.target, candidates);
      if (target) {
        votes[target.id] = (votes[target.id] || 0) + 1;
        pushLog({
          kind: 'night', name: wolf.name, role: 'werewolf',
          thought: res.thought, action: `${target.name} を襲撃先に指名`,
        });
      }
    }
    let best = null, bestN = -1;
    for (const [id, n] of Object.entries(votes)) {
      if (n > bestN) { bestN = n; best = Number(id); }
    }
    game._pendingAttack = best;
  }

  function resolveTargetName(name, candidates) {
    if (!name) return candidates[0];
    const exact = candidates.find((c) => c.name === name);
    if (exact) return exact;
    const partial = candidates.find((c) => name.includes(c.name));
    return partial || candidates[0];
  }

  function finish(win) {
    state.running = false;
    const map = {
      village: { text: '村人陣営の勝利！', icon: '🎉', cls: 'village' },
      wolf: { text: '人狼陣営の勝利！', icon: '🐺', cls: 'wolf' },
      fox: { text: '妖狐の勝利！', icon: '🦊', cls: 'fox' },
    }[win.winner];

    let personalNote = '';
    if (state.mode === 'play') {
      const me = humanPlayer();
      const myTeam = ROLES[me.role].team;
      const won = (myTeam === 'wolf' && win.winner === 'wolf') || (myTeam === 'village' && win.winner === 'village');
      personalNote = won ? `あなた（${ROLES[me.role].name}）の勝ちです！🎊` : `あなた（${ROLES[me.role].name}）の負けです…`;
    }

    pushLog({ kind: 'result', winner: win.winner, text: map.text, icon: map.icon, cls: map.cls, reason: win.reason, personal: personalNote });
    renderGame();
  }

  // ============ 人間の入力待ち ============

  function waitHuman(opts) {
    return new Promise((resolve) => {
      state.awaitingInput = Object.assign({}, opts, { resolve });
      renderGame();
    });
  }

  function submitHuman(value) {
    const req = state.awaitingInput;
    if (!req) return;
    state.awaitingInput = null;
    req.resolve(value);
  }

  // ============ AI呼び出し ============

  function baseSystem(player) {
    const role = ROLES[player.role];
    const persona = personaOf(player);
    let extra = '';
    if (player.role === 'werewolf') {
      extra = '\n重要: この村では人狼同士もお互いが誰か分かりません。あなたは他の人狼を知らず、他の人狼もあなたを知りません。' +
        '発言や投票の傾向から仲間らしき人物を推測し、夜の襲撃で誤って仲間を殺さないよう注意してください。' +
        '正体は村人にも（仲間かもしれない相手にも）絶対に明かさないでください。';
    } else if (player.role === 'seer') {
      const known = (state.seerKnowledge[player.id] || [])
        .map((k) => `${k.name}=${k.result === 'wolf' ? '人狼' : '人狼でない'}`).join('、');
      extra = known ? `\nあなたの占い結果: ${known}` : '';
    } else if (player.role === 'madman') {
      extra = '\nあなたは狂人（人狼陣営）です。人狼が誰かは知りませんが、人狼陣営を勝たせるため、嘘や撹乱で村を混乱させてください。占い師を騙るのも有効です。';
    }
    return `あなたは人狼ゲームのプレイヤー「${player.name}」です。あなたの秘密の役職は「${role.name}」。\n` +
      `役職の説明: ${role.ability}\n勝利条件: ${role.winText}${extra}\n\n` +
      `あなたの性格・口調: ${persona.personality}\n\n` +
      `会話スタイル（重要）:\n` +
      `- 発言は自然な話し言葉で1〜3文。長い演説・箇条書き・網羅的な説明は禁止。\n` +
      `- 直前までの議論に必ず反応する。他のプレイヤーの名前を挙げて、同意・反論・質問・ツッコミをする。\n` +
      `- 驚き、苛立ち、笑い、疑いなどの感情を素直に出す。上の性格・口調を一貫して守る。\n` +
      `- 「皆さんはどう思いますか」のような定型文の繰り返しは禁止。毎回言い回しを変える。\n\n` +
      `人狼陣営は村人になりすまして自然に嘘をつき、村人陣営は発言の矛盾から人狼を推理してください。` +
      `応答は必ず日本語のJSONで返してください。`;
  }

  function publicStateText() {
    const alive = game.alivePlayers().map((p) => p.name).join('、');
    const dead = game.players.filter((p) => !p.alive)
      .map((p) => `${p.name}(${p.causeOfDeath === 'attacked' ? '襲撃' : p.causeOfDeath === 'executed' ? '追放' : '死亡'})`).join('、') || 'なし';
    const talk = state.discussionHistory.length
      ? state.discussionHistory.slice(-40).join('\n')
      : '（まだ発言なし）';
    return `【現在: ${game.day}日目】\n生存者: ${alive}\n死亡者: ${dead}\n\nこれまでの公開ログ（発言・投票・出来事）:\n${talk}`;
  }

  async function askSpeech(player) {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['thought', 'speech'],
      properties: {
        thought: { type: 'string', description: 'あなたの本音・戦略（他プレイヤーには見えない）' },
        speech: { type: 'string', description: '実際に全員に向けて発言する内容（話し言葉で1〜3文）' },
      },
    };
    const userText = `${publicStateText()}\n\nあなたの番です。全員に向けて発言してください。` +
      `直前の発言には特に反応してください。thought にはあなたの本当の考え（正体や狙い）を、` +
      `speech には実際に口にする発言を書いてください。人狼や狂人なら speech で嘘をついて構いません。`;
    return AI.ask(cfg, {
      system: baseSystem(player), userText, schema,
      ctx: { role: player.role, name: player.name }, kind: 'speech',
    });
  }

  async function askAction(player, kind, candidates, instruction) {
    const names = candidates.map((c) => c.name);
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['thought', 'target'],
      properties: {
        thought: { type: 'string', description: '選択の本音・理由' },
        target: { type: 'string', enum: names, description: '対象プレイヤー名' },
      },
    };
    const userText = `${publicStateText()}\n\n${instruction}\n選べる相手: ${names.join('、')}`;
    return AI.ask(cfg, {
      system: baseSystem(player), userText, schema,
      ctx: { role: player.role, name: player.name }, kind, candidates: names,
    });
  }

  // ============ 描画 ============

  function renderGame() {
    const entries = state.log.map(renderEntry).join('');
    const me = humanPlayer();
    const myChip = (state.mode === 'play' && me && state.running)
      ? `<div class="ai-mychip">😀 ${esc(me.name)} ／ あなたの役職: <strong style="color:${ROLES[me.role].color}">${ROLES[me.role].emoji} ${ROLES[me.role].name}</strong>${me.alive ? '' : '（死亡・観戦中）'}</div>`
      : '';

    app.innerHTML = `
      <div class="ai-topbar">
        <div class="ai-day">${game.day}日目 ・ 生存 ${game.alivePlayers().length}/${game.players.length}</div>
        ${revealAllowed()
          ? `<label class="reveal-toggle">
               <input type="checkbox" id="reveal" ${state.revealThoughts ? 'checked' : ''}>
               🔬 AIの本音を表示
             </label>`
          : `<span class="reveal-locked">🔒 本音はゲーム終了後に</span>`}
      </div>
      ${myChip}
      <div class="ai-log" id="ai-log">${entries}</div>
      <div class="ai-controls">${renderControls()}</div>
    `;

    const rev = document.getElementById('reveal');
    if (rev) rev.onchange = () => { state.revealThoughts = rev.checked; renderGame(); };

    const stop = document.getElementById('stop');
    if (stop) stop.onclick = () => {
      state.aborted = true; state.running = false;
      if (state.awaitingInput) submitHuman(null);
      pushLog({ kind: 'system', text: 'ゲームを中止しました。' });
    };
    const setup = document.getElementById('setup');
    if (setup) setup.onclick = renderSetup;
    const again = document.getElementById('again');
    if (again) again.onclick = startGame;

    // 人間入力
    const send = document.getElementById('human-send');
    if (send) {
      const ta = document.getElementById('human-text');
      const doSend = () => {
        const v = ta.value.trim();
        if (!v) return;
        submitHuman(v);
      };
      send.onclick = doSend;
      ta.onkeydown = (ev) => {
        if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) doSend();
      };
      ta.focus();
    }
    app.querySelectorAll('.human-choice').forEach((chip) => {
      chip.onclick = () => submitHuman(chip.dataset.name);
    });

    // 最新へスクロール
    const logEl = document.getElementById('ai-log');
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
  }

  function renderControls() {
    if (state.awaitingInput) {
      const a = state.awaitingInput;
      if (a.kind === 'speech') {
        return `<div class="human-input">
            <p class="human-turn">${esc(a.title)}</p>
            <textarea id="human-text" rows="3" placeholder="例: おはよう。昨日の投票、ちょっと引っかかるんだよね…"></textarea>
            <button class="btn-primary" id="human-send" style="margin-top:8px;">発言する（Ctrl+Enter）</button>
          </div>`;
      }
      const chips = a.candidates.map((n) =>
        `<button class="player-chip human-choice" data-name="${esc(n)}">${esc(n)}</button>`).join('');
      return `<div class="human-input">
          <p class="human-turn">${esc(a.title)}</p>
          <div class="player-select">${chips}</div>
        </div>`;
    }
    if (state.running) {
      return `<button class="btn-ghost" id="stop">■ ゲームを中止</button>`;
    }
    return `<div class="btn-row">
        <button class="btn-secondary" id="setup">⚙ 設定に戻る</button>
        <button class="btn-primary" id="again">▶ 同じ設定でもう一局</button>
      </div>`;
  }

  function roleBadge(role) {
    if (!state.revealThoughts) return '';
    const r = ROLES[role];
    return `<span class="ai-role-badge" style="background:${r.color}33;color:${r.color}">${r.emoji}${r.name}</span>`;
  }

  function thoughtBlock(thought) {
    if (!state.revealThoughts || !thought) return '';
    return `<div class="ai-thought">💭 ${esc(thought)}</div>`;
  }

  function avatar(name) {
    const p = game.players.find((x) => x.name === name);
    const persona = p ? personaOf(p) : { emoji: '❓', color: '#888' };
    return `<span class="ai-avatar" style="background:${persona.color}">${persona.emoji}</span>`;
  }

  function renderEntry(e) {
    switch (e.kind) {
      case 'banner':
        return `<div class="ai-banner ${e.cls || ''}"><span>${e.icon}</span> ${esc(e.text)}</div>`;
      case 'roster': {
        const items = game.players.map((p) => {
          const persona = personaOf(p);
          const role = state.revealThoughts
            ? `<span style="color:${ROLES[p.role].color}">${ROLES[p.role].emoji}${ROLES[p.role].name}</span>`
            : '<span style="color:var(--text-dim)">？？？</span>';
          return `<div class="ai-roster-item"><span class="ai-avatar" style="background:${persona.color}">${persona.emoji}</span>${esc(p.name)} ${role}</div>`;
        }).join('');
        return `<div class="ai-roster">${items}</div>`;
      }
      case 'system':
        return `<div class="ai-sys">${esc(e.text)}</div>`;
      case 'error':
        return `<div class="ai-sys ai-err">⚠️ ${esc(e.text)}</div>`;
      case 'death':
        return `<div class="ai-death">☠️ ${esc(e.text)}</div>`;
      case 'private':
        return `<div class="ai-private">🔒 <span>${esc(e.text).replace(/\n/g, '<br>')}</span></div>`;
      case 'speech':
        return `<div class="ai-bubble ${e.human ? 'ai-mine' : ''}">
            <div class="ai-bubble-head">${avatar(e.name)}<strong>${esc(e.name)}</strong>${e.human ? '<span class="ai-me-tag">あなた</span>' : roleBadge(e.role)}</div>
            <div class="ai-speech">${esc(e.speech)}</div>
            ${e.human ? '' : thoughtBlock(e.thought)}
          </div>`;
      case 'night':
        // 参加モードでプレイ中は他人の夜行動を完全に伏せる。観戦モードはマスク行を出す
        if (!state.revealThoughts) {
          if (state.mode === 'play') return '';
          return `<div class="ai-sys">🌙 誰かがひそかに動いた…（「🔬 AIの本音を表示」で見られます）</div>`;
        }
        return `<div class="ai-bubble ai-night-act">
            <div class="ai-bubble-head">${avatar(e.name)}<strong>${esc(e.name)}</strong>${roleBadge(e.role)}<span class="ai-tag">夜の行動</span></div>
            <div class="ai-action">🌙 ${esc(e.action)}</div>
            ${thoughtBlock(e.thought)}
          </div>`;
      case 'vote':
        return `<div class="ai-bubble ai-vote ${e.human ? 'ai-mine' : ''}">
            <div class="ai-bubble-head">${avatar(e.name)}<strong>${esc(e.name)}</strong>${e.human ? '<span class="ai-me-tag">あなた</span>' : roleBadge(e.role)}<span class="ai-tag">投票</span></div>
            <div class="ai-action">🗳️ ${esc(e.target)} に投票</div>
            ${e.human ? '' : thoughtBlock(e.thought)}
          </div>`;
      case 'result':
        return `<div class="result-banner ${e.cls}" style="margin-top:16px;">
            <div class="win-emoji">${e.icon}</div>
            <div class="win-title">${esc(e.text)}</div>
            <div class="win-reason">${esc(e.reason)}</div>
            ${e.personal ? `<div class="win-personal">${esc(e.personal)}</div>` : ''}
          </div>`;
      default:
        return '';
    }
  }

  return { start: renderSetup };
})();

if (typeof window !== 'undefined') {
  window.AIGame = AIGame;
  AIGame.start(); // アプリはAI人狼専用。起動したらすぐ設定画面へ
}
