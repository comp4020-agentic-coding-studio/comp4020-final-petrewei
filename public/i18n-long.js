// The tutorial's lessons and the bell's famous days, in Japanese and
// Chinese. English needs none: the server sends it, and the page shows it
// as it comes. Amounts are written as each language writes yen.

export const LESSONS = {
  ja: {
    welcome: {
      title: "トレードフロアへようこそ",
      text: "FX（外国為替証拠金取引）は、ある通貨を別の通貨と交換する取引です。このチャートはドル円（USD/JPY）で、1ドルが何円かを表します。上がればドルが強くなったということ。練習用の資金は100万円。ここでのお金は本物ではなく保存もされず、このルームにはあなたひとりです。5分ほどで終わります。",
      task: "「次へ」を押して始めましょう。",
    },
    buy: {
      title: "買い：値上がりに賭ける",
      text: "買いは、価格が上がるほうに賭けることです。レバレッジは自己資金の何倍で取引するか。1倍なら借金はゼロです。投入額は、資金のうちどれだけを使うかです。",
      task: "レバレッジを1倍にして「買い」を押し、チャートを見てください。",
    },
    "take-profit": {
      title: "利益確定",
      text: "価格が約1%上がり、資金も増えました。評価損益は、いま決済したらいくらになるかの数字です。決済するまで利益はあなたのものではありません。最初が少しマイナスなのは、スプレッド（売値と買値の差でブローカーの取り分）のせいです。",
      task: "ポジションの「決済」を押して利益を確定しましょう。",
    },
    sell: {
      title: "売り：値下がりに賭ける",
      text: "売り（ショート）は逆の賭けで、価格が下がると儲かります。ドルを持っていなくても売れます。ブローカーが貸してくれるからです。",
      task: "レバレッジは1倍のまま「売り」を押してください。",
    },
    "close-short": {
      title: "売りポジションの決済",
      text: "価格が下がったので、売りで儲かりました。高く売ったドルを安く買い戻すのです。決済がその買い戻しです。",
      task: "ポジションの「決済」を押してください。",
    },
    leverage: {
      title: "レバレッジ：拡大鏡",
      text: "レバレッジ25倍なら、100万円で2500万円分のドルを動かせます。1%の値動きで資金は25%増えるか減ります。25倍は日本の個人向けの上限で、海外FXでは1000倍もあります。証拠金維持率のバーを見てください。ブローカーが賭けの担保として預かる証拠金に対する、あなたの資金の割合です。",
      task: "レバレッジ25倍、投入額100%で「買い」を押し、維持率を見ていてください。",
    },
    "cut-loss": {
      title: "追証：損切りしよう",
      text: "約2%の下落で資金の半分ほどを失い、維持率は50%を切りました。追証、ブローカーからの警告です。20%に達すると、その時の価格でブローカーが強制的に決済します。それが強制ロスカット。値が戻るのを祈っていると口座はなくなります。損切りとは、まだお金が残っているうちに、負けているポジションを自分で決済することです。",
      task: "ポジションの「決済」を押して損切りしましょう。",
    },
    "stop-buy": {
      title: "逆指値は前もって決める",
      text: "逆指値（ストップロス）は、決めた幅だけ逆行したら自動で決済する注文です。いくらまで失っていいかを、取引の前に決めておくのです。パニックの最中ではなく。資金は100万円に戻りました。",
      task: "レバレッジ10倍、投入額100%で「買い」を押してください。",
    },
    "stop-set": {
      title: "逆指値を置く",
      text: "現在値の1%下に逆指値を置けば、そこまで下がった時点で売られます。レバレッジ10倍なら、損失は資金の約10%で止まります。",
      task: "ポジションの「1%逆指値」を押して、見ていてください。",
    },
    gap: {
      title: "逆指値でも助からないとき",
      text: "逆指値は−1%を少し過ぎて約定しました。逆指値は、ちょうどその値ではなく、次についた価格で決済されるからです。普段はほぼ同じです。2015年1月15日、スイス国立銀行がフランの上限を突然撤廃し、価格は数分で約15%飛びました。途中の値がほとんどなかったのです。逆指値ははるか先で約定し、多くのトレーダーが資金以上を失いました。",
      task: "レバレッジ25倍、投入額100%で「買い」を押してください。1%下の逆指値は自動で置かれます。",
    },
    dad: {
      title: "パパの貯金",
      text: "退場です。価格は逆指値を飛び越え、損失は資金の何倍にもなりました。このブローカーはゼロカットなので借金は残らず、口座は0円になるだけ。国内ブローカーなら追証として残りを請求されることもあります。このゲームでは、パパの貯金から1ラウンドに2回まで借りられ、借金は成績から引かれます。負けを取り返すために借りる。それこそが、この作品の描く罠です。",
      task: "「次へ」で手を引くか、借りて仕組みを見てみましょう。",
    },
    ready: {
      title: "準備完了",
      text: "上がると思えば買い、下がると思えば売り。レバレッジは勝ちも負けも何倍にもします。維持率に気をつけ、早めに損切りし、逆指値を使い、窓開けを忘れずに。現実では、レバレッジを使う個人トレーダーの多くが損をしています。ここではタダです。日付を伏せた本物の暴落ならリプレイ、今日のレートから筋書きどおりに動く相場ならシナリオへ。",
      task: "「次へ」で終わって、上のタブを選んでください。",
    },
  },
  zh: {
    welcome: {
      title: "欢迎来到交易大厅",
      text: "外汇（FX）就是用一种货币交换另一种货币。这张图是美元/日元（USD/JPY），价格表示1美元值多少日元，上涨就代表美元变强。你有100万日元的练习资金。这里的钱都不是真的，也不会保存，这个房间里只有你一个人。大约需要五分钟。",
      task: "按“下一步”开始。",
    },
    buy: {
      title: "买入：押注上涨",
      text: "买入就是押注价格会上涨。杠杆是用本金的多少倍去交易，1倍就是不借钱。投入是你拿出多少比例的资金。",
      task: "把杠杆设为1倍，按“买入”，然后看K线图。",
    },
    "take-profit": {
      title: "止盈",
      text: "价格涨了约1%，你的钱也涨了。浮动盈亏是现在平仓能赚多少：不平仓，利润就不算你的。一开始略微亏损，是因为点差，也就是买价和卖价之间被经纪商赚走的那一小段。",
      task: "按持仓上的“平仓”锁定利润。",
    },
    sell: {
      title: "卖出：押注下跌",
      text: "卖出（做空）是反方向的押注：价格下跌你就赚钱。你不需要真的持有美元也能卖，经纪商会借给你。",
      task: "保持1倍杠杆，按“卖出”。",
    },
    "close-short": {
      title: "空单平仓",
      text: "价格跌了，所以你的空单赚了：高价卖出的美元，再以更低的价格买回来。平仓就是买回的那一步。",
      task: "按持仓上的“平仓”。",
    },
    leverage: {
      title: "杠杆：放大镜",
      text: "25倍杠杆下，你的100万日元能撬动2500万日元的美元，所以1%的波动会让你的钱变动25%，涨跌都一样。25倍是日本散户的法定上限，海外平台则提供高达1000倍。看保证金比例的进度条：它是你的资金占经纪商为这笔押注扣押的保证金的比例。",
      task: "杠杆25倍、投入100%，按“买入”，然后看保证金比例。",
    },
    "cut-loss": {
      title: "追加保证金：止损吧",
      text: "跌了约2%，你已经亏掉了一半左右的钱，保证金比例跌破50%：这是追加保证金，经纪商的警告。一旦到20%，经纪商就会按当时的价格替你平仓，这就是强制平仓。指望价格回来，正是爆仓的开始；止损就是趁还有钱的时候，主动平掉亏损的单子。",
      task: "按持仓上的“平仓”止损。",
    },
    "stop-buy": {
      title: "止损要提前设好",
      text: "止损单会在价格反向波动到一定幅度时自动平仓。能承受亏多少，要在交易之前决定，而不是在慌乱之中。你的账户已恢复到100万日元。",
      task: "杠杆10倍、投入100%，按“买入”。",
    },
    "stop-set": {
      title: "设置止损",
      text: "在现价下方1%设止损，价格跌到那里就会卖出。10倍杠杆下，亏损会控制在本金的约10%。",
      task: "按持仓上的“1%止损”，然后看着。",
    },
    gap: {
      title: "止损也救不了你的时候",
      text: "你的止损在略超过−1%的位置成交：止损是按下一个出现的价格成交，而不是正好在止损价。平时差不多。2015年1月15日，瑞士央行突然取消了瑞郎汇率上限，价格几分钟内跳了约15%，中间几乎没有成交价。止损单在远远越过止损价的地方成交，很多交易者亏掉了比本金还多的钱。",
      task: "杠杆25倍、投入100%，按“买入”。下方1%的止损会自动设好。",
    },
    dad: {
      title: "老爹的存款",
      text: "爆仓了：价格直接越过你的止损，亏损是本金的好几倍。这家经纪商有负余额清零，所以你不欠钱，账户只是变成0日元；日本国内的经纪商可能会向你追讨剩下的部分。在游戏里，你现在可以从老爹的存款里借钱，每局最多两次，债务会从成绩里扣除。为了回本而借钱，正是这部作品描写的陷阱。",
      task: "按“下一步”收手，或者借钱看看会怎样。",
    },
    ready: {
      title: "准备好了",
      text: "觉得会涨就买入，觉得会跌就卖出。杠杆会把盈利和亏损同时放大。盯住保证金比例，早点止损，设好止损单，记住跳空。现实中大多数用杠杆的散户都在亏钱；在这里是免费的。想看隐藏日期的真实暴跌就去回放，想从今天的汇率开始走一个剧本就去剧本。",
      task: "按“下一步”结束，然后选择上方的标签页。",
    },
  },
};

