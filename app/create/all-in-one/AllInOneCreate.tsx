"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Brand } from "@/components/brand";
import {
  type Character,
  type Draft,
  type LoreEntry,
  EMPTY_DRAFT,
  EXAMPLE_DRAFT,
  STORAGE_KEY,
  uid,
} from "../CreateStudio";
import styles from "./all-in-one.module.css";

const OUTLINE = [
  ["basics", "基本信息"],
  ["cast", "登场角色"],
  ["world", "世界与关系"],
  ["opening", "开场与表达"],
  ["visuals", "角色形象"],
  ["release", "发布设置"],
] as const;

function Field({ label, help, required, privateField, children }: { label: string; help?: string; required?: boolean; privateField?: boolean; children: React.ReactNode }) {
  return <label className={styles.field}><span>{label}{required && <b>必填</b>}{privateField && <i>内部</i>}</span>{help && <small>{help}</small>}{children}</label>;
}

function SectionHeader({ number, title, description, optional }: { number: string; title: string; description: string; optional?: boolean }) {
  return <header className={styles.sectionHeader}><span>{number}</span><div><h2>{title}{optional && <i>选填</i>}</h2><p>{description}</p></div></header>;
}

function Icon({ name }: { name: "sparkle" | "upload" | "plus" | "close" | "check" | "menu" }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{
    name === "sparkle" ? <><path d="m12 3 1.3 4.1L17 9l-3.7 1.9L12 15l-1.3-4.1L7 9l3.7-1.9L12 3Z"/><path d="m18.5 14 .7 2.1 1.8.9-1.8.9-.7 2.1-.7-2.1L16 17l1.8-.9.7-2.1Z"/></> :
    name === "upload" ? <><path d="M12 16V4M8 8l4-4 4 4"/><path d="M4 15v4h16v-4"/></> :
    name === "plus" ? <path d="M12 5v14M5 12h14"/> :
    name === "close" ? <path d="m6 6 12 12M18 6 6 18"/> :
    name === "check" ? <path d="m5 12 4 4L19 6"/> :
    <><path d="M5 7h14M5 12h14M5 17h14"/></>
  }</svg>;
}

