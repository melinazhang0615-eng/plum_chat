# Competitor tag references

Updated: 2026-08-10

This document transcribes the four competitor screenshots supplied during the Create V1 requirements discussion. Product names were not attached to the screenshots, so the two patterns below are recorded as Reference A and Reference B.

These are research inputs only. They are not approved Plum tags and must not be copied into the production selector without a separate taxonomy, moderation, localization, and data-contract review.

## Reference A: flat tag pool

Observed interaction:

- A single flat tag collection.
- The counter shows `0/10`, suggesting a maximum of 10 selected tags.
- A few tags receive stronger visual treatment or an icon, while most use the same neutral style.

Observed tags:

- Nocturne
- Demi-Human
- Aether
- Action
- Anime
- AnyPOV
- Best Friend
- Celebrity
- Delinquent
- Demon
- Depressed
- Dominant
- Enemy to Lovers
- Fan-made
- Female POV
- Femboy
- Feral
- Fictional
- Furry
- Game
- Hero
- Historical
- Horror
- Kuudere
- LGBTQ+
- Lore
- Mafia
- Magical
- Male POV
- Married Partner
- Mature
- MLM
- Monster
- Multiple
- Muscle
- Mystery
- Non-human
- OC
- Omegaverse
- Protective
- Realistic
- Romantic
- RPG
- Scenario
- Spicy
- Submissive
- Tsundere
- Twins
- Vampire
- Villain
- Wholesome
- WLW
- Yandere

## Reference B: categorized taxonomy

Observed top-level categories:

- 性別（required）
- 視角（required）
- 分級（required）
- 來源
- 關係
- 互動模式
- 氛圍
- 型別
- 種族
- 職業

### 來源

- 原創角色
- 虛構
- 遊戲
- 動漫
- 電影／電視
- 書籍

### 關係

The screenshot shows `0/9` and these nine choices:

- 男男
- 女女
- 敵人變戀人
- 朋友變戀人
- 心動物件
- 後宮
- 逆後宮
- 多角戀
- 多人

### 互動模式

The screenshot shows `0/8` and these eight choices:

- 支配
- 順從
- 可攻可受
- 反派
- 英雄
- 病嬌
- 傲嬌
- 冷嬌

### 氛圍

The screenshot shows `0/9` and these nine choices:

- 情色
- 甜蜜日常
- 虐心
- 喜劇
- 暗黑致鬱
- 恐怖
- 劇情
- 細水長流
- 溫馨治癒

### 型別

The screenshot shows `0/6` and these six choices:

- 歷史
- 皇室
- 科幻
- 魔法
- 角色扮演
- 情景

### 種族

The screenshot shows `0/13` and these thirteen choices:

- 半人
- 魔物娘
- 怪物
- 非人類
- 吸血鬼
- 精靈
- 狼人
- 惡魔
- 天使
- 龍
- 獸人控
- 機器人
- 外星人

### 職業

The screenshot shows `0/18` and these eighteen choices:

- 黑手黨
- 軍人
- 警察
- 總裁／上司
- 老師
- 學生
- 醫生
- 護士
- 女僕
- 管家
- 騎士
- 刺客
- 間諜
- 保鏢
- 偶像
- 搖滾明星
- 模特
- 海盜

## Questions to revisit for Plum

- Whether Plum should use one flat list, categories, or a short primary list plus advanced categories.
- Whether the current Create prototype limit of five tags is sufficient compared with the competitor limit of ten.
- Which attributes belong in structured fields rather than tags. Gender, content rating, source, and point of view are likely candidates.
- How to resolve overlapping concepts such as `Demon` versus `惡魔`, `Non-human` versus `非人類`, or romance relationship tags versus audience/POV tags.
- Which tags require age gates, moderation rules, or public-discovery restrictions, especially Mature, Spicy, Nocturne, 情色, Omegaverse, and similar concepts.
- How to assign stable language-neutral IDs while displaying localized labels in English, Traditional Chinese, Simplified Chinese, Japanese, and other supported languages.
- Whether creators can select tags freely or whether some tags should be derived from structured fields, moderation, or content analysis.

## Current implementation boundary

- `/create/v1` uses a multi-select UI with a maximum of five tags.
- The available option list remains intentionally empty until the Plum taxonomy is approved.
- Existing local-draft tags may remain visible as removable chips for migration and discussion.