export const EVENTS = {
  ja: {
    "2015-01-15": { title: "スイスフランショック", note: "スイス国立銀行が予告なくユーロフランの下限1.20を撤廃。フランは1日で約15%（最悪の瞬間は30%）急騰し、逆指値ははるか先で約定、破綻するブローカーも出ました。" },
    "2011-09-06": { title: "フランの下限設定", note: "スイス国立銀行が1ユーロ＝1.20フランを上限に定め、無制限介入を約束。ユーロフランは朝のうちに8%跳ね上がりました。" },
    "2008-10-24": { title: "キャリートレードの巻き戻し", note: "リーマン・ブラザーズ破綻後、円で資金を借りて高金利の豪ドルに賭けたレバレッジ取引が一斉に投げられました。豪ドル円は7月の約107円から10月には約55円まで暴落。" },
    "2008-09-15": { title: "リーマンショック", note: "2008年9月15日、リーマン・ブラザーズが経営破綻。キャリートレードの調達通貨だった円が、世界の巻き戻しとともに急騰しました。" },
    "2016-06-24": { title: "ブレグジット", note: "英国の国民投票でEU離脱が決定。ポンドは一晩で約8%下落し、1985年以来の安値をつけました。" },
    "2015-08-11": { title: "人民元の切り下げ", note: "中国人民銀行が人民元の基準値を約2%切り下げ。20年ぶりの大きさで、3日間続きました。" },
    "2020-03-19": { title: "コロナショック", note: "パンデミックで経済が止まり、誰もが米ドルに逃げ込みました。豪ドル米ドルは10日で12%下落し、18年ぶりの安値に。" },
    "2022-09-22": { title: "日本の為替介入", note: "円が24年ぶりの安値まで売られ、財務省が1998年以来となる円買い介入を実施。ドル円は115円から145円まで上昇していました。" },
    "2024-08-05": { title: "再びのキャリー巻き戻し", note: "日銀の利上げと弱い米経済指標で、円キャリートレードが一斉に出口へ。日経平均は1日で12%下落しました。" },
    "2022-09-26": { title: "英国のミニ予算", note: "財源なき大型減税で、ポンドは対ドルで史上最安値に。イングランド銀行が介入に追い込まれました。" },
  },
  zh: {
    "2015-01-15": { title: "瑞郎黑天鹅", note: "瑞士央行毫无预警地取消欧元兑瑞郎1.20的下限。瑞郎一天内暴涨约15%（最疯狂时达30%），止损单远远越过止损价成交，有经纪商因此破产。" },
    "2011-09-06": { title: "瑞郎设定下限", note: "瑞士央行把汇率上限定在1欧元兑1.20瑞郎，并承诺无限量干预。欧元/瑞郎一个上午就跳涨了8%。" },
    "2008-10-24": { title: "套息交易平仓潮", note: "雷曼兄弟倒闭后，借日元押注高息澳元的杠杆交易被同时抛售。澳元/日元从7月的约107跌到10月的约55。" },
    "2008-09-15": { title: "雷曼兄弟倒闭", note: "2008年9月15日，雷曼兄弟申请破产。作为套息交易融资货币的日元，随着全球去杠杆而大涨。" },
    "2016-06-24": { title: "英国脱欧", note: "英国公投决定脱离欧盟。英镑一夜之间下跌约8%，创1985年以来新低。" },
    "2015-08-11": { title: "人民币“8·11”汇改", note: "中国人民银行将人民币中间价下调近2%，是二十年来最大降幅，并连续三天下调。" },
    "2020-03-19": { title: "新冠疫情股灾", note: "疫情让各国经济停摆，所有人都在抢美元。澳元/美元十天内下跌12%，创18年新低。" },
    "2022-09-22": { title: "日本干预汇市", note: "日元跌至24年来最低，日本财务省自1998年以来首次入市买入日元。此前美元/日元已从115涨到145。" },
    "2024-08-05": { title: "套息交易再次平仓", note: "日本央行加息加上美国经济数据疲弱，日元套息交易争相离场。日经指数一天暴跌12%。" },
    "2022-09-26": { title: "英国迷你预算案", note: "英国没有资金来源的减税计划让英镑兑美元跌至历史最低，迫使英格兰银行出手干预。" },
  },
};