export function AllInOneCreate() {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [selectedCharacterId, setSelectedCharacterId] = useState("character-1");
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Draft;
        if (parsed.characters?.length) {
          setDraft(parsed);
          setSelectedCharacterId(parsed.primaryCharacterId || parsed.characters[0].id);
        }
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setSaved(false);
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      setSaved(true);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [draft, hydrated]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const selectedCharacter = draft.characters.find((character) => character.id === selectedCharacterId) ?? draft.characters[0];
  const primaryCharacter = draft.characters.find((character) => character.id === draft.primaryCharacterId) ?? draft.characters[0];
  const previewImage = draft.coverImage || primaryCharacter.images[0] || "/characters/luna.svg";
  const tags = draft.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 5);

  const completion = useMemo(() => {
    const values = [
      draft.title && draft.title !== "未命名作品",
      draft.publicIntro,
      draft.coreWorld,
      draft.characters.every((character) => character.name && character.profile),
      draft.characters.every((character) => character.images.length),
      draft.openingScene,
      draft.openingLine,
      draft.tags,
      draft.confirmAdults,
      draft.confirmRights,
    ];
    return Math.round(values.filter(Boolean).length / values.length * 100);
  }, [draft]);

  function updateDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updateCharacter(patch: Partial<Character>, id = selectedCharacter.id) {
    setDraft((current) => ({ ...current, characters: current.characters.map((character) => character.id === id ? { ...character, ...patch } : character) }));
  }

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  }

  function fillExample() {
    setDraft(EXAMPLE_DRAFT);
    setSelectedCharacterId(EXAMPLE_DRAFT.primaryCharacterId);
    showToast("示例作品已填充");
  }

  function addCharacter() {
    if (draft.characters.length >= 5) { showToast("第一期最多支持 5 个角色"); return; }
    const character: Character = { id: uid("character"), name: "", gender: "未设定", role: "", intro: "", profile: "", privatePrompt: "", speechStyle: "", relationships: "", images: [] };
    updateDraft({ characters: [...draft.characters, character] });
    setSelectedCharacterId(character.id);
  }

  function deleteCharacter(id: string) {
    if (draft.characters.length === 1) { showToast("至少保留一个角色"); return; }
    const characters = draft.characters.filter((character) => character.id !== id);
    updateDraft({ characters, primaryCharacterId: id === draft.primaryCharacterId ? characters[0].id : draft.primaryCharacterId });
    setSelectedCharacterId(characters[0].id);
  }

  function addLore() {
    const entry: LoreEntry = { id: uid("lore"), name: "新设定", keywords: "", content: "", enabled: true };
    updateDraft({ lore: [...draft.lore, entry] });
  }

  function updateLore(id: string, patch: Partial<LoreEntry>) {
    updateDraft({ lore: draft.lore.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) });
  }

  function handleImage(event: ChangeEvent<HTMLInputElement>, target: "cover" | "character") {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 1_500_000) { showToast("本地原型请上传小于 1.5 MB 的图片"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const image = String(reader.result);
      if (target === "cover") updateDraft({ coverImage: image });
      else updateCharacter({ images: [...selectedCharacter.images, image].slice(0, 5) });
      showToast("图片已保存到本地草稿");
    };
    reader.readAsDataURL(file);
  }

  function simulateGenerate() {
    setGenerating(true);
    window.setTimeout(() => {
      const images = ["/characters/tipsy-reference/feed-02.avif", "/characters/tipsy-reference/feed-04.avif", "/characters/tipsy-reference/feed-06.avif"];
      updateCharacter({ images: [...selectedCharacter.images, images[draft.characters.length % images.length]].slice(0, 5) });
      setGenerating(false);
      showToast("模拟生成完成，没有真实扣除金币");
    }, 850);
  }

  return <main className={styles.shell}>
    <header className={styles.topbar}>
      <div className={styles.brand}><Brand/><span>一页式原型</span></div>
      <div className={styles.topStatus}><i className={saved ? styles.saved : ""}/>{saved ? "已保存到本地" : "正在保存…"}</div>
      <div className={styles.actions}><Link href="/create/v1">查看第一期版</Link><Link href="/create">查看分区版</Link><button onClick={fillExample}>填充示例</button><button className={styles.publishButton} onClick={() => document.getElementById("release")?.scrollIntoView({ behavior: "smooth" })}>发布设置</button></div>
    </header>

    <section className={styles.hero}>
      <div><span>CREATE A WORLD</span><h1>把角色、关系和故事<br/>放在同一张创作桌上</h1><p>没有步骤，也没有必须按照顺序完成的流程。你可以从最有灵感的部分开始，其他内容会自动保存在当前草稿里。</p></div>
      <div className={styles.heroMeta}><span>草稿完成度</span><strong>{completion}%</strong><i><b style={{ width: `${completion}%` }}/></i><small>只统计发布所需的核心内容</small></div>
    </section>

    <div className={styles.layout}>
      <article className={styles.formFlow}>
        <section className={styles.section} id="basics">
          <SectionHeader number="01" title="基本信息" description="让用户第一眼知道这是什么作品，以及为什么值得进入。"/>
          <div className={styles.twoColumns}><Field label="作品标题" required><input value={draft.title} maxLength={30} onChange={(event) => updateDraft({ title: event.target.value })}/></Field><Field label="一句话概念"><input value={draft.concept} maxLength={80} placeholder="一句话说明冲突或吸引点" onChange={(event) => updateDraft({ concept: event.target.value })}/></Field></div>
          <Field label="公开介绍" required help="展示在推荐卡和作品详情页，不直接控制角色行为"><textarea rows={4} value={draft.publicIntro} maxLength={360} placeholder="介绍故事氛围、人物关系，以及用户可以体验什么……" onChange={(event) => updateDraft({ publicIntro: event.target.value })}/></Field>
        </section>

        <section className={styles.section} id="cast">
          <SectionHeader number="02" title="登场角色" description="至少创建一个角色；多人作品中，每个角色拥有独立的人设与表达方式。"/>
          <div className={styles.castTabs}>{draft.characters.map((character, index) => <button key={character.id} className={character.id === selectedCharacter.id ? styles.active : ""} onClick={() => setSelectedCharacterId(character.id)}><img src={character.images[0] || "/characters/kai.svg"} alt=""/><span><b>{character.name || `角色 ${index + 1}`}</b><small>{character.id === draft.primaryCharacterId ? "主要角色" : character.role || "待完善"}</small></span></button>)}<button className={styles.addCast} onClick={addCharacter} disabled={draft.characters.length >= 5}><Icon name="plus"/><span><b>添加角色</b><small>{draft.characters.length}/5</small></span></button></div>
          <div className={styles.characterCard}>
            <header><div><img src={selectedCharacter.images[0] || "/characters/kai.svg"} alt=""/><span><small>正在编辑</small><b>{selectedCharacter.name || "未命名角色"}</b></span></div><div><label><input type="radio" checked={selectedCharacter.id === draft.primaryCharacterId} onChange={() => updateDraft({ primaryCharacterId: selectedCharacter.id })}/>主要角色</label><button disabled={draft.characters.length === 1} onClick={() => deleteCharacter(selectedCharacter.id)}>删除</button></div></header>
            <div className={styles.threeColumns}><Field label="角色名称" required><input value={selectedCharacter.name} onChange={(event) => updateCharacter({ name: event.target.value })}/></Field><Field label="性别"><select value={selectedCharacter.gender} onChange={(event) => updateCharacter({ gender: event.target.value })}><option>未设定</option><option>女性</option><option>男性</option><option>非二元</option><option>其他</option></select></Field><Field label="身份/职业"><input value={selectedCharacter.role} placeholder="调查员、室友、骑士…" onChange={(event) => updateCharacter({ role: event.target.value })}/></Field></div>
            <Field label="公开简介" help="用户可以看到"><textarea rows={3} value={selectedCharacter.intro} onChange={(event) => updateCharacter({ intro: event.target.value })}/></Field>
            <Field label="角色 Profile" required help="外貌、性格、兴趣与鲜明特点"><textarea rows={5} value={selectedCharacter.profile} onChange={(event) => updateCharacter({ profile: event.target.value })}/></Field>
            <div className={styles.privateFields}><Field label="私有人设" privateField><textarea rows={4} value={selectedCharacter.privatePrompt} onChange={(event) => updateCharacter({ privatePrompt: event.target.value })}/></Field><div className={styles.twoColumns}><Field label="说话特点" privateField><textarea rows={3} value={selectedCharacter.speechStyle} onChange={(event) => updateCharacter({ speechStyle: event.target.value })}/></Field><Field label="与其他角色的关系" privateField><textarea rows={3} value={selectedCharacter.relationships} onChange={(event) => updateCharacter({ relationships: event.target.value })}/></Field></div></div>
          </div>
        </section>

        <section className={styles.section} id="world">
          <SectionHeader number="03" title="世界与关系" description="核心背景始终生效；世界书只在触发相应关键词时提供设定。"/>
          <div className={styles.threeColumns}><Field label="时代"><input value={draft.era} placeholder="近未来、维多利亚时代…" onChange={(event) => updateDraft({ era: event.target.value })}/></Field><Field label="地点"><input value={draft.location} placeholder="海滨城、魔法学院…" onChange={(event) => updateDraft({ location: event.target.value })}/></Field><Field label="人物关系"><input value={draft.relationship} placeholder="同事、宿敌、陌生人…" onChange={(event) => updateDraft({ relationship: event.target.value })}/></Field></div>
          <Field label="故事前提" privateField><textarea rows={3} value={draft.premise} onChange={(event) => updateDraft({ premise: event.target.value })}/></Field>
          <Field label="核心世界设定" required privateField help="只写必须始终成立的事实和规则"><textarea rows={6} value={draft.coreWorld} onChange={(event) => updateDraft({ coreWorld: event.target.value })}/></Field>
          <div className={styles.subsectionTitle}><div><span>高级选填</span><h3>世界书</h3><p>地点、组织、都市传说、物品和隐藏规则。</p></div><button onClick={addLore}><Icon name="plus"/>添加条目</button></div>
          <div className={styles.loreGrid}>{draft.lore.map((entry, index) => <div className={styles.loreEntry} key={entry.id}><header><span>条目 {index + 1}</span><label><input type="checkbox" checked={entry.enabled} onChange={(event) => updateLore(entry.id,{enabled:event.target.checked})}/>启用</label></header><Field label="名称"><input value={entry.name} onChange={(event) => updateLore(entry.id,{name:event.target.value})}/></Field><Field label="触发关键词"><input value={entry.keywords} placeholder="使用逗号分隔" onChange={(event) => updateLore(entry.id,{keywords:event.target.value})}/></Field><Field label="设定内容"><textarea rows={4} value={entry.content} onChange={(event) => updateLore(entry.id,{content:event.target.value})}/></Field><button className={styles.removeText} onClick={() => updateDraft({lore:draft.lore.filter((item)=>item.id!==entry.id)})}>删除条目</button></div>)}{draft.lore.length === 0 && <button className={styles.emptyLore} onClick={addLore}><Icon name="plus"/><b>添加第一条世界书</b><span>可跳过，不影响普通角色作品发布</span></button>}</div>
        </section>

        <section className={styles.section} id="opening">
          <SectionHeader number="04" title="开场与表达" description="定义用户进入故事的第一分钟，并用示例教会角色如何表达。"/>
          <Field label="开场场景" required help="时间、地点、正在发生的事件和用户的位置"><textarea rows={5} value={draft.openingScene} onChange={(event)=>updateDraft({openingScene:event.target.value})}/></Field>
          <Field label="角色开场内容" required help="用户进入后实际看到的第一段内容"><textarea rows={5} value={draft.openingLine} onChange={(event)=>updateDraft({openingLine:event.target.value})}/></Field>
          <Field label="示例对话" help="使用 {{user}} 表示用户；多角色时标明发言角色"><textarea rows={7} value={draft.exampleDialogue} placeholder="{{user}}：你为什么在这里？\n角色名：……" onChange={(event)=>updateDraft({exampleDialogue:event.target.value})}/></Field>
          <div className={styles.threeColumns}><Field label="整体风格"><select value={draft.narrativeStyle} onChange={(event)=>updateDraft({narrativeStyle:event.target.value})}><option>沉浸式对话</option><option>电影感悬疑</option><option>轻松日常</option><option>小说化叙事</option><option>快节奏冒险</option></select></Field><Field label="回复长度"><select value={draft.replyLength} onChange={(event)=>updateDraft({replyLength:event.target.value})}><option>简短</option><option>中等</option><option>详细</option><option>跟随场景变化</option></select></Field><Field label="多人发言规则"><input value={draft.speakerRule} onChange={(event)=>updateDraft({speakerRule:event.target.value})}/></Field></div>
          <details className={styles.advanced}><summary>高级 Prompt 与 TXT / JSON 导入 <span>高级选填</span></summary><Field label="高级 Prompt" privateField><textarea rows={10} value={draft.advancedPrompt} onChange={(event)=>updateDraft({advancedPrompt:event.target.value})}/></Field></details>
        </section>

        <section className={styles.section} id="visuals">
          <SectionHeader number="05" title="角色形象" description="上传项目封面和角色图片。第一期不包含角色声音。"/>
          <div className={styles.visualLayout}><div className={styles.coverPreview}><img src={previewImage} alt="作品封面"/><span>作品封面</span></div><div><h3>{selectedCharacter.name || "当前角色"}的图片</h3><p>未单独设置作品封面时，默认使用主要角色的第一张图片。</p><div className={styles.imageList}>{selectedCharacter.images.map((image,index)=><div key={`${image.slice(0,30)}-${index}`}><img src={image} alt=""/><button onClick={()=>updateCharacter({images:selectedCharacter.images.filter((_,itemIndex)=>itemIndex!==index)})}><Icon name="close"/></button></div>)}{selectedCharacter.images.length < 5 && <label><Icon name="upload"/><span>上传</span><input type="file" accept="image/*" onChange={(event)=>handleImage(event,"character")}/></label>}</div><div className={styles.imageActions}><label><Icon name="upload"/>上传作品封面<input type="file" accept="image/*" onChange={(event)=>handleImage(event,"cover")}/></label><button onClick={simulateGenerate} disabled={generating}><Icon name="sparkle"/>{generating ? "模拟生成中…" : "AI 生成图片"}<span>◉ 5</span></button></div></div></div>
          <div className={styles.scopeBanner}><span>第一期不支持</span><b>角色声音、声音上传和声音克隆</b></div>
        </section>

        <section className={styles.section} id="release">
          <SectionHeader number="06" title="发布设置" description="设置内容等级、访问范围和公开标签。这里不提供对话测试。"/>
          <Field label="标签"><input value={draft.tags} placeholder="都市悬疑, 多角色, 慢热" onChange={(event)=>updateDraft({tags:event.target.value})}/></Field>
          <div className={styles.twoColumns}><Field label="内容等级"><select value={draft.rating} onChange={(event)=>updateDraft({rating:event.target.value as Draft["rating"]})}><option>Limited</option><option>Limitless</option></select></Field><Field label="可见范围"><select value={draft.visibility} onChange={(event)=>updateDraft({visibility:event.target.value as Draft["visibility"]})}><option>Public</option><option>Private</option><option>Unlisted</option></select></Field></div>
          <label className={styles.confirm}><input type="checkbox" checked={draft.confirmAdults} onChange={(event)=>updateDraft({confirmAdults:event.target.checked})}/><span><b>所有被描绘的角色均为成年人</b><small>角色及相关内容不得暗示未成年人参与成人情境。</small></span></label>
          <label className={styles.confirm}><input type="checkbox" checked={draft.confirmRights} onChange={(event)=>updateDraft({confirmRights:event.target.checked})}/><span><b>我拥有上传内容的使用权</b><small>包括图片、文字、人物形象和其他受版权保护的材料。</small></span></label>
          <button className={styles.finishButton} onClick={()=>showToast(completion === 100 ? "发布演示完成，没有上传内容" : `当前完成度 ${completion}%，仍可继续保存为草稿`)}><span><b>{completion === 100 ? "完成发布演示" : "保存草稿"}</b><small>{completion === 100 ? "不会上传任何内容" : "所有更改已经自动保存在本地"}</small></span><i>{completion}%</i></button>
          <div className={styles.scopeBanner}><span>第一期不支持</span><b>对话测试及相关 Token / 金币计费</b></div>
        </section>
      </article>

      <aside className={`${styles.rail} ${previewOpen ? styles.mobileOpen : ""}`}>
        <button className={styles.mobileClose} onClick={()=>setPreviewOpen(false)} aria-label="关闭预览"><Icon name="close"/></button>
        <div className={styles.railPreview}><img src={previewImage} alt="作品预览"/><div/><span>{draft.rating}{draft.characters.length > 1 && ` · ${draft.characters.length} Characters`}</span><section><small>{draft.concept || "一句话概念会显示在这里"}</small><h2>{draft.title || "未命名作品"}</h2><p>{draft.publicIntro || "公开介绍会显示在这里。内部设定不会被公开。"}</p><footer>{tags.length ? tags.map((tag)=><i key={tag}>#{tag}</i>) : <i>#添加标签</i>}</footer></section></div>
        <nav className={styles.outline}><header><b>创作目录</b><span>任意顺序填写</span></header>{OUTLINE.map(([id,label],index)=><a href={`#${id}`} key={id} onClick={()=>setPreviewOpen(false)}><i>{String(index+1).padStart(2,"0")}</i><span>{label}</span></a>)}</nav>
        <div className={styles.railProgress}><header><b>草稿完成度</b><strong>{completion}%</strong></header><i><b style={{width:`${completion}%`}}/></i><p>公开预览只显示标题、介绍、标签和角色形象；私有人设与世界书始终隐藏。</p></div>
      </aside>
    </div>

    <button className={styles.mobilePreview} onClick={()=>setPreviewOpen(true)}><Icon name="menu"/>目录与预览</button>
    {previewOpen && <button className={styles.backdrop} aria-label="关闭目录" onClick={()=>setPreviewOpen(false)}/>}
    {toast && <div className={styles.toast}><Icon name="check"/>{toast}</div>}
  </main>;
}
