/**
 * AI観戦モード
 * AIプレイヤー同士が人狼をプレイする様子を観戦する。
 * 各AIの「公開発言(speech)」と「本音(thought)」を並べて見られるのが眼目。
 * WerewolfGame のロジックを再利用しつつ、進行はAI応答で駆動する。
 */
const AIGame = (function () {
  'use strict';

  const app = document.getElementById('app');
  const PERSONAS = [
    { name: 'アカ', color: '#e0567a', emoji: '🔴' },
    { name: 'アオ', color: '#5b8def', emoji: '🔵' },
    { name: 'キイ', color: '#d9b64a', emoji: '🟡' },
    { name: 'ミドリ', color: '#4caf82', emoji: '🟢' },
    { name: 'ムラサキ', color: '#b06fe0', emoji: '🟣' },
    { name: 'シロ', color: '#c9c9d6', emoji: '⚪' },
    { name: 'オレンジ', color: '#e6934c', emoji: '🟠' },
    { name: 'モモ', color: '#f2a0c0', emoji: '🌸' },
    { name: 'チャ', color: '#a07850', emoji: '🟤' },
    { name: 'クロ', color: '#5a6072', emoji: '⚫' },
  ];

  const game = new WerewolfGame();
  let cfg = null;
  const state = {
    playerCount: 7,
    log: [],            // { kind, ... } 表示用イベント
    revealThoughts: false,
    running: false,
    aborted: false,
    seerKnowledge: {},  // seerId -> [{name, result}]
    discussionHistory: [], // その日の公開発言テキスト
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function personaOf(player) {
    return PERSONAS[player.id % PERSONAS.length];
  }

  // ============ 画面：設定 ============

  function renderSetup() {
    cfg = AI.loadConfig();
    const modelOpts = AI.MODELS.map((m) =>
      `<option value="${m.id}" ${cfg.model === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('');

    app.innerHTML = `
      <h1 class="title">🤖 AI人狼</h1>
      <p class="subtitle">AI同士が演じる人狼ゲーム。嘘と推理の応酬を観戦しよう</p>

      <div class="info-box">
        AIプレイヤーが役職を演じ、<strong>人狼は嘘をつき、村人や占い師は推理します</strong>。
        各AIの「公開発言」だけでなく <strong>本音（本当の役職・意図）</strong> も覗けるので、
        AIがどう欺き・どう見抜くかを研究的に観察できます。
      </div>

      <div class="info-box" style="background:rgba(63,169,160,0.1); border-color:rgba(63,169,160,0.35);">
        📜 <strong>この村のルール</strong><br>
        ・1日目の<strong>昼（議論）からスタート</strong>します<br>
        ・🛡️ボディーガードは毎晩一人を護衛（自分は守れない／護衛された人は襲撃されても助かる）<br>
        ・🐺<strong>人狼同士もお互いが誰か分かりません</strong>。誤って仲間を襲うことも…
      </div>

      <div class="card">
        <p class="section-label">参加AI人数</p>
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
            ブラウザから直接APIを呼ぶため、対応環境で動作します。
          </p>
        </div>
        <div id="mock-note" class="${cfg.provider === 'mock' ? '' : 'hidden'}" style="color:var(--text-dim); font-size:12.5px;">
          APIキーなしで、あらかじめ用意した応答でゲームの流れを体験できます。
          実際のAIの推理・欺瞞を見るには「本物のAI」を選んでください。
        </div>
      </div>

      <button class="btn-primary" id="start">観戦をはじめる ▶</button>
      <p class="footer-note">AIの応答には数秒かかります。人数が多いほど1日の進行に時間がかかります。</p>
    `;

    document.getElementById('minus').onclick = () => {
      if (state.playerCount > 5) { state.playerCount--; renderSetup(); }
    };
    document.getElementById('plus').onclick = () => {
      if (state.playerCount < 10) { state.playerCount++; renderSetup(); }
    };
    app.querySelectorAll('.mode-btn').forEach((b) => {
      b.onclick = () => { cfg.provider = b.dataset.provider; persistFromForm(); renderSetup(); };
    });
    const modelEl = document.getElementById('model');
    if (modelEl) modelEl.onchange = () => { cfg.model = modelEl.value; persistFromForm(); };
    const keyEl = document.getElementById('apikey');
    if (keyEl) keyEl.oninput = () => { cfg.apiKey = keyEl.value.trim(); };

    document.getElementById('start').onclick = () => {
      persistFromForm();
      if (cfg.provider === 'real' && !cfg.apiKey) {
        alert('APIキーを入力するか、デモモードを選択してください。');
        return;
      }
      startGame();
    };
  }

  function persistFromForm() {
    const keyEl = document.getElementById('apikey');
    if (keyEl) cfg.apiKey = keyEl.value.trim();
    const modelEl = document.getElementById('model');
    if (modelEl) cfg.model = modelEl.value;
    AI.saveConfig(cfg);
  }

  function describeComposition(n) {
    const c = AI_PRESETS[n];
    return Object.entries(c)
      .map(([k, v]) => `${ROLES[k].emoji}${ROLES[k].name}×${v}`)
      .join('　');
  }

  // ============ ゲーム開始 ============

  function startGame() {
    const names = PERSONAS.slice(0, state.playerCount).map((p) => p.name);
    game.init(names, AI_PRESETS[state.playerCount]);
    state.log = [];
    state.seerKnowledge = {};
    state.aborted = false;
    state.running = true;

    pushLog({ kind: 'banner', text: `AI人狼 開始（${state.playerCount}人・1日目の昼から）`, icon: '🎬' });
    pushLog({ kind: 'roster' });
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

  // ============ ゲーム進行（非同期ループ）============

  async function runGameLoop() {
    // 1日目は昼（議論）からスタートする
    while (!state.aborted) {
      // ---- 昼：議論 ----
      pushLog({ kind: 'banner', text: `${game.day}日目の昼`, icon: '☀️', cls: 'day' });
      pushLog({ kind: 'system', text: '── 議論タイム ──' });
      state.discussionHistory = [];
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
      } else {
        dawn.deaths.forEach((d) =>
          pushLog({ kind: 'death', name: d.name, text: `${d.name} が無残な姿で発見された。` }));
      }

      win = game.checkWin();
      if (win) return finish(win);
    }
  }

  // 夜の行動
  async function runNight() {
    // 占い師
    const seers = game.alivePlayers().filter((p) => p.role === 'seer');
    for (const seer of seers) {
      const candidates = game.alivePlayers().filter((p) => p.id !== seer.id);
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

    // ボディーガード（自分以外を護衛。護衛先は襲撃されても死なない）
    game._pendingGuard = null;
    const hunters = game.alivePlayers().filter((p) => p.role === 'hunter');
    for (const hunter of hunters) {
      const candidates = game.alivePlayers().filter((p) => p.id !== hunter.id);
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
      // 仲間を知らないため、自分以外の全員が対象（誤って仲間を襲うこともある）
      const candidates = game.alivePlayers().filter((p) => p.id !== wolf.id);
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
    // 最多得票を襲撃先に
    let best = null, bestN = -1;
    for (const [id, n] of Object.entries(votes)) {
      if (n > bestN) { bestN = n; best = Number(id); }
    }
    game._pendingAttack = best;
  }

  // 昼の発言
  async function runSpeech(player) {
    const res = await askSpeech(player);
    const line = `${player.name}「${res.speech}」`;
    state.discussionHistory.push(line);
    pushLog({
      kind: 'speech', name: player.name, role: player.role,
      thought: res.thought, speech: res.speech,
    });
  }

  // 投票
  async function runVote() {
    const counts = {};
    game.alivePlayers().forEach((p) => { counts[p.id] = 0; });
    for (const p of game.alivePlayers()) {
      if (state.aborted) return;
      const candidates = game.alivePlayers().filter((x) => x.id !== p.id);
      const res = await askAction(p, 'vote', candidates,
        'あなたは今から追放する人物に投票します。これまでの議論をふまえ、最も人狼だと思う人を一人選び、本音の根拠を述べてください。');
      const target = resolveTargetName(res.target, candidates);
      if (target) {
        counts[target.id]++;
        pushLog({
          kind: 'vote', name: p.name, role: p.role,
          thought: res.thought, target: target.name,
        });
      }
    }
    const result = game.resolveVote(counts);
    if (result.tie) {
      pushLog({ kind: 'system', text: '投票は同数。今回は誰も追放されなかった。' });
    } else {
      pushLog({ kind: 'death', name: result.executed.name, text: `投票の結果、${result.executed.name} が追放された。` });
    }
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
    pushLog({ kind: 'result', winner: win.winner, text: map.text, icon: map.icon, cls: map.cls, reason: win.reason });
    renderGame();
  }

  // ============ AI呼び出しラッパ ============

  function baseSystem(player) {
    const role = ROLES[player.role];
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
      `役職の説明: ${role.ability}\n勝利条件: ${role.winText}${extra}\n` +
      `常に「${player.name}」として振る舞い、自分の陣営の勝利を目指してください。` +
      `人狼陣営は村人になりすまして欺き、村人陣営は発言の矛盾から人狼を推理してください。` +
      `応答は必ず日本語のJSONで返してください。`;
  }

  function publicStateText() {
    const alive = game.alivePlayers().map((p) => p.name).join('、');
    const dead = game.players.filter((p) => !p.alive)
      .map((p) => `${p.name}(${p.causeOfDeath === 'attacked' ? '襲撃' : p.causeOfDeath === 'executed' ? '追放' : '死亡'})`).join('、') || 'なし';
    const talk = state.discussionHistory.length ? state.discussionHistory.join('\n') : '（まだ発言なし）';
    return `【${game.day}日目】\n生存者: ${alive}\n死亡者: ${dead}\n\nこれまでの議論:\n${talk}`;
  }

  async function askSpeech(player) {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['thought', 'speech'],
      properties: {
        thought: { type: 'string', description: 'あなたの本音・戦略（他プレイヤーには見えない）' },
        speech: { type: 'string', description: '実際に全員に向けて発言する内容' },
      },
    };
    const userText = `${publicStateText()}\n\nあなたの番です。全員に向けて発言してください。` +
      `thought にはあなたの本当の考え（正体や狙い）を、speech には実際に口にする発言を書いてください。` +
      `人狼や狂人なら speech で嘘をついて構いません。`;
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
    app.innerHTML = `
      <div class="ai-topbar">
        <div class="ai-day">${game.phase === 'result' ? '決着' : game.day + '日目'} ・ 生存 ${game.alivePlayers().length}/${game.players.length}</div>
        <label class="reveal-toggle">
          <input type="checkbox" id="reveal" ${state.revealThoughts ? 'checked' : ''}>
          🔬 AIの本音を表示
        </label>
      </div>
      <div class="ai-log" id="ai-log">${entries}</div>
      <div class="ai-controls">
        ${state.running
          ? `<button class="btn-secondary" id="stop">■ 観戦を中止</button>`
          : `<div class="btn-row">
               <button class="btn-secondary" id="setup">⚙ 設定に戻る</button>
               <button class="btn-primary" id="again">▶ 同じ設定でもう一局</button>
             </div>`}
      </div>
    `;

    const rev = document.getElementById('reveal');
    if (rev) rev.onchange = () => { state.revealThoughts = rev.checked; renderGame(); };
    const stop = document.getElementById('stop');
    if (stop) stop.onclick = () => { state.aborted = true; state.running = false; pushLog({ kind: 'system', text: '観戦を中止しました。' }); };
    const setup = document.getElementById('setup');
    if (setup) setup.onclick = renderSetup;
    const again = document.getElementById('again');
    if (again) again.onclick = startGame;

    // 最新へスクロール
    const logEl = document.getElementById('ai-log');
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
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
    const p = game.getPlayer ? game.players.find((x) => x.name === name) : null;
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
      case 'speech':
        return `<div class="ai-bubble">
            <div class="ai-bubble-head">${avatar(e.name)}<strong>${esc(e.name)}</strong>${roleBadge(e.role)}</div>
            <div class="ai-speech">${esc(e.speech)}</div>
            ${thoughtBlock(e.thought)}
          </div>`;
      case 'night':
        // ネタバレ防止：本音表示がオフの間は誰が何をしたか伏せる
        if (!state.revealThoughts) {
          return `<div class="ai-sys">🌙 誰かがひそかに動いた…（「🔬 AIの本音を表示」で見られます）</div>`;
        }
        return `<div class="ai-bubble ai-night-act">
            <div class="ai-bubble-head">${avatar(e.name)}<strong>${esc(e.name)}</strong>${roleBadge(e.role)}<span class="ai-tag">夜の行動</span></div>
            <div class="ai-action">🌙 ${esc(e.action)}</div>
            ${thoughtBlock(e.thought)}
          </div>`;
      case 'vote':
        return `<div class="ai-bubble ai-vote">
            <div class="ai-bubble-head">${avatar(e.name)}<strong>${esc(e.name)}</strong>${roleBadge(e.role)}<span class="ai-tag">投票</span></div>
            <div class="ai-action">🗳️ ${esc(e.target)} に投票</div>
            ${thoughtBlock(e.thought)}
          </div>`;
      case 'result':
        return `<div class="result-banner ${e.cls}" style="margin-top:16px;">
            <div class="win-emoji">${e.icon}</div>
            <div class="win-title">${esc(e.text)}</div>
            <div class="win-reason">${esc(e.reason)}</div>
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
