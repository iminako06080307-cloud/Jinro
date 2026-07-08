/**
 * 人狼ゲーム UIコントローラー
 * 画面遷移とゲーム進行を管理する。
 */
(function () {
  'use strict';

  const game = new WerewolfGame();
  const app = document.getElementById('app');

  // UI状態
  const ui = {
    screen: 'home',      // home | setup | compose | reveal | night | dawn | day | vote | result
    playerCount: 6,
    names: [],
    composition: {},
    revealIndex: 0,
    revealShown: false,
    // 夜フェーズの進行
    nightStep: 0,        // 現在の役職ステップ
    nightSequence: [],   // その夜に処理する役職ステップの並び
    nightData: {},       // 占い結果や選択の一時保存
    // 投票
    voteIndex: 0,
    votes: {},           // voterId -> targetId
    // タイマー
    timer: null,
    timeLeft: 0,
  };

  // ============ ユーティリティ ============

  function h(html) {
    // 画面全体を差し替える
    app.innerHTML = html;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function teamTag(team) {
    const map = { village: ['村人陣営', 'team-village'], wolf: ['人狼陣営', 'team-wolf'], fox: ['第三陣営', 'team-fox'] };
    const [label, cls] = map[team];
    return `<span class="team-tag ${cls}">${label}</span>`;
  }

  function clearTimer() {
    if (ui.timer) {
      clearInterval(ui.timer);
      ui.timer = null;
    }
  }

  // ============ ホーム画面 ============

  function renderHome() {
    ui.screen = 'home';
    clearTimer();
    h(`
      <h1 class="title"><span class="moon">🌙</span> 人狼ゲーム</h1>
      <p class="subtitle">1台のスマホを回して遊ぶ ゲームマスター補助アプリ</p>

      <div class="card">
        <h2>🎭 遊び方</h2>
        <ol class="step-guide">
          <li>参加人数と名前を入力します</li>
          <li>役職構成を決めます（推奨編成も選べます）</li>
          <li>スマホを回して、各自こっそり役職を確認します</li>
          <li>夜フェーズ：人狼の襲撃・占いなどを進行します</li>
          <li>昼フェーズ：議論して投票で追放者を決めます</li>
          <li>勝敗が決まるまで夜と昼を繰り返します</li>
        </ol>
      </div>

      <div class="info-box">
        👥 <strong>4〜12人</strong>で遊べます。役職や能力の説明もアプリ内に表示されるので、初めての方でも安心です。
      </div>

      <button class="btn-primary" id="start-btn">ゲームをはじめる</button>
      <p class="footer-note">このアプリはオフラインで動作します。データは端末外に送信されません。</p>
    `);
    document.getElementById('start-btn').onclick = renderSetup;
  }

  // ============ セットアップ：人数と名前 ============

  function renderSetup() {
    ui.screen = 'setup';
    // 既存の名前配列を人数に合わせて調整
    resizeNames();

    h(`
      <h1 class="title">👥 参加者を設定</h1>
      <p class="subtitle">プレイする人数と名前を入力してください</p>

      <div class="card">
        <p class="section-label">参加人数</p>
        <div class="stepper">
          <button id="minus">−</button>
          <div class="count">${ui.playerCount}<small>人</small></div>
          <button id="plus">＋</button>
        </div>
      </div>

      <div class="card">
        <p class="section-label">プレイヤー名（未入力なら自動で番号がつきます）</p>
        <div id="name-list"></div>
      </div>

      <div class="btn-row">
        <button class="btn-secondary" id="back">戻る</button>
        <button class="btn-primary" id="next">役職を決める →</button>
      </div>
    `);

    renderNameInputs();

    document.getElementById('minus').onclick = () => {
      if (ui.playerCount > 4) { ui.playerCount--; resizeNames(); renderSetup(); }
    };
    document.getElementById('plus').onclick = () => {
      if (ui.playerCount < 12) { ui.playerCount++; resizeNames(); renderSetup(); }
    };
    document.getElementById('back').onclick = renderHome;
    document.getElementById('next').onclick = () => {
      collectNames();
      // 現在の人数に対応するプリセットを初期構成として採用
      if (!ui.composition || Object.keys(ui.composition).length === 0 ||
          countComposition(ui.composition) !== ui.playerCount) {
        ui.composition = presetFor(ui.playerCount);
      }
      renderCompose();
    };
  }

  function resizeNames() {
    while (ui.names.length < ui.playerCount) ui.names.push('');
    ui.names.length = ui.playerCount;
  }

  function renderNameInputs() {
    const list = document.getElementById('name-list');
    list.innerHTML = ui.names.map((name, i) => `
      <div class="name-input">
        <div class="num">${i + 1}</div>
        <input type="text" data-idx="${i}" value="${esc(name)}"
               placeholder="プレイヤー${i + 1}" maxlength="12">
      </div>
    `).join('');
    // 入力を即時反映
    list.querySelectorAll('input').forEach((inp) => {
      inp.oninput = (e) => {
        ui.names[Number(e.target.dataset.idx)] = e.target.value;
      };
    });
  }

  function collectNames() {
    app.querySelectorAll('#name-list input').forEach((inp) => {
      ui.names[Number(inp.dataset.idx)] = inp.value.trim();
    });
  }

  // ============ 役職構成 ============

  function presetFor(count) {
    const preset = PRESETS[count] || {};
    // 0のものは除外してコピー
    const result = {};
    for (const [k, v] of Object.entries(preset)) {
      if (v > 0) result[k] = v;
    }
    return result;
  }

  function countComposition(compo) {
    return Object.values(compo).reduce((a, b) => a + b, 0);
  }

  function renderCompose() {
    ui.screen = 'compose';
    const order = ['villager', 'werewolf', 'seer', 'medium', 'hunter', 'madman', 'mason', 'fox'];
    const total = countComposition(ui.composition);
    const wolfCount = ui.composition.werewolf || 0;

    const rows = order.map((key) => {
      const role = ROLES[key];
      const val = ui.composition[key] || 0;
      return `
        <div class="role-row">
          <div class="role-emoji">${role.emoji}</div>
          <div class="role-info">
            <div class="role-name">${role.name} ${teamTag(role.team)}</div>
            <div class="role-desc">${esc(role.short)}</div>
          </div>
          <div class="counter">
            <button data-role="${key}" data-op="-1" ${val <= 0 ? 'disabled' : ''}>−</button>
            <div class="val">${val}</div>
            <button data-role="${key}" data-op="1" ${total >= ui.playerCount ? 'disabled' : ''}>＋</button>
          </div>
        </div>`;
    }).join('');

    const valid = total === ui.playerCount && wolfCount >= 1 && wolfCount < ui.playerCount - wolfCount;
    let summaryText, summaryCls;
    if (total !== ui.playerCount) {
      summaryText = `合計 ${total} / ${ui.playerCount} 人（あと${ui.playerCount - total > 0 ? ui.playerCount - total + '人' : (total - ui.playerCount) + '人多い'}）`;
      summaryCls = 'ng';
    } else if (wolfCount < 1) {
      summaryText = '人狼が1人以上必要です';
      summaryCls = 'ng';
    } else if (wolfCount >= ui.playerCount - wolfCount) {
      summaryText = '人狼が多すぎます（開始時点で人狼勝利になります）';
      summaryCls = 'ng';
    } else {
      summaryText = `✓ 合計 ${total} 人 で開始できます`;
      summaryCls = 'ok';
    }

    h(`
      <h1 class="title">🎭 役職を決める</h1>
      <p class="subtitle">${ui.playerCount}人分の役職を割り当ててください</p>

      <div class="card">
        <button class="preset-btn" id="preset" style="margin-bottom:14px;">↻ ${ui.playerCount}人の推奨編成に戻す</button>
        ${rows}
        <div class="compo-summary ${summaryCls}">
          <span>${summaryText}</span>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn-secondary" id="back">戻る</button>
        <button class="btn-primary" id="next" ${valid ? '' : 'disabled'}>役職を配る →</button>
      </div>
    `);

    app.querySelectorAll('.counter button').forEach((btn) => {
      btn.onclick = () => {
        const key = btn.dataset.role;
        const op = Number(btn.dataset.op);
        const cur = ui.composition[key] || 0;
        const newTotal = total + op;
        if (op > 0 && newTotal > ui.playerCount) return;
        if (op < 0 && cur <= 0) return;
        ui.composition[key] = cur + op;
        if (ui.composition[key] <= 0) delete ui.composition[key];
        renderCompose();
      };
    });

    document.getElementById('preset').onclick = () => {
      ui.composition = presetFor(ui.playerCount);
      renderCompose();
    };
    document.getElementById('back').onclick = renderSetup;
    document.getElementById('next').onclick = startGame;
  }

  // ============ ゲーム開始・役職配布 ============

  function startGame() {
    // 名前の空欄を補完
    const names = ui.names.map((n, i) => n && n.trim() ? n.trim() : `プレイヤー${i + 1}`);
    // 重複チェックはしないが、空欄は番号で補完済み
    game.init(names, ui.composition);
    ui.revealIndex = 0;
    ui.revealShown = false;
    renderReveal();
  }

  function renderReveal() {
    ui.screen = 'reveal';
    const player = game.players[ui.revealIndex];
    const total = game.players.length;

    const dots = game.players.map((_, i) => {
      let cls = 'dot';
      if (i < ui.revealIndex) cls += ' done';
      else if (i === ui.revealIndex) cls += ' current';
      return `<div class="${cls}"></div>`;
    }).join('');

    if (!ui.revealShown) {
      // 「次の人に渡してください」画面
      h(`
        <div class="reveal-screen">
          <div class="progress-dots">${dots}</div>
          <div class="reveal-pass">📱 スマホを渡してください</div>
          <div class="reveal-name">${esc(player.name)} さん</div>
          <p class="reveal-hint">他の人に画面が見えないように注意して、<br>準備ができたらタップしてください。</p>
          <button class="btn-primary" id="show">${esc(player.name)}さんの役職を見る</button>
        </div>
      `);
      document.getElementById('show').onclick = () => {
        ui.revealShown = true;
        renderReveal();
      };
    } else {
      // 役職開示画面
      const role = ROLES[player.role];
      let matesHtml = '';

      if (player.role === 'werewolf') {
        const mates = game.playersByRole('werewolf').filter((p) => p.id !== player.id);
        if (mates.length > 0) {
          matesHtml = `<div class="reveal-mates">🐺 仲間の人狼： <strong>${mates.map((m) => esc(m.name)).join('、')}</strong></div>`;
        } else {
          matesHtml = `<div class="reveal-mates">あなたが唯一の人狼です</div>`;
        }
      } else if (player.role === 'mason') {
        const mates = game.playersByRole('mason').filter((p) => p.id !== player.id);
        if (mates.length > 0) {
          matesHtml = `<div class="reveal-mates">🤝 共有者の仲間： <strong>${mates.map((m) => esc(m.name)).join('、')}</strong></div>`;
        }
      }

      const isLast = ui.revealIndex >= total - 1;

      h(`
        <div class="reveal-screen">
          <div class="reveal-card" style="border-color:${role.color}; background:linear-gradient(180deg, ${role.color}22, rgba(0,0,0,0.4));">
            <div class="big-emoji">${role.emoji}</div>
            <div class="role-title" style="color:${role.color}">${role.name}</div>
            ${teamTag(role.team)}
            <p class="role-ability">${esc(role.ability)}</p>
            ${matesHtml}
          </div>
          <p class="reveal-hint">確認したら「隠す」を押して次の人に渡してください。</p>
          <button class="btn-primary" id="hide">🔒 隠して次の人へ</button>
        </div>
      `);

      document.getElementById('hide').onclick = () => {
        if (isLast) {
          // 全員確認完了 → 夜フェーズへ
          renderNightIntro();
        } else {
          ui.revealIndex++;
          ui.revealShown = false;
          renderReveal();
        }
      };
    }
  }

  // ============ 夜フェーズ ============

  function buildNightSequence() {
    // その夜に処理する役職ステップを、生存状況を見て構築する
    const seq = [];
    if (game.hasAliveRole('seer')) seq.push('seer');
    if (game.hasAliveRole('medium') && game.day > 1 && game.lastExecuted != null) seq.push('medium');
    if (game.hasAliveRole('hunter')) seq.push('hunter');
    // 人狼の襲撃は必ず最後
    seq.push('werewolf');
    return seq;
  }

  function renderNightIntro() {
    ui.screen = 'night';
    clearTimer();
    ui.nightSequence = buildNightSequence();
    ui.nightStep = 0;
    ui.nightData = {};

    h(`
      <div class="phase-banner night">
        <div class="phase-icon">🌙</div>
        <div class="phase-name">${game.day}日目の夜</div>
        <div class="phase-day">全員、目を閉じてください</div>
      </div>
      <div class="card">
        <h2>🌌 夜が訪れました</h2>
        <p style="color:var(--text-dim); font-size:14px;">
          ゲームマスターは画面の指示に従って進行してください。
          能力を持つ人だけがこっそり画面を確認します。
          周りの人に見られないよう注意しましょう。
        </p>
      </div>
      <button class="btn-primary" id="start-night">夜の進行をはじめる</button>
    `);
    document.getElementById('start-night').onclick = renderNightStep;
  }

  function renderNightStep() {
    if (ui.nightStep >= ui.nightSequence.length) {
      resolveNightAndShowDawn();
      return;
    }
    const roleKey = ui.nightSequence[ui.nightStep];
    if (roleKey === 'seer') renderSeerStep();
    else if (roleKey === 'medium') renderMediumStep();
    else if (roleKey === 'hunter') renderHunterStep();
    else if (roleKey === 'werewolf') renderWerewolfStep();
  }

  function passScreen(roleName, roleEmoji, onReady) {
    // 能力者に画面を渡す共通の中間画面
    h(`
      <div class="reveal-screen">
        <div class="reveal-pass" style="margin-top:20px;">${roleEmoji} ${roleName} の番です</div>
        <p class="reveal-hint" style="margin-top:16px;">
          ${roleName}の人だけが画面を確認してください。<br>
          他の人は目を閉じたままで。
        </p>
        <button class="btn-primary" id="ready">${roleName}を確認する</button>
        <button class="btn-ghost" id="skip" style="margin-top:12px;">この役職はいない / スキップ</button>
      </div>
    `);
    document.getElementById('ready').onclick = onReady;
    document.getElementById('skip').onclick = () => {
      ui.nightStep++;
      renderNightStep();
    };
  }

  function renderPlayerSelect(opts) {
    // opts: { title, subtitle, filter, allowNone, noneLabel, onSelect, showRole }
    const alive = game.alivePlayers().filter(opts.filter || (() => true));
    const chips = alive.map((p) => `
      <button class="player-chip" data-id="${p.id}">${esc(p.name)}
        ${opts.showRole ? `<span class="chip-role">${ROLES[p.role].emoji} ${ROLES[p.role].name}</span>` : ''}
      </button>
    `).join('');

    h(`
      <div class="card">
        <h2>${opts.title}</h2>
        <p style="color:var(--text-dim); font-size:14px; margin-top:-6px;">${opts.subtitle || ''}</p>
        <div class="player-select">${chips}</div>
        ${opts.allowNone ? `<button class="btn-secondary" id="none" style="margin-top:14px;">${opts.noneLabel || '選ばない'}</button>` : ''}
      </div>
    `);

    app.querySelectorAll('.player-chip').forEach((chip) => {
      chip.onclick = () => opts.onSelect(Number(chip.dataset.id));
    });
    if (opts.allowNone) {
      document.getElementById('none').onclick = () => opts.onSelect(null);
    }
  }

  function renderSeerStep() {
    passScreen('占い師', '🔮', () => {
      renderPlayerSelect({
        title: '🔮 誰を占いますか？',
        subtitle: '選んだ人が人狼かどうかを確認できます。',
        filter: (p) => p.role !== 'seer' || game.playersByRole('seer').length > 1,
        onSelect: (id) => {
          const result = game.divine(id);
          const label = result.result === 'wolf'
            ? `<div class="result-msg wolf-found">🐺 ${esc(result.name)} は<br><strong>人狼</strong>です！</div>`
            : `<div class="result-msg safe">✓ ${esc(result.name)} は<br><strong>人狼ではありません</strong></div>`;
          h(`
            <div class="card">
              <h2>🔮 占い結果</h2>
              ${label}
              <p style="color:var(--text-dim); font-size:13px; text-align:center;">
                結果を覚えたら次へ進んでください。他の人に見られないように！
              </p>
              <button class="btn-primary" id="next">確認した（次へ）</button>
            </div>
          `);
          document.getElementById('next').onclick = () => {
            ui.nightStep++;
            renderNightStep();
          };
        },
      });
    });
  }

  function renderMediumStep() {
    passScreen('霊媒師', '📿', () => {
      const result = game.seance();
      let body;
      if (!result) {
        body = `<div class="peaceful">まだ追放された人がいないため、確認する結果はありません。</div>`;
      } else {
        body = result.result === 'wolf'
          ? `<div class="result-msg wolf-found">🐺 追放された ${esc(result.name)} は<br><strong>人狼でした</strong></div>`
          : `<div class="result-msg safe">追放された ${esc(result.name)} は<br><strong>人狼ではありませんでした</strong></div>`;
      }
      h(`
        <div class="card">
          <h2>📿 霊媒結果</h2>
          ${body}
          <button class="btn-primary" id="next">確認した（次へ）</button>
        </div>
      `);
      document.getElementById('next').onclick = () => {
        ui.nightStep++;
        renderNightStep();
      };
    });
  }

  function renderHunterStep() {
    passScreen('狩人', '🏹', () => {
      renderPlayerSelect({
        title: '🏹 誰を守りますか？',
        subtitle: '護衛した相手は今夜の襲撃から守られます（自分は選べません）。',
        filter: (p) => p.role !== 'hunter',
        onSelect: (id) => {
          ui.nightData.guardTargetId = id;
          game._addLog(`狩人が${game.getPlayer(id).name}を護衛した`);
          ui.nightStep++;
          renderNightStep();
        },
      });
    });
  }

  function renderWerewolfStep() {
    passScreen('人狼', '🐺', () => {
      renderPlayerSelect({
        title: '🐺 誰を襲撃しますか？',
        subtitle: '人狼全員で相談して、襲撃する相手を1人選んでください。',
        filter: (p) => p.role !== 'werewolf',
        onSelect: (id) => {
          ui.nightData.attackTargetId = id;
          ui.nightStep++;
          renderNightStep();
        },
      });
    });
  }

  function resolveNightAndShowDawn() {
    const result = game.resolveNight({
      attackTargetId: ui.nightData.attackTargetId,
      guardTargetId: ui.nightData.guardTargetId,
    });
    renderDawn(result);
  }

  function renderDawn(result) {
    ui.screen = 'dawn';
    let deathsHtml;
    if (result.deaths.length === 0) {
      deathsHtml = `<div class="peaceful">🕊️ 昨夜は誰も命を落としませんでした。</div>`;
    } else {
      deathsHtml = `<div class="deaths-list">${result.deaths.map((d) => {
        const label = d.cause === 'cursed' ? '（占いにより死亡）' : '';
        return `<div class="death-item">☠️ ${esc(d.name)} さんが亡くなりました ${label}</div>`;
      }).join('')}</div>`;
    }

    // 勝敗判定
    const win = game.checkWin();

    h(`
      <div class="phase-banner day">
        <div class="phase-icon">☀️</div>
        <div class="phase-name">${game.day}日目の朝</div>
        <div class="phase-day">夜が明けました</div>
      </div>
      <div class="card">
        <h2>🌅 夜明けの結果</h2>
        ${deathsHtml}
      </div>
      <button class="btn-primary" id="next">${win ? '結果を見る' : '昼の議論へ →'}</button>
    `);

    document.getElementById('next').onclick = () => {
      if (win) renderResult(win);
      else renderDay();
    };
  }

  // ============ 昼フェーズ（議論タイマー） ============

  function renderDay() {
    ui.screen = 'day';
    ui.timeLeft = 180; // デフォルト3分
    clearTimer();

    const aliveList = game.alivePlayers().map((p) => esc(p.name)).join('、');

    h(`
      <div class="phase-banner day">
        <div class="phase-icon">💬</div>
        <div class="phase-name">${game.day}日目の議論</div>
        <div class="phase-day">生存者：${game.alivePlayers().length}人</div>
      </div>
      <div class="card">
        <h2>⏱️ 議論タイム</h2>
        <div class="timer-display" id="timer">3:00</div>
        <div class="btn-row" style="margin-bottom:10px;">
          <button class="btn-secondary" id="toggle">▶ スタート</button>
          <button class="btn-secondary" id="reset">リセット</button>
        </div>
        <div class="btn-row">
          <button class="preset-btn" data-sec="120">2分</button>
          <button class="preset-btn" data-sec="180">3分</button>
          <button class="preset-btn" data-sec="300">5分</button>
        </div>
      </div>
      <div class="info-box">
        👥 生存者：${aliveList}<br>
        話し合って怪しい人を絞り込みましょう。準備ができたら投票に進みます。
      </div>
      <button class="btn-primary" id="to-vote">投票にすすむ →</button>
    `);

    const timerEl = document.getElementById('timer');
    updateTimerDisplay(timerEl);

    let running = false;
    const toggleBtn = document.getElementById('toggle');

    toggleBtn.onclick = () => {
      if (running) {
        clearTimer();
        running = false;
        toggleBtn.textContent = '▶ 再開';
      } else {
        running = true;
        toggleBtn.textContent = '⏸ 一時停止';
        ui.timer = setInterval(() => {
          ui.timeLeft--;
          updateTimerDisplay(timerEl);
          if (ui.timeLeft <= 0) {
            clearTimer();
            running = false;
            toggleBtn.textContent = '▶ スタート';
            timerEl.textContent = '0:00';
          }
        }, 1000);
      }
    };

    document.getElementById('reset').onclick = () => {
      clearTimer();
      running = false;
      toggleBtn.textContent = '▶ スタート';
      updateTimerDisplay(timerEl);
    };

    app.querySelectorAll('[data-sec]').forEach((btn) => {
      btn.onclick = () => {
        clearTimer();
        running = false;
        toggleBtn.textContent = '▶ スタート';
        ui.timeLeft = Number(btn.dataset.sec);
        updateTimerDisplay(timerEl);
      };
    });

    document.getElementById('to-vote').onclick = () => {
      clearTimer();
      startVote();
    };
  }

  function updateTimerDisplay(el) {
    const m = Math.floor(ui.timeLeft / 60);
    const s = ui.timeLeft % 60;
    el.textContent = `${m}:${String(s).padStart(2, '0')}`;
    el.className = 'timer-display';
    if (ui.timeLeft <= 10) el.className += ' danger';
    else if (ui.timeLeft <= 30) el.className += ' warn';
  }

  // ============ 投票フェーズ ============

  function startVote() {
    ui.screen = 'vote';
    ui.votes = {};
    ui.voteIndex = 0;
    renderVoteStep();
  }

  function renderVoteStep() {
    const alive = game.alivePlayers();
    if (ui.voteIndex >= alive.length) {
      renderVoteResult();
      return;
    }
    const voter = alive[ui.voteIndex];

    // 投票者に画面を渡す
    h(`
      <div class="reveal-screen">
        <div class="progress-dots">${alive.map((_, i) =>
          `<div class="dot ${i < ui.voteIndex ? 'done' : i === ui.voteIndex ? 'current' : ''}"></div>`).join('')}</div>
        <div class="reveal-pass" style="margin-top:16px;">🗳️ 投票してください</div>
        <div class="reveal-name">${esc(voter.name)} さん</div>
        <p class="reveal-hint">追放したい人を1人選んでください。<br>他の人に見られないように！</p>
        <button class="btn-primary" id="ready">投票する</button>
      </div>
    `);
    document.getElementById('ready').onclick = () => {
      renderPlayerSelect({
        title: `🗳️ ${esc(voter.name)}さんの投票`,
        subtitle: '追放したい人を選んでください。',
        filter: (p) => p.id !== voter.id,
        onSelect: (id) => {
          ui.votes[voter.id] = id;
          ui.voteIndex++;
          renderVoteStep();
        },
      });
    };
  }

  function renderVoteResult() {
    // 集計
    const counts = {};
    game.alivePlayers().forEach((p) => { counts[p.id] = 0; });
    Object.values(ui.votes).forEach((targetId) => {
      counts[targetId] = (counts[targetId] || 0) + 1;
    });

    // 得票表示用
    const sorted = Object.entries(counts)
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1]);

    const barsHtml = sorted.map(([id, c]) => {
      const p = game.getPlayer(Number(id));
      return `<div class="death-item">${esc(p.name)}：<strong>${c}票</strong></div>`;
    }).join('');

    const result = game.resolveVote(counts);

    let resultHtml;
    if (result.tie) {
      resultHtml = `<div class="peaceful">🤝 最多得票が同数のため、今回は誰も追放されませんでした。</div>`;
    } else {
      resultHtml = `<div class="result-msg wolf-found">☠️ ${esc(result.executed.name)} さんが追放されました</div>`;
    }

    const win = game.checkWin();

    h(`
      <div class="card">
        <h2>🗳️ 投票結果</h2>
        <div class="deaths-list">${barsHtml || '<div class="peaceful">票が入りませんでした</div>'}</div>
        ${resultHtml}
      </div>
      <button class="btn-primary" id="next">${win ? '結果を見る' : '次の夜へ →'}</button>
    `);

    document.getElementById('next').onclick = () => {
      if (win) {
        renderResult(win);
      } else {
        game.nextNight();
        renderNightIntro();
      }
    };
  }

  // ============ 結果画面 ============

  function renderResult(win) {
    ui.screen = 'result';
    clearTimer();

    const winInfo = {
      village: { emoji: '🎉', title: '村人陣営の勝利！', cls: 'village' },
      wolf: { emoji: '🐺', title: '人狼陣営の勝利！', cls: 'wolf' },
      fox: { emoji: '🦊', title: '妖狐の単独勝利！', cls: 'fox' },
    }[win.winner];

    const roster = game.players.map((p) => {
      const role = ROLES[p.role];
      return `
        <li>
          <span class="r-emoji">${role.emoji}</span>
          <span class="r-name">${esc(p.name)}<br>
            <span style="font-size:12px; color:${role.color}; font-weight:600;">${role.name}</span>
          </span>
          <span class="r-status ${p.alive ? 'alive' : 'dead'}">${p.alive ? '生存' : '死亡'}</span>
        </li>`;
    }).join('');

    const logHtml = game.log.map((l) =>
      `<li><span class="log-day">${l.day}日目</span>${esc(l.text)}</li>`).join('');

    h(`
      <div class="result-banner ${winInfo.cls}">
        <div class="win-emoji">${winInfo.emoji}</div>
        <div class="win-title">${winInfo.title}</div>
        <div class="win-reason">${esc(win.reason)}</div>
      </div>

      <div class="card">
        <h2>🎭 全員の役職</h2>
        <ul class="roster">${roster}</ul>
      </div>

      <div class="card">
        <h2>📜 進行ログ</h2>
        <ul class="log-list">${logHtml}</ul>
      </div>

      <div class="btn-row">
        <button class="btn-secondary" id="replay">同じ設定でもう一度</button>
        <button class="btn-primary" id="home">最初から</button>
      </div>
    `);

    document.getElementById('replay').onclick = () => {
      const names = game.players.map((p) => p.name);
      game.init(names, ui.composition);
      ui.revealIndex = 0;
      ui.revealShown = false;
      renderReveal();
    };
    document.getElementById('home').onclick = () => {
      game.reset();
      renderHome();
    };
  }

  // ============ 起動 ============

  renderHome();
})();
