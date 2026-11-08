# ロスカット！くるみちゃんの FXファンタジー

同じタブの全員がプレイマネーで一つの価格を取引し、ルームのみんなの前で資金を失っていく共有の為替市場です。巻き戻しは本物の危機を日付を伏せたままベルまで再現し、ランダムは隠された状況に沿って今日のレートから市場を作り、ライブは口座が破産するまで今の本物の価格で取引します。名前を選んでラウンド開始を押し、もう一つのブラウザープロファイルを横に開けば、取引が1秒以内に届くのが見えます。[English](https://comp4020-final-petrewei.fly.dev/)、[日本語](https://comp4020-final-petrewei.fly.dev/ja/)、[中文](https://comp4020-final-petrewei.fly.dev/zh/)で遊べ、ルームは共通です。このページは[English](https://comp4020-final-petrewei.fly.dev/readme/)と[中文](https://comp4020-final-petrewei.fly.dev/zh/readme/)でも読めます。

## 誰のためのものか

一緒に遊ぶルーム、つまりクリットのグループやショーケースの来場者です。Shirkyの「状況に根ざしたソフトウェア」のように一つのグループのために作られていて、ロスカットは友達の目の前で起きます。原作は『FX戦士くるみちゃん』（でむにゃん、炭酸だいすき。アニメはPassione、2026年）のパロディです。2008年に家族が失ったものを取り戻すため、学生がレバレッジをかけたFXに挑む物語で、このゲームと同じく笑えて苦い話です。

## ここでの「良さ」

良さとは、ロスカットに笑い、なぜそうなったかを理解して帰れるルームのことです。レバレッジは笑いどころであり教訓でもあります。海外業者は1000倍を売り、ESMAは30倍に制限し、個人口座の多くは損をします。

- **一つの価格、一つのルーム：** 価格と約定はすべてサーバーが決め、ルームにはあなたの売買の向きと純資産が見えます。
- **負けは公開される：** 強制ロスカットはフィードに流れ、緊急クレジットは闇金並みの利息を取ります。
- **過去は罠：** 巻き戻しはリーマンからスイスフランの上限撤廃まで、19の暴落のどれかの前後5日間を本物の値動きで再生し、名前はベルで明かされます。
- **リスクは金額で示す：** 注文票は証拠金とレバレッジでの1%の値動きの損益を示し、ベルでは最大の取引を1倍・30倍・1000倍で振り返ります。
- **仲間、そしてライバル：** 原作のキャラクター7人が隣で取引し、人に決闘を申し込めます。
- **初心者は安全に始める：** 10のレッスンは1000倍のロスカットで終わります。

## 機械で確かめること、人が判断すること

デプロイ前にCIで`spec/`と`test/`が確かめます。理由は[決定記録](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/README.md)にあります。

- ある人の取引は1秒以内に他の人の画面に届く
- ラウンドは開始を待ち、同時の注文はすべてそれぞれの口座に約定する
- サーバーは業者が扱わない注文を拒否する
- 他人のクッキーは誰にも見せず、選んだ名前はプレーンテキストで重複しない
- 追証、強制ロスカット、クレジット、破産は`src/fx.ts`に従う
- 巻き戻しは本物の終値をすべて通り、ヒントは日付を明かさない
- ライブの口座は再起動を越えて残り、壊れたセーブはバックアップから復旧する
- 表示する文字列はすべて英語・日本語・中国語があり、言語ごとにアドレスがある
- 画面が出せる操作はすべてサーバーに届く

人が判断すること：

- ベルでルームが笑い、学ぶかどうか
- レバレッジが実際どおり危険に見えるかどうか
- 日本語と中国語が自然に読めるかどうか

## 参考にしたもの

- [『FX戦士くるみちゃん』](https://en.wikipedia.org/wiki/FX_Fighter_Kurumi-chan)と[アニメ公式サイト](https://fxkurumi-info.com/)：名前と用語。ドット絵の顔は手描きです。
- ESMAの[2018年の個人向けCFD規制](https://www.esma.europa.eu/press-news/esma-news/esma-agrees-prohibit-binary-options-and-restrict-cfds-protect-retail-investors)：個人口座の74〜89%が損をしており、主要通貨ペアは30倍に制限。
- スイスフランの上限撤廃後、FXCMの顧客は同社に[2億2500万ドル](https://money.cnn.com/2015/01/16/investing/swiss-currency-fxcm/index.html)の借金を負った。
- 価格は[HistData](https://www.histdata.com/)、[ECB](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)、[Frankfurter](https://frankfurter.dev/)、Yahoo Financeから。
- Clay Shirky「[Situated Software](https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html)」（2004年）：一つのグループのためのソフトウェア。

## 入れなかったもの

本物のお金、業者へのリンク、入金の勧誘、原作の音楽と絵。原作の家族の悲劇は物語の前提であり、決して笑いにはしません。ギャンブルや借金で苦しんでいる人は、オーストラリアの[Gambling Help](https://www.gamblinghelponline.org.au/)（1800 858 858）に相談できます。
