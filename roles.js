/**
 * 役職定義
 * team: 'village'（村人陣営） | 'wolf'（人狼陣営） | 'fox'（第三陣営）
 * key: 内部識別子
 */
const ROLES = {
  villager: {
    key: 'villager',
    name: '村人',
    team: 'village',
    emoji: '👨‍🌾',
    color: '#4caf82',
    short: '特別な能力を持たない一般市民。議論と推理で人狼を見つけ出そう。',
    ability: '能力はありません。会話と投票で人狼を追放するのがあなたの役目です。',
    winText: '生き残った人狼を全員追放すれば勝利です。',
  },
  werewolf: {
    key: 'werewolf',
    name: '人狼',
    team: 'wolf',
    emoji: '🐺',
    color: '#e0567a',
    short: '夜に村人を襲撃する。正体を隠して村人を欺こう。',
    ability: '夜、人狼全員で相談し村人を一人襲撃します。仲間の人狼が誰かを把握できます。',
    winText: '村人の数を人狼の数以下にすれば勝利です。',
  },
  seer: {
    key: 'seer',
    name: '占い師',
    team: 'village',
    emoji: '🔮',
    color: '#5b8def',
    short: '夜に一人を占い、人狼かどうかを知ることができる。',
    ability: '夜、一人を選んで占い、その人が「人狼」か「人狼ではない」かを知ります。',
    winText: '生き残った人狼を全員追放すれば勝利です。',
  },
  medium: {
    key: 'medium',
    name: '霊media',
    team: 'village',
    emoji: '📿',
    color: '#8a6fd4',
    short: '追放された人が人狼だったかを知ることができる。',
    ability: '昼に追放された人物が「人狼」だったか「人狼ではなかった」かを夜に知ります。',
    winText: '生き残った人狼を全員追放すれば勝利です。',
  },
  hunter: {
    key: 'hunter',
    name: '狩人',
    team: 'village',
    emoji: '🏹',
    color: '#3fa9a0',
    short: '夜に一人を守り、人狼の襲撃から救うことができる。',
    ability: '夜、一人を選んで護衛します。護衛した相手が襲撃されても死にません（自分は護衛不可）。',
    winText: '生き残った人狼を全員追放すれば勝利です。',
  },
  madman: {
    key: 'madman',
    name: '狂人',
    team: 'wolf',
    emoji: '🃏',
    color: '#d98b4a',
    short: '人狼陣営の村人。人狼が誰かは知らないが、人狼の勝利を目指す。',
    ability: '特別な能力はありませんが、占うと「人狼ではない」と出ます。人狼陣営の勝利があなたの勝利です。',
    winText: '人狼陣営が勝利すれば、あなたも勝利です。',
  },
  mason: {
    key: 'mason',
    name: '共有者',
    team: 'village',
    emoji: '🤝',
    color: '#c9a24b',
    short: 'お互いが村人陣営だと確認し合える仲間。',
    ability: '共有者同士はお互いの正体を知っています。信頼できる味方として協力しましょう。',
    winText: '生き残った人狼を全員追放すれば勝利です。',
  },
  fox: {
    key: 'fox',
    name: '妖狐',
    team: 'fox',
    emoji: '🦊',
    color: '#e6a23c',
    short: '第三陣営。占われると死ぬが、襲撃では死なない。',
    ability: '襲撃では死にませんが、占い師に占われると死亡します。生き残ることを目指します。',
    winText: 'ゲーム終了時に生き残っていれば、あなただけの単独勝利です。',
  },
};

// 霊媒師の表示名（絵文字混入を修正した正しい名前）
ROLES.medium.name = '霊媒師';

/**
 * プレイヤー人数ごとの推奨編成プリセット
 */
const PRESETS = {
  4: { villager: 1, werewolf: 1, seer: 1, madman: 1 },
  5: { villager: 2, werewolf: 1, seer: 1, madman: 1 },
  6: { villager: 2, werewolf: 2, seer: 1, hunter: 1 },
  7: { villager: 2, werewolf: 2, seer: 1, hunter: 1, madman: 1 },
  8: { villager: 3, werewolf: 2, seer: 1, hunter: 1, madman: 1 },
  9: { villager: 3, werewolf: 2, seer: 1, medium: 1, hunter: 1, madman: 1 },
  10: { villager: 3, werewolf: 2, seer: 1, medium: 1, hunter: 1, madman: 1, mason: 0 },
  11: { villager: 4, werewolf: 3, seer: 1, medium: 1, hunter: 1, madman: 1 },
  12: { villager: 4, werewolf: 3, seer: 1, medium: 1, hunter: 1, madman: 1, fox: 1 },
};

/**
 * AI観戦モード用のプリセット（欺瞞・推理が映える役職構成）
 */
const AI_PRESETS = {
  5: { villager: 2, werewolf: 1, seer: 1, madman: 1 },
  6: { villager: 3, werewolf: 2, seer: 1 },
  7: { villager: 3, werewolf: 2, seer: 1, madman: 1 },
  8: { villager: 4, werewolf: 2, seer: 1, madman: 1 },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ROLES, PRESETS, AI_PRESETS };
}