// The Scenario tab's scripts (ADR 0027), in every language: a name and
// what real market it was modelled on, told at the bell, and the
// headlines the feed shows on their day, in the order the script has them.
export const SCENARIOS = {
  en: {
    peg: { name: "a peg break", note: "a currency held still at a floor until the central bank let go in a day, as Switzerland did on 15 January 2015.", headlines: ["The central bank calls its floor 'the cornerstone of policy'.", "Reserves to defend the floor have swelled past a year's output."] },
    carry: { name: "a carry-trade unwind", note: "a long, calm climb on cheap borrowed money, then everyone leaving at once, as the yen carry trade did in August 2024.", headlines: ["Borrowing in the cheap currency to buy the dear one: 'free money', says a fund.", "The low-rate central bank hints its rates may finally rise."] },
    shock: { name: "a policy shock", note: "a surprise decision that moved the market in a day, and a trend that followed it, as China's devaluation did on 11 August 2015.", headlines: ["The central bank meets on Tuesday. Economists expect no change.", "Exports fell for the third month running."] },
    bubble: { name: "a bubble", note: "a trend everyone joined until it turned, as sterling's did around the Brexit vote in June 2016.", headlines: ["Retail traders pile in: long positions at a record.", "'This time it's different,' says a strategist."] },
    chop: { name: "a choppy market", note: "no trend at all, only swings that take out stops on both sides. Most days in most markets look like this.", headlines: ["Analysts split: half say up, half say down.", "Volume is high, and no one knows why."] },
    intervention: { name: "an intervention", note: "a currency sliding day after day until its government stepped in and bought it back, as Japan did on 22 September 2022.", headlines: ["The finance minister is 'watching the market with a sense of urgency'.", "Officials won't rule out 'decisive action'."] },
  },
  ja: {
    peg: { name: "ペッグ崩壊", note: "下限で張りついていた通貨が、中央銀行の一日の決断で解き放たれる。2015年1月15日のスイスがそうでした。", headlines: ["中銀総裁「下限は政策の要だ」と強調。", "下限防衛のための外貨準備、ついにGDPの1年分を超える。"] },
    carry: { name: "キャリートレードの巻き戻し", note: "安く借りたお金で長く穏やかに上がり、ある日いっせいに逃げ出す。2024年8月の円キャリーがそうでした。", headlines: ["「低金利で借りて高金利で運用、タダでもらえるお金」とファンド関係者。", "低金利の中銀、ついに利上げを示唆。"] },
    shock: { name: "政策ショック", note: "予想外の決定で一日のうちに相場が動き、その流れが続く。2015年8月11日の人民元切り下げがそうでした。", headlines: ["中銀会合は火曜。エコノミストの予想は「据え置き」。", "輸出、3か月連続で減少。"] },
    bubble: { name: "バブル", note: "誰もが乗ったトレンドが、ある日向きを変える。2016年6月、EU離脱の国民投票前後のポンドがそうでした。", headlines: ["個人投資家が殺到、買いポジションが過去最高に。", "ストラテジスト「今回は違う」。"] },
    chop: { name: "レンジ相場", note: "トレンドはなく、上下に振れるだけで両方向の逆指値を刈っていく。たいていの相場の、たいていの日はこれです。", headlines: ["アナリストの見方は真っ二つ、上か下か。", "出来高は多いのに、理由は誰にもわからない。"] },
    intervention: { name: "為替介入", note: "下げ続けた通貨を、政府がついに買い支える。2022年9月22日の日本がそうでした。", headlines: ["財務相「緊張感を持って市場を注視している」。", "当局者「断固たる措置」を排除せず。"] },
  },
  zh: {
    peg: { name: "脱钩", note: "一种被压在底线上一动不动的货币，央行一天之内松手放开。2015年1月15日的瑞士就是这样。", headlines: ["央行行长称底线是“政策的基石”。", "为守住底线，外汇储备已超过一年的经济产出。"] },
    carry: { name: "套息交易平仓", note: "借便宜钱一路慢涨，某天所有人一起夺门而逃。2024年8月的日元套息交易就是这样。", headlines: ["“借低息货币买高息货币，等于白捡钱”，某基金如是说。", "低利率央行暗示终于要加息。"] },
    shock: { name: "政策冲击", note: "一个意外决定让行情一天之内变脸，之后趋势顺势延续。2015年8月11日人民元贬值就是这样。", headlines: ["央行周二开会，经济学家预计按兵不动。", "出口连续第三个月下滑。"] },
    bubble: { name: "泡沫", note: "人人都上车的趋势，某天掉头。2016年6月脱欧公投前后的英镑就是这样。", headlines: ["散户蜂拥而入，多头仓位创纪录。", "策略师：“这次不一样。”"] },
    chop: { name: "震荡市", note: "没有趋势，只有来回拉锯，两边的止损都被扫掉。大多数市场的大多数日子都是这样。", headlines: ["分析师意见对半开：一半看涨，一半看跌。", "成交量很大，却没人知道为什么。"] },
    intervention: { name: "汇市干预", note: "一种货币连日下跌，直到政府出手买回。2022年9月22日的日本就是这样。", headlines: ["财务大臣表示正“以紧迫感关注市场”。", "官员不排除采取“果断行动”。"] },
  },
};

