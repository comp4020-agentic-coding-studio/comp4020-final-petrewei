// The About page for players, in English, Japanese and Chinese (ADR 0016).
// The course's README, the project's argument, stays at /readme/; this is
// what a player needs: what the game is, how a round goes, what the parody
// is and is not, where the prices come from, and where to get help.
// Each section is a heading and paragraphs; the server renders them.

export const ABOUT = {
  en: {
    title: "About Losscut!",
    lead: "A shared foreign-exchange market where everyone trades the same price at once, for play money. It parodies FX Fighter Kurumi-chan, the manga and anime about a student who trades with leverage to win back her family's losses.",
    sections: [
      ["Three tabs", ["History replays forty real trading days of one currency pair, with the date hidden until the bell. Most rounds hide a famous day: the Lehman collapse, Brexit, the day the Swiss franc broke its cap.", "Live starts from today's real exchange rate and simulates the forty days after it.", "Tutorial is a private practice market for one, twelve short lessons from your first trade to the gap that jumps a stop. Start here if you have never traded."]],
      ["How a round goes", ["Anyone on a tab presses Start; after a ten-second countdown, the round runs for three minutes. Pick a leverage, then Buy if you think the price will rise or Sell if you think it will fall. Close your position to bank the result, or add a stop to close it automatically.", "At the bell everyone is ranked by net worth, and History reveals the dates you traded. The hall of fame keeps everyone's profit and busts across rounds."]],
      ["Leverage, margin calls and the losscut", ["Leverage multiplies wins and losses. At 25×, a 4% move against you takes everything you put in. When your margin level falls to 50% the broker warns you, a margin call; at 20% it closes your position for you, the forced loss cut, 強制ロスカット. A price that jumps can wipe you out before any of that, which is how many traders lost everything in January 2015.", "When you are broke you may borrow from Dad's savings, twice a round. The debt counts against you. Borrowing to win back what you lost is the trap the comic is about."]],
      ["You and everyone else", ["Your browser is your trader, shown to others by a name such as Dojima Hikari and a short code. Click your name at the top to type your own, or draw another. Everyone on a tab trades in the same room, whatever language they read it in. Seven of the comic's characters play every round: Kurumi never cuts a loss, Mochiko trades small with tight stops, Mebuki holds for the interest, Yasuko only sells, Inago swarms onto every big move, Nana buys only what she believes in, and Kizuna chases a billion yen."]],
      ["What this is, and is not", ["A fan parody, not affiliated with the creators, KADOKAWA, the studio, or any broker. It uses no art from the series. Everything here is play money: nothing can be deposited or won, and nothing is advice.", "In real markets, most retail traders who use leverage lose money. If gambling or debt is hurting you, in Australia call the Gambling Help line on 1800 858 858, or visit gamblinghelponline.org.au."]],
      ["Where the prices come from", ["History uses the European Central Bank's euro reference rates since 1999, with other pairs worked out from them. Live starts from Frankfurter's rate for today. Between daily closes, and after Live's first day, the moves are simulated."]],
    ],
    readme: "For the course: the project's README",
    back: "Back to the market",
  },
  ja: {
    title: "ロスカット！について",
    lead: "全員が同じレートで同時にトレードする、共有の外国為替市場です。お金は仮想マネーだけ。家族の損失を取り返すためにレバレッジをかけてトレードする大学生を描いた漫画・アニメ『FX戦士くるみちゃん』のパロディです。",
    sections: [
      ["3つのタブ", ["ヒストリーは、ある通貨ペアの本物の40営業日を再生します。日付はベルが鳴るまで秘密。多くのラウンドには、リーマンショック、ブレグジット、スイスフランショックなどの有名な日が隠れています。", "ライブは今日の実際のレートから始まり、その先の40日をシミュレーションします。", "チュートリアルはひとり用の練習市場です。初めての取引から、逆指値を飛び越える窓開けまで、12の短いレッスン。トレードが初めてならここから。"]],
      ["ラウンドの流れ", ["タブにいる誰かがスタートを押すと、10秒のカウントダウンのあと3分間のラウンドが始まります。レバレッジを選び、上がると思えば買い、下がると思えば売り。決済で損益を確定し、逆指値を置けば自動で決済されます。", "ベルが鳴ると純資産で順位が決まり、ヒストリーでは取引していた日付が明かされます。殿堂には全員の通算損益と退場回数が残ります。"]],
      ["レバレッジ、追証、そしてロスカット", ["レバレッジは勝ちも負けも何倍にもします。25倍なら、4%の逆行で投入した資金がすべて消えます。証拠金維持率が50%まで下がるとブローカーから警告、つまり追証。20%で強制的に決済される、それが強制ロスカットです。価格が飛べば、その前に一瞬で退場することもあります。2015年1月、多くのトレーダーがそうして全てを失いました。", "資金が尽きたら、パパの貯金から1ラウンドに2回まで借りられます。借金は成績から引かれます。負けを取り返すために借りる。それこそがこの作品の描く罠です。"]],
      ["あなたと、ほかのみんな", ["あなたのブラウザがあなたのトレーダーです。ほかの人には「堂島ひかり」のような名前と短いコードで表示されます。上の名前をクリックすれば、自分で名前を付けたり、別の名前を引いたりできます。同じタブの全員は、何語で読んでいても同じルームでトレードします。作品の7人も毎ラウンド参加します。損切りできないくるみ、小さく堅実な萌智子、金利目当ての芽吹、売りしかしないやす子、大きな値動きに飛びつくいなご、推しの株しか買わないなな、自由億を目指すきずな。"]],
      ["これは何か、何ではないか", ["ファンによるパロディであり、原作者、KADOKAWA、制作会社、いかなるブローカーとも無関係です。作品の絵は一切使っていません。ここのお金はすべて仮想で、入金も換金もできず、投資助言でもありません。", "現実の市場では、レバレッジを使う個人トレーダーの多くが損をしています。ギャンブルや借金でお困りの方は、日本ではギャンブル等依存症の相談窓口（各都道府県の精神保健福祉センター）へ。オーストラリアではGambling Help（1800 858 858）へ。"]],
      ["レートについて", ["ヒストリーは1999年以降の欧州中央銀行（ECB）のユーロ参照レートを使い、ほかの通貨ペアはそこから算出しています。ライブはFrankfurterの今日のレートから始まります。日足の終値と終値の間、そしてライブの初日以降の値動きはシミュレーションです。"]],
    ],
    readme: "授業向け：プロジェクトのREADME（英語）",
    back: "マーケットに戻る",
  },
  zh: {
    title: "关于强制平仓！",
    lead: "一个所有人同时以同一价格交易的共享外汇市场，只用虚拟货币。本作恶搞的是漫画和动画《FX战士久留美》，讲的是一个大学生用杠杆炒外汇，想把家里亏掉的钱赚回来的故事。",
    sections: [
      ["三个标签页", ["历史模式回放某个货币对真实的40个交易日，日期在收盘铃响前保密。大多数局里都藏着一个著名的日子：雷曼兄弟倒闭、英国脱欧、瑞郎黑天鹅。", "实时模式从今天的真实汇率开始，模拟之后的40天。", "教程是一个只有你一个人的练习市场，12节短课，从第一笔交易讲到跳空击穿止损。如果你从没交易过，从这里开始。"]],
      ["一局怎么玩", ["标签页上的任何人按下开始，倒计时10秒后开盘，一局3分钟。选好杠杆，觉得会涨就买入，觉得会跌就卖出。平仓锁定盈亏，设好止损就会自动平仓。", "收盘铃响时按净值排名，历史模式还会揭晓你交易的是哪段日子。名人堂记录每个人的累计盈亏和爆仓次数。"]],
      ["杠杆、追加保证金和爆仓", ["杠杆会把盈利和亏损同时放大。25倍杠杆下，反向波动4%就会亏光你投入的全部资金。保证金比例跌到50%时经纪商会警告你，也就是追加保证金；到20%就会被强制平仓。价格一旦跳空，你可能在那之前就瞬间爆仓。2015年1月，很多交易者就是这样亏光了一切。", "没钱了，可以从老爹的存款里借，每局最多两次，债务从成绩里扣除。为了回本而借钱，正是这部作品描写的陷阱。"]],
      ["你和其他人", ["你的浏览器就是你的交易员，其他人看到的是像“堂岛光”这样的名字和一个短代码。点击顶部的名字，可以自己起名，或者再抽一个。同一个标签页里的所有人都在同一个房间交易，不管他们看的是哪种语言。作品里的七个人也每局都会参与：从不止损的久留美、小仓位严格止损的萌智子、为了利息死拿的芽吹、只会做空的安子、一有大行情就追的稻子、只买自己支持的股票的奈奈、梦想一亿日元自由的绊。"]],
      ["这是什么，不是什么", ["这是粉丝恶搞作品，与原作者、KADOKAWA、动画公司及任何经纪商均无关，没有使用作品的任何画面。这里的钱全部是虚拟的，不能充值也不能提现，也不构成任何投资建议。", "在真实市场中，大多数使用杠杆的散户都在亏钱。如果赌博或债务正在伤害你，请向身边的心理援助热线求助；在澳大利亚可拨打 Gambling Help 热线 1800 858 858。"]],
      ["价格从哪里来", ["历史模式使用欧洲央行1999年以来的欧元参考汇率，其他货币对由此推算。实时模式从 Frankfurter 提供的今日汇率开始。每日收盘价之间的走势，以及实时模式第一天之后的走势，都是模拟的。"]],
    ],
    readme: "课程用：项目的 README（英文）",
    back: "返回市场",
  },
};
