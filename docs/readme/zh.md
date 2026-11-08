# 强制平仓！久留美的FX白日梦

这是一个共享的外汇市场：同一个标签页的所有人用游戏币交易同一个价格，整个房间看着你把钱亏光。复盘重现一场真实的危机，日期在收盘铃响之前保密；随机按一个隐藏的情境，从今天的汇率生成市场；实时用当下的真实价格交易，直到账户破产。选一个名字，点开始一局；在旁边再开一个浏览器配置文件，就能看到每笔交易在一秒内送达。游戏有[English](https://comp4020-final-petrewei.fly.dev/)、[日本語](https://comp4020-final-petrewei.fly.dev/ja/)和[中文](https://comp4020-final-petrewei.fly.dev/zh/)三种语言，房间是共用的。本页另有[English](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/README.md)和[日本語](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/readme/ja.md)版本。

## 为谁而做

一起玩的一屋子人：评图小组，或展示会的观众。就像Shirky说的“情境软件”，它是为一个群体做的，爆仓就发生在朋友眼前。它戏仿《FX战士久留美》（作者でむにゃん和炭酸だいすき；动画由Passione制作，2026年）：一名学生用高杠杆炒外汇，想赢回家人在2008年失去的东西，故事既好笑又沉重，和这个游戏一样。

## 这里的“好”是什么

好，就是一屋子人为爆仓大笑，散场时明白它为什么发生。杠杆既是笑点也是教训：海外券商卖1000倍，ESMA限制在30倍，而多数散户账户都在亏钱。

- **一个价格，一个房间：** 每个价格和成交都由服务器决定，房间里能看到你的方向和净值。
- **亏损是公开的：** 强制平仓会出现在动态里，应急信贷收高利贷的利息。
- **过去是陷阱：** 复盘用真实行情重放十九次崩盘之一前后的五天，从雷曼到瑞郎脱钩，名字在收盘铃时揭晓。
- **风险用金额说话：** 下单卡显示在你的保证金和杠杆下价格每动1%的盈亏，收盘铃时把你最大的一笔交易按1倍、30倍和1000倍重算。
- **先有同伴，再有对手：** 原作的七个角色在你身边交易，你也可以向真人发起对决。
- **新手安全起步：** 十节课最后以1000倍爆仓结束。

## 机器检查与人工判断

每次部署前由CI里的`spec/`和`test/`检查，理由见[决策记录](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/README.md)：

- 一个人的交易在一秒内出现在别人的页面上
- 一局要等开始，同时下的单都能成交，各记到自己的账户
- 服务器拒绝券商不提供的订单
- 不向任何人显示他人的cookie，选的名字是纯文本且不重复
- 追加保证金、强制平仓、信贷和破产都按`src/fx.ts`执行
- 复盘经过每一个真实收盘价，提示从不透露日期
- 实时账户在重启后保留，损坏的存档能从备份恢复
- 页面上的每个字都有英文、日文和中文，每种语言有自己的地址
- 页面提供的每个操作都能送达服务器

由人来判断：

- 收盘铃响时，房间里的人会不会笑、有没有学到
- 杠杆看起来是否和实际一样危险
- 日文和中文读起来是否地道

## 参考了什么

- [《FX战士久留美》](https://en.wikipedia.org/wiki/FX_Fighter_Kurumi-chan)和它的[动画官网](https://fxkurumi-info.com/)：名字和术语；像素头像是手绘的。
- ESMA的[2018年零售差价合约限制](https://www.esma.europa.eu/press-news/esma-news/esma-agrees-prohibit-binary-options-and-restrict-cfds-protect-retail-investors)：74%到89%的散户账户亏钱，主要货币对上限30倍。
- 瑞郎脱钩后，FXCM的客户欠了它[2.25亿美元](https://money.cnn.com/2015/01/16/investing/swiss-currency-fxcm/index.html)。
- 价格来自[HistData](https://www.histdata.com/)、[欧洲央行](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)、[Frankfurter](https://frankfurter.dev/)和Yahoo Finance。
- Clay Shirky，《[Situated Software](https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html)》（2004年）：为一个群体而做的软件。

## 没有做的

真钱、券商链接、入金优惠，以及原作的音乐和美术。原作的家庭悲剧是故事的前提，绝不拿来开玩笑。如果赌博或债务正在伤害你，可以拨打澳大利亚的[Gambling Help](https://www.gamblinghelponline.org.au/)热线1800 858 858。
