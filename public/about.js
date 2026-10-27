// The About page for players, in English, Japanese and Chinese (ADR 0016).
// The course's README, the project's argument, stays at /readme/; this is
// what a player needs: what the game is, how a round goes, what the parody
// is and is not, where the prices come from, and where to get help.
// Each section is a heading and paragraphs; the server renders them.

export const ABOUT = {
  en: {
    title: "Losscut! Kurumi's FX Fantasy",
    lead: "A shared foreign-exchange market where everyone trades the same price at once, for play money. It parodies FX Fighter Kurumi-chan, the manga and anime about a student who trades with leverage to win back her family's losses.",
    sections: [
      ["Three Tabs", ["Replay plays back forty real trading days of one currency pair, with the date hidden until the bell. Most rounds hide a famous day: the Lehman collapse, Brexit, the day the Swiss franc broke its cap.", "Scenario starts from today's real exchange rate and plays out a hidden script for forty days: a peg that breaks, a carry trade that unwinds, a policy shock, a bubble, a choppy market or an intervention, each modelled on a real one and run either way up. Headlines drop clues as it goes, and the bell names the script and the real market behind it.", "Tutorial is a private practice market for one, twelve short lessons from your first trade to the gap that jumps a stop. Start here if you have never traded."]],
      ["How a Round Goes", ["Anyone on a tab presses Start, and after a five-second countdown the round runs for three minutes. You can trade at the opening price during the countdown. Tick Ironman before starting, and nobody can pause that round.", "Set your leverage and stake on the sliders, then Buy if you think the price will rise or Sell if you think it will fall. Close your position to bank the result, or let a Stop Loss and a Take Profit close it for you: switch them on with the order, or drag their lines on the chart, each a distance from the price. A Stop Loss fills at its level or worse when the price jumps; a Take Profit at its level or better. Anyone can pause a trading round, and it resumes by itself after a minute. You can leave a round to watch it out, and whoever pressed Start can end it early for everyone.", "At the bell everyone is ranked by score: the percentage their net worth rose or fell, less 10 points for each forced losscut and 5 for each loan from Dad, so a careful loss beats a reckless one. Replay reveals the dates you traded. Before a famous day it drops two clues, and halfway through you can name the year: right adds 5 points, one year off adds 2. The hall of fame ranks everyone with three rounds or more by their average score."]],
      ["Leverage, Margin Calls and the Losscut", ["Leverage multiplies wins and losses. Australia caps retail traders at 30× on major pairs. At 30×, a 3.3% move against you takes everything you put in; at an offshore broker's 1000×, a 0.1% move does. When your margin level falls to 50% the broker warns you, a margin call; at 20% it closes your position for you, the forced loss cut, 強制ロスカット, and your round is over: you keep what is left, but you can only trade again with a loan from Dad. A price that jumps can wipe you out before any of that, which is how many traders lost everything in January 2015.", "When you are broke you may borrow from Dad's savings, twice a round. The debt counts against you. Borrowing to win back what you lost is the trap the comic is about."]],
      ["You and Everyone Else", ["Your browser is your trader, shown to others by a first name such as Hikari, a short code and a pixel face. Click your name at the top to type your own, or draw another name or face. Everyone on a tab trades in the same room, whatever language they read it in. Seven of the comic's characters play every round: Kurumi never cuts a loss, Mochiko trades small with tight stops, Mebuki holds for the interest, Yasuko only sells, Inago swarms onto every big move, Nana buys only what she believes in, and Kizuna chases a billion yen. Watch them and they talk, in character."]],
      ["What This Is, and Is Not", ["A fan parody, not affiliated with the creators, KADOKAWA, the studio, or any broker. It uses no art from the series. Everything here is play money: nothing can be deposited or won, and nothing is advice.", "In real markets, most retail traders who use leverage lose money. If gambling or debt is hurting you, in Australia call the Gambling Help line on 1800 858 858, or visit gamblinghelponline.org.au."]],
      ["Where the Prices Come from", ["Replay uses the European Central Bank's euro reference rates since 1999, with other pairs worked out from them. Scenario starts from Frankfurter's rate for today. Between daily closes, and after Scenario's first day, the moves are simulated."]],
    ],
    readme: "For the course: the project's README",
    back: "Back to the market",
  },
  ja: {
    title: "ロスカット！ くるみちゃんの FXファンタジー",
    lead: "みんなで同じ為替レートを見ながら、同時にトレードするゲームです。使うのは仮想マネーだけ。家族の借金を取り返そうとハイレバFXに手を出す女子大生の物語、『FX戦士くるみちゃん』のファンパロディです。",
    sections: [
      ["モードは3つ", ["「リプレイ」では、実際の為替相場から切り出した40営業日を再生します。いつの相場かはベルが鳴るまで伏せられていて、リーマンショックやブレグジット、スイスフランショックのような歴史的な一日が紛れていることもあります。", "「シナリオ」は今日の実際のレートから始まり、秘密の筋書きで40日分を動かします。ペッグ崩壊、キャリートレードの巻き戻し、政策ショック、バブル、レンジ相場、為替介入。どれも実際の相場をモデルにしていて、上下どちら向きにも起こります。途中のニュースがヒントになり、ベルが鳴ると筋書きと元になった相場が明かされます。", "「チュートリアル」は自分だけの練習場です。はじめての注文から、窓開けで逆指値が飛ばされる怖さまで、12のレッスンで体験できます。FXがはじめてなら、まずはここからどうぞ。"]],
      ["遊び方", ["タブにいる誰かが「ラウンド開始」を押すと、5秒のカウントダウンのあと、3分間の取引が始まります。カウントダウン中でも始値で注文できます。開始のときに「アイアンマン」を選ぶと、そのラウンドは誰も一時停止できません。", "レバレッジと投入額をスライダーで決めて、上がると思えば「買い」、下がると思えば「売り」。決済すれば損益が確定します。損切りと利確を置いておけば自動で決済されます。注文のときにオンにするか、あとからチャートの線をドラッグして置け、どちらも現在値からの幅で決めます。損切りは相場が飛べばその水準より悪く、利確はその水準かそれより良く約定します。取引中は誰でも一時停止でき、1分たつと自動で再開します。自分だけラウンドを抜けて見学することもできますし、開始した人なら全員のラウンドを早めに終わらせることもできます。", "ベルが鳴るとスコアで順位が決まります。スコアは純資産の増減率から、強制ロスカット1回につき10点、パパからの借金1回につき5点を引いたもの。同じ負けでも、自分で切った人が上です。リプレイではどの期間の相場だったかが明かされます。有名な日の前にはヒントのニュースが2本流れ、折り返しを過ぎたら年を当てられます。ぴたりなら5点、1年ずれなら2点。殿堂には、3ラウンド以上の人が平均スコア順に並びます。"]],
      ["レバレッジと追証、強制ロスカット", ["レバレッジは、利益も損失も同じだけ大きくします。オーストラリアの個人向けFXの上限は、主要通貨で30倍。30倍なら3.3%逆に動いただけで、投入した資金はゼロです。海外業者の1000倍なら、わずか0.1%です。", "証拠金維持率が50%を割ると追証の警告、20%を割ると強制ロスカット。ロスカットされたらそのラウンドは退場で、残ったお金は手元に残りますが、また取引するにはパパの貯金を借りるしかありません。ただし相場が窓を開けて飛べば、警告もロスカットも間に合わず一瞬で退場します。2015年1月のスイスフランショックでは、多くのトレーダーがそうして資金を失いました。", "資金が尽きたら、パパの貯金から1ラウンドに2回まで借りられます。借りたお金は成績から差し引かれます。負けを取り返すために借金をする。この作品が描いているのは、まさにその落とし穴です。"]],
      ["ほかのプレイヤーと", ["このブラウザがあなたのトレーダーになり、ほかの人には「ひかり」のような名前と短いコード、それにドット絵の顔で表示されます。上の名前を押せば、名前を自分で付けたり、名前や顔を引き直したりできます。読んでいる言語が違っても、同じタブの人はみんな同じ部屋で取引します。", "作品のキャラクター7人も毎回参加します。損切りできないくるみ、小さく堅実に損切りする萌智子、スワップ狙いでじっと持つ芽吹、売りしかしないやす子、大きな値動きに群がるいなご、信じたものだけを買うなな、そして億り人を夢見るきずな。みんな、それぞれの口調でしゃべります。"]],
      ["ご注意", ["これはファンが作った非公式のパロディで、原作者、KADOKAWA、アニメ制作会社、いかなるFX業者とも関係ありません。作品の絵や音楽は使っていません。お金はすべて仮想のもので、入金も出金もできず、投資の助言でもありません。", "現実の相場では、レバレッジをかけた個人トレーダーの多くが損失を出しています。ギャンブルや借金のことで悩んでいたら、ひとりで抱え込まずに相談してください。日本では各都道府県の精神保健福祉センターが窓口です。オーストラリアではGambling Help（1800 858 858）へ。"]],
      ["レートについて", ["リプレイは、1999年以降の欧州中央銀行（ECB）のユーロ参照レートを使っています。ユーロ以外の通貨ペアはそこから計算したものです。シナリオはFrankfurterが配信する今日のレートから始まります。日々の終値のあいだの動きと、シナリオの初日以降の動きはシミュレーションです。"]],
    ],
    readme: "授業向け：プロジェクトのREADME（英語）",
    back: "マーケットに戻る",
  },
  zh: {
    title: "强制平仓！久留美的FX白日梦",
    lead: "一个大家盯着同一个汇率、同时下单的多人炒汇小游戏，全程只用虚拟币。灵感来自漫画、动画《FX战士久留美》：一个女大学生为了帮家里还债，一头扎进了高杠杆外汇。本站是它的同人恶搞。",
    sections: [
      ["三种模式", ["【回放】截取真实行情中的40个交易日，重新走一遍。是哪一段行情，收盘铃响之前不告诉你；里面可能就藏着雷曼倒闭、英国脱欧、瑞郎黑天鹅这样载入史册的日子。", "【剧本】从今天的真实汇率出发，按一个保密的剧本走完40天：脱钩、套息交易平仓、政策冲击、泡沫、震荡市或汇市干预，每个都以真实行情为原型，涨跌方向都有可能。途中的新闻会透露线索，收盘铃响时揭晓剧本和它的原型。", "【教程】是只属于你自己的练习场，12节小课，从第一次下单讲到跳空击穿止损。没炒过外汇的话，建议先从这里开始。"]],
      ["怎么玩", ["标签页里任何一个人点“开始本局”，倒数5秒后开盘，一局3分钟。倒数期间就能按开盘价下单。开局时勾选“铁人局”，这一局就谁都不能暂停。", "用滑块选好杠杆和投入比例，看涨就买入，看跌就卖出。平仓锁定盈亏；挂上止损和止盈，到价会自动平仓。可以在下单时打开，也可以之后在图上拖动它们的线，都按距现价的幅度来设。行情跳空时，止损会成交在更差的价格，止盈则在挂单价或更好的价格成交。交易中任何人都可以按暂停，一分钟后自动恢复。你也可以自己中途退出、在一旁观战；开局的人还能为所有人提前收盘。", "收盘铃一响，按得分排名：净值涨跌百分比，每次强制平仓扣10分，每次向老爹借钱扣5分。同样是亏，自己止损的排在前面。回放模式还会揭晓这段行情发生在哪年哪月；著名的日子之前会有两条新闻透露线索，过半之后可以猜年份，猜中加5分，差一年加2分。名人堂只给打满三局的人按场均得分排名。"]],
      ["杠杆、追保与强平", ["杠杆把盈利和亏损一起放大。澳大利亚对主要货币对散户杠杆的上限是30倍。30倍杠杆下，行情反向走3.3%，本金就归零；海外平台的1000倍，只要0.1%。", "保证金比例跌破50%会收到追保通知，跌破20%就被强平。被强平就意味着本局出局：剩下的钱还是你的，但想再交易，只能向老爹借钱。可一旦行情跳空，通知和强平都来不及，账户瞬间爆仓。2015年1月瑞郎黑天鹅那天，许多交易者就是这样一夜清零。", "钱亏光了，可以动用老爹的存款，每局最多借两次，借的钱会从成绩里扣掉。亏了想借钱回本——这部作品讲的正是这个坑。"]],
      ["和其他玩家一起", ["这个浏览器就是你的交易员。别人看到的是“光”这样的名字、一串短代码和一个像素头像。点顶部的名字，可以自己起名，也可以重新抽名字、换头像。不管用哪种语言看，同一个标签页的人都在同一个房间里交易。", "作品里的七位角色每局都会下场：死不止损的久留美、小仓位严格止损的萌智子、为了利息死扛的芽吹、只会做空的安子、哪里有大行情就往哪里冲的稻子、只买自己认准的奈奈，还有一心想财务自由的绊。她们还会用各自的口吻说话。"]],
      ["声明", ["本站是粉丝自制的非官方恶搞作品，与原作者、KADOKAWA、动画制作公司及任何外汇平台都没有关系，也没有使用原作的任何画面或音乐。这里的钱全是虚拟的，不能充值、不能提现，也不构成任何投资建议。", "现实中，用杠杆炒外汇的散户大多是亏钱的。如果赌博或债务正在困扰你，请不要一个人扛着，及时向身边的人或专业心理援助热线求助。在澳大利亚可以拨打 Gambling Help 热线 1800 858 858。"]],
      ["汇率来源", ["回放模式使用欧洲央行（ECB）1999年以来的欧元参考汇率，非欧元货币对由此换算。剧本模式的起点是 Frankfurter 提供的今日汇率。每日收盘价之间的走势，以及剧本模式第一天之后的走势，都是模拟出来的。"]],
    ],
    readme: "课程相关：项目的 README（英文）",
    back: "返回市场",
  },
};