// Two clues before a replay's famous day (ADR 0030), in every language:
// the mood the market was in, never the event or its year.
export const CLUES = {
  en: {
    "2015-01-15": ["The central bank calls its currency floor 'the cornerstone' of policy.", "Rumours of negative interest rates in a safe-haven country."],
    "2011-09-06": ["A safe-haven currency hits record highs as Europe's debt crisis deepens.", "Exporters warn the strong currency is 'unbearable'."],
    "2008-10-24": ["Banks stop lending to each other, and hedge funds face margin calls.", "Commodity prices are falling fast."],
    "2008-09-15": ["A large investment bank's shares have halved this week.", "Officials say there will be no more bailouts."],
    "2016-06-24": ["Polls say a national referendum is too close to call.", "Bookmakers still favour the status quo."],
    "2015-08-11": ["A major economy's exports slump, and its stock market wobbles.", "Its central bank says it wants a more 'market-based' exchange rate."],
    "2020-03-19": ["A new virus spreads beyond its first country.", "Cities begin to close their borders and shops."],
    "2022-09-22": ["The currency slides to its weakest in decades.", "Officials say they are 'watching with a sense of urgency'."],
    "2024-08-05": ["Funds borrow in a near-zero-rate currency to buy higher-yielding ones.", "That central bank hints its rates may finally rise."],
    "2022-09-26": ["A new government promises large tax cuts.", "Bond traders question how they will be paid for."],
  },
  ja: {
    "2015-01-15": ["中銀総裁、通貨の下限は政策の「要」と強調。", "安全通貨の国で、マイナス金利の噂。"],
    "2011-09-06": ["欧州の債務危機が深まり、安全通貨が史上最高値。", "輸出企業「この通貨高は耐えられない」。"],
    "2008-10-24": ["銀行どうしがお金を貸さなくなり、ヘッジファンドに追証の嵐。", "資源価格が急落中。"],
    "2008-09-15": ["大手投資銀行の株価が今週だけで半分に。", "当局者「これ以上の救済はしない」。"],
    "2016-06-24": ["国民投票、世論調査は大接戦。", "ブックメーカーはまだ現状維持が優勢と予想。"],
    "2015-08-11": ["大国の輸出が落ち込み、株式市場も不安定に。", "中銀「より市場に沿った為替レートを目指す」。"],
    "2020-03-19": ["新型ウイルス、最初の国の外へ広がる。", "各地で国境や店が閉まり始める。"],
    "2022-09-22": ["通貨が数十年ぶりの安値に。", "当局者「緊張感を持って注視している」。"],
    "2024-08-05": ["ほぼゼロ金利の通貨で借り、高金利の通貨を買うファンドが急増。", "その中銀、ついに利上げを示唆。"],
    "2022-09-26": ["新政権、大型減税を約束。", "債券トレーダー「財源はどこに？」。"],
  },
  zh: {
    "2015-01-15": ["央行行长称汇率底线是政策的“基石”。", "避险国家传出负利率的风声。"],
    "2011-09-06": ["欧洲债务危机加深，避险货币创历史新高。", "出口商抱怨：本币这么强“受不了”。"],
    "2008-10-24": ["银行之间不再互相借钱，对冲基金被追保。", "大宗商品价格急跌。"],
    "2008-09-15": ["一家大型投行的股价本周腰斩。", "官员表示不会再出手救助。"],
    "2016-06-24": ["一场全民公投，民调难分高下。", "博彩公司仍看好维持现状。"],
    "2015-08-11": ["一个大经济体出口下滑，股市动荡。", "其央行表示希望汇率“更加市场化”。"],
    "2020-03-19": ["一种新病毒蔓延出最初的国家。", "各地开始关闭边境和商店。"],
    "2022-09-22": ["本币跌至几十年来最弱。", "官员称正“以紧迫感关注市场”。"],
    "2024-08-05": ["基金纷纷借入近零利率的货币，买入高息货币。", "那家央行暗示终于要加息。"],
    "2022-09-26": ["新政府承诺大规模减税。", "债券交易员质疑钱从哪里来。"],
  },
};
