/**
 * 人狼ゲームのコアロジック
 * UIから独立した状態管理・進行・勝敗判定を担当する。
 */
class WerewolfGame {
  constructor() {
    this.reset();
  }

  reset() {
    this.players = [];        // { id, name, role, alive, causeOfDeath }
    this.day = 0;             // 日目カウンタ（1日目からスタート）
    this.phase = 'setup';     // setup | night | day | vote | result
    this.log = [];            // 進行ログ
    this.lastExecuted = null; // 前日の投票で追放された人（霊媒師用）
    this.nightActions = {};   // その夜の行動記録
  }

  /**
   * プレイヤーと役職構成からゲームを初期化する。
   * @param {string[]} names プレイヤー名の配列
   * @param {Object} composition { roleKey: count } の役職構成
   */
  init(names, composition) {
    // 役職リストを構成から展開
    const roleDeck = [];
    for (const [roleKey, count] of Object.entries(composition)) {
      for (let i = 0; i < count; i++) roleDeck.push(roleKey);
    }
    if (roleDeck.length !== names.length) {
      throw new Error(`役職の合計(${roleDeck.length})とプレイヤー数(${names.length})が一致しません`);
    }

    // シャッフルして配布
    this._shuffle(roleDeck);
    this.players = names.map((name, i) => ({
      id: i,
      name,
      role: roleDeck[i],
      alive: true,
      causeOfDeath: null,
    }));

    this.day = 1;
    this.phase = 'night';
    this.log = [];
    this.lastExecuted = null;
    this.nightActions = {};
    this._addLog(`ゲーム開始（${names.length}人）`);
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  _addLog(text) {
    this.log.push({ day: this.day, phase: this.phase, text });
  }

  // --- 参照系ヘルパー ---

  getPlayer(id) {
    return this.players.find((p) => p.id === id);
  }

  alivePlayers() {
    return this.players.filter((p) => p.alive);
  }

  playersByRole(roleKey) {
    return this.players.filter((p) => p.role === roleKey);
  }

  aliveByTeam(team) {
    return this.alivePlayers().filter((p) => ROLES[p.role].team === team);
  }

  hasAliveRole(roleKey) {
    return this.players.some((p) => p.alive && p.role === roleKey);
  }

  /**
   * 占い結果を返す。妖狐は襲撃耐性があるが占いで死ぬ。
   * 狂人・村人系は「人狼ではない」。人狼のみ「人狼」。
   */
  divine(targetId) {
    const target = this.getPlayer(targetId);
    const isWolf = target.role === 'werewolf';
    // 妖狐は占われると呪殺される
    if (target.role === 'fox') {
      this.nightActions.foxCursed = targetId;
    }
    this._addLog(`占い師が${target.name}を占った → ${isWolf ? '人狼' : '人狼ではない'}`);
    return { name: target.name, result: isWolf ? 'wolf' : 'notwolf' };
  }

  /**
   * 霊媒結果を返す（前日追放者が人狼だったか）。
   */
  seance() {
    if (this.lastExecuted == null) return null;
    const target = this.getPlayer(this.lastExecuted);
    const isWolf = target.role === 'werewolf';
    return { name: target.name, result: isWolf ? 'wolf' : 'notwolf' };
  }

  /**
   * 夜の行動を確定し、襲撃・護衛・呪殺を解決する。
   * @param {Object} actions { attackTargetId, guardTargetId }
   * @returns {Object} 夜明けの結果
   */
  resolveNight(actions) {
    const deaths = [];
    const { attackTargetId, guardTargetId } = actions;

    // 妖狐の呪殺（占いで死亡）
    if (this.nightActions.foxCursed != null) {
      const fox = this.getPlayer(this.nightActions.foxCursed);
      if (fox && fox.alive) {
        fox.alive = false;
        fox.causeOfDeath = 'cursed';
        deaths.push({ id: fox.id, name: fox.name, cause: 'cursed' });
        this._addLog(`${fox.name}が占いにより呪殺された`);
      }
    }

    // 人狼の襲撃
    if (attackTargetId != null) {
      const target = this.getPlayer(attackTargetId);
      const guarded = guardTargetId != null && guardTargetId === attackTargetId;
      if (target && target.alive) {
        if (target.role === 'fox') {
          // 妖狐は襲撃では死なない
          this._addLog(`${target.name}が襲撃されたが、何も起きなかった`);
        } else if (guarded) {
          this._addLog(`${target.name}が襲撃されたが、狩人に守られた`);
        } else {
          target.alive = false;
          target.causeOfDeath = 'attacked';
          deaths.push({ id: target.id, name: target.name, cause: 'attacked' });
          this._addLog(`${target.name}が襲撃された`);
        }
      }
    }

    this.nightActions = {};
    this.phase = 'day';
    return { deaths, day: this.day };
  }

  /**
   * 昼の投票で最多得票者を追放する。
   * @param {Object} voteCounts { playerId: 票数 }
   * @returns {Object} { executed, tie }
   */
  resolveVote(voteCounts) {
    let maxVotes = -1;
    let candidates = [];
    for (const [id, count] of Object.entries(voteCounts)) {
      const pid = Number(id);
      if (count > maxVotes) {
        maxVotes = count;
        candidates = [pid];
      } else if (count === maxVotes) {
        candidates.push(pid);
      }
    }

    // 同数の場合は追放なし（ルールにより変更可能）
    if (candidates.length !== 1) {
      this.lastExecuted = null;
      this._addLog(`投票が同数のため、追放者なし`);
      return { executed: null, tie: true, candidates };
    }

    const executedId = candidates[0];
    const target = this.getPlayer(executedId);
    target.alive = false;
    target.causeOfDeath = 'executed';
    this.lastExecuted = executedId;
    this._addLog(`${target.name}が投票により追放された`);
    return { executed: { id: target.id, name: target.name }, tie: false };
  }

  /**
   * 勝敗を判定する。
   * @returns {Object|null} 決着していれば { winner, reason }、未決着ならnull
   */
  checkWin() {
    const alive = this.alivePlayers();
    const wolves = alive.filter((p) => p.role === 'werewolf');
    const foxes = alive.filter((p) => p.role === 'fox');
    // 人狼陣営以外（村人陣営 + 妖狐は人数計算上は村人側としてカウントしない）
    const villageSide = alive.filter((p) => ROLES[p.role].team === 'village');

    // 人狼が全滅
    if (wolves.length === 0) {
      // 妖狐が生きていれば妖狐の単独勝利
      if (foxes.length > 0) {
        return { winner: 'fox', reason: '人狼が全滅したが、妖狐が生き残った' };
      }
      return { winner: 'village', reason: '人狼を全て追放した' };
    }

    // 人狼数が村人陣営以上
    if (wolves.length >= villageSide.length) {
      if (foxes.length > 0) {
        return { winner: 'fox', reason: '人狼が村を制圧したが、妖狐が生き残った' };
      }
      return { winner: 'wolf', reason: '人狼の数が村人陣営以上になった' };
    }

    return null;
  }

  nextNight() {
    this.day += 1;
    this.phase = 'night';
    this.nightActions = {};
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WerewolfGame };
}
