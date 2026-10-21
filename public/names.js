// Drawn trader names, anime-style and family name first, as the comic
// writes its own (ADR 0018). Most family names are market puns, as the
// comic's are (福賀, 小金, 高根): 堂島 for the first futures exchange, 本間
// for the man who drew the first candlesticks, 一目 for the cloud chart,
// 損田 for a loss. Each has an English, Japanese and Chinese form, and the
// page shows the reader's. None is a house trader's. Shared by the server
// and the page.

export const FAMILY = [
  { en: "Dojima", ja: "堂島", zh: "堂岛" },
  { en: "Honma", ja: "本間", zh: "本间" },
  { en: "Ichimoku", ja: "一目", zh: "一目" },
  { en: "Kabuto", ja: "兜", zh: "兜" },
  { en: "Kabuki", ja: "株木", zh: "株木" },
  { en: "Zenigata", ja: "銭形", zh: "钱形" },
  { en: "Tsuburaya", ja: "円谷", zh: "圆谷" },
  { en: "Sonda", ja: "損田", zh: "损田" },
  { en: "Yasune", ja: "安値", zh: "安值" },
  { en: "Oshime", ja: "押目", zh: "押目" },
  { en: "Madono", ja: "窓野", zh: "窗野" },
  { en: "Higeno", ja: "髭野", zh: "须野" },
  { en: "Kanemori", ja: "金森", zh: "金森" },
  { en: "Shiozuke", ja: "塩漬", zh: "盐渍" },
  { en: "Rikaku", ja: "利確", zh: "利确" },
  { en: "Marunouchi", ja: "丸の内", zh: "丸之内" },
  { en: "Shinonome", ja: "東雲", zh: "东云" },
  { en: "Hoshino", ja: "星野", zh: "星野" },
  { en: "Tsukishima", ja: "月島", zh: "月岛" },
  { en: "Asahina", ja: "朝比奈", zh: "朝比奈" },
  { en: "Kurosawa", ja: "黒沢", zh: "黑泽" },
  { en: "Shirogane", ja: "白銀", zh: "白银" },
  { en: "Amamiya", ja: "雨宮", zh: "雨宫" },
  { en: "Kisaragi", ja: "如月", zh: "如月" },
];

export const GIVEN = [
  { en: "Hikari", ja: "ひかり", zh: "光" },
  { en: "Sakura", ja: "さくら", zh: "樱" },
  { en: "Yui", ja: "結衣", zh: "结衣" },
  { en: "Mio", ja: "澪", zh: "澪" },
  { en: "Rin", ja: "凛", zh: "凛" },
  { en: "Aoi", ja: "葵", zh: "葵" },
  { en: "Haruka", ja: "遥", zh: "遥" },
  { en: "Kanade", ja: "奏", zh: "奏" },
  { en: "Tsubasa", ja: "翼", zh: "翼" },
  { en: "Hinata", ja: "ひなた", zh: "日向" },
  { en: "Kaede", ja: "楓", zh: "枫" },
  { en: "Nozomi", ja: "希", zh: "希" },
  { en: "Akane", ja: "茜", zh: "茜" },
  { en: "Shiori", ja: "栞", zh: "栞" },
  { en: "Ren", ja: "蓮", zh: "莲" },
  { en: "Sora", ja: "空", zh: "空" },
  { en: "Hayate", ja: "疾風", zh: "疾风" },
  { en: "Kaito", ja: "海斗", zh: "海斗" },
  { en: "Yuki", ja: "雪", zh: "雪" },
  { en: "Mirai", ja: "未来", zh: "未来" },
  { en: "Asuka", ja: "明日香", zh: "明日香" },
  { en: "Riku", ja: "陸", zh: "陆" },
  { en: "Minato", ja: "湊", zh: "凑" },
  { en: "Chihiro", ja: "千尋", zh: "千寻" },
];

// A drawn name in a language: "Dojima Hikari", 堂島ひかり, 堂岛光.
export function drawn(lang, [f, g]) {
  const a = FAMILY[f];
  const b = GIVEN[g];
  return lang === "en" ? `${a.en} ${b.en}` : `${a[lang]}${b[lang]}`;
}
