"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Brand } from "@/components/brand";
import styles from "./create.module.css";

type ModuleId = "world" | "characters" | "story" | "visuals" | "publish";
type SaveState = "saved" | "saving" | "local";

export type LoreEntry = {
  id: string;
  name: string;
  keywords: string;
  content: string;
  enabled: boolean;
};

export type Character = {
  id: string;
  name: string;
  gender: string;
  role: string;
  intro: string;
  profile: string;
  privatePrompt: string;
  speechStyle: string;
  relationships: string;
  images: string[];
};

export type Draft = {
  title: string;
  concept: string;
  publicIntro: string;
  era: string;
  location: string;
  relationship: string;
  premise: string;
  coreWorld: string;
  lore: LoreEntry[];
  characters: Character[];
  primaryCharacterId: string;
  openingScene: string;
  openingLine: string;
  exampleDialogue: string;
  narrativeStyle: string;
  replyLength: string;
  speakerRule: string;
  advancedPrompt: string;
  coverImage: string;
  rating: "Limited" | "Limitless";
  visibility: "Public" | "Private" | "Unlisted";
  tags: string;
  confirmAdults: boolean;
  confirmRights: boolean;
};

export const STORAGE_KEY = "plum.create.prototype.v1";

const MODULES: Array<{ id: ModuleId; index: string; label: string; description: string }> = [
  { id: "world", index: "01", label: "作品与世界", description: "故事概念、背景和世界书" },
  { id: "characters", index: "02", label: "登场角色", description: "角色身份、人设和关系" },
  { id: "story", index: "03", label: "故事运行", description: "开场、示例和叙事规则" },
  { id: "visuals", index: "04", label: "角色形象", description: "项目封面和角色图片" },
  { id: "publish", index: "05", label: "预览与发布", description: "分级、标签和可见范围" },
];

const emptyCharacter = (id = "character-1"): Character => ({
  id,
  name: "",
  gender: "未设定",
  role: "",
  intro: "",
  profile: "",
  privatePrompt: "",
  speechStyle: "",
  relationships: "",
  images: [],
});

export const EMPTY_DRAFT: Draft = {
  title: "未命名作品",
  concept: "",
  publicIntro: "",
  era: "",
  location: "",
  relationship: "",
  premise: "",
  coreWorld: "",
  lore: [],
  characters: [emptyCharacter()],
  primaryCharacterId: "character-1",
  openingScene: "",
  openingLine: "",
  exampleDialogue: "",
  narrativeStyle: "沉浸式对话",
  replyLength: "中等",
  speakerRule: "由最适合当前情境的角色自然回应",
  advancedPrompt: "",
  coverImage: "",
  rating: "Limited",
  visibility: "Public",
  tags: "",
  confirmAdults: false,
  confirmRights: false,
};

export const EXAMPLE_DRAFT: Draft = {
  title: "雨夜第七码头",
  concept: "误入封锁码头后，你发现三位旧识都在隐瞒同一件事。",
  publicIntro: "一场暴雨、一个失踪七年的名字，以及三个人互相矛盾的证词。你会相信谁？",
  era: "近未来都市",
  location: "临海城第七码头及其地下旧站",
  relationship: "三位角色曾是同一支调查小队；用户是唯一离队后又被召回的人。",
  premise: "台风登陆前夜，一封没有署名的短信把所有人重新带回已经关闭的码头。",
  coreWorld: "临海城存在被称为“回声”的异常现象。被回声记录的秘密，会在相同天气里重复发生。角色不能凭空知道未亲历的信息，并会根据各自立场隐瞒真相。",
  lore: [
    { id: "lore-echo", name: "回声现象", keywords: "回声, 暴雨, 重复", content: "强烈情绪会被特定地点记录，并在相似天气中重现。回声无法直接伤人，但会诱导人重复过去的选择。", enabled: true },
    { id: "lore-platform", name: "地下零号站台", keywords: "零号站台, 地下站, 末班车", content: "第七码头下方不存在于地图的旧站台。只有暴雨淹没入口时，通往站台的楼梯才会出现。", enabled: true },
  ],
  characters: [
    {
      id: "character-lin",
      name: "林雾",
      gender: "女性",
      role: "异常事件调查员 / 主要角色",
      intro: "冷静克制的调查员，也是最后一个见过失踪者的人。",
      profile: "外表疏离，观察力极强。习惯先确认事实再表达感情，对用户保留着复杂的信任与愧疚。",
      privatePrompt: "林雾知道七年前的失踪并非事故，但不会主动说出完整真相。她优先保护用户，也会在用户冒险时表现出强硬。",
      speechStyle: "短句、克制，不轻易使用感叹号；情绪强烈时会直接叫用户的全名。",
      relationships: "与周衡互不信任；曾与用户共同调查回声事件。",
      images: ["/characters/tipsy-reference/feed-01.avif"],
    },
    {
      id: "character-zhou",
      name: "周衡",
      gender: "男性",
      role: "码头管理人 / 前调查员",
      intro: "看似散漫的码头管理人，掌握着所有监控的缺失片段。",
      profile: "善于用玩笑转移话题，行动比语言诚实。讨厌被命令，但会默默处理危险。",
      privatePrompt: "周衡删除了七年前的一段录像。他认为这是保护大家，而不是背叛。",
      speechStyle: "语气松弛，偶尔反问；真正害怕时反而变得非常礼貌。",
      relationships: "与林雾因旧案决裂；把用户视为仍有机会离开这一切的人。",
      images: ["/characters/tipsy-reference/feed-03.avif"],
    },
  ],
  primaryCharacterId: "character-lin",
  openingScene: "凌晨 00:17，第七码头因台风封锁。你越过生锈的围栏时，看见值班室亮着三盏本不该同时亮起的灯。",
  openingLine: "林雾合上手里的旧档案，没有问你为什么回来。\n“短信也发给你了，对吗？”",
  exampleDialogue: "{{user}}：你们还有多少事瞒着我？\n林雾：足够让你现在转身离开。\n周衡：别听她的。真能走的话，我们七年前就走了。",
  narrativeStyle: "电影感悬疑",
  replyLength: "中等",
  speakerRule: "每轮最多两名角色发言；用角色名明确区分，不代替用户作决定。",
  advancedPrompt: "保持谜团逐步揭示。不要在前三轮直接解释回声的完整来源。",
  coverImage: "/characters/tipsy-reference/feed-01.avif",
  rating: "Limited",
  visibility: "Public",
  tags: "都市悬疑, 多角色, 慢热",
  confirmAdults: true,
  confirmRights: true,
};

export function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <label className={styles.field}><span className={styles.fieldLabel}>{label}{required && <b>必填</b>}</span>{hint && <small>{hint}</small>}{children}</label>;
}

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className={styles.sectionTitle}><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></header>;
}

function Icon({ name }: { name: "world" | "people" | "story" | "image" | "publish" | "plus" | "close" | "sparkle" | "upload" | "arrow" | "check" }) {
  const paths: Record<string, React.ReactNode> = {
    world: <><circle cx="12" cy="12" r="8.5"/><path d="M3.8 10h16.4M3.8 14h16.4M12 3.5c2.2 2.4 3.3 5.2 3.3 8.5S14.2 18.1 12 20.5C9.8 18.1 8.7 15.3 8.7 12S9.8 5.9 12 3.5Z"/></>,
    people: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3.8 19c.6-4 2.3-6 5.2-6s4.6 2 5.2 6M14 15c2.7-.5 4.7.8 5.9 4"/></>,
    story: <><path d="M5 4.5h11a3 3 0 0 1 3 3V19H8a3 3 0 0 1-3-3V4.5Z"/><path d="M8 19V8.5h11M9 9h6M9 12.5h6"/></>,
    image: <><rect x="3.5" y="4" width="17" height="16" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m5.5 17 4.2-4 2.8 2.4 2.3-2.1 3.7 3.7"/></>,
    publish: <><path d="M12 4v11M8 8l4-4 4 4"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
    sparkle: <><path d="m12 3 1.3 4.1L17 9l-3.7 1.9L12 15l-1.3-4.1L7 9l3.7-1.9L12 3Z"/><path d="m18.5 14 .7 2.1 1.8.9-1.8.9-.7 2.1-.7-2.1L16 17l1.8-.9.7-2.1Z"/></>,
    upload: <><path d="M12 16V4M8 8l4-4 4 4"/><path d="M4 15v4h16v-4"/></>, arrow: <path d="m9 6 6 6-6 6"/>, check: <path d="m5 12 4 4L19 6"/>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function CreateStudio() {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [activeModule, setActiveModule] = useState<ModuleId>("world");
  const [selectedCharacterId, setSelectedCharacterId] = useState("character-1");
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("local");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dialog, setDialog] = useState<"reset" | "generate" | "publish" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setSaveState("saved");
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      setSaveState("saved");
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, hydrated]);

  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  const primaryCharacter = draft.characters.find((item) => item.id === draft.primaryCharacterId) ?? draft.characters[0];
  const selectedCharacter = draft.characters.find((item) => item.id === selectedCharacterId) ?? draft.characters[0];
  const tags = draft.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 6);
  const previewImage = draft.coverImage || primaryCharacter?.images[0] || "/characters/luna.svg";

  const missing = useMemo(() => {
    const items: string[] = [];
    if (!draft.title.trim() || draft.title === "未命名作品") items.push("作品标题");
    if (!draft.publicIntro.trim()) items.push("公开介绍");
    if (!draft.coreWorld.trim()) items.push("核心故事背景");
    draft.characters.forEach((character, index) => {
      if (!character.name.trim()) items.push(`角色 ${index + 1} 名称`);
      if (!character.profile.trim()) items.push(`角色 ${index + 1} Profile`);
      if (!character.images.length) items.push(`角色 ${index + 1} 图片`);
    });
    if (!draft.openingScene.trim()) items.push("开场场景");
    if (!draft.openingLine.trim()) items.push("角色开场内容");
    if (!draft.confirmAdults) items.push("成年角色确认");
    if (!draft.confirmRights) items.push("内容权利确认");
    return items;
  }, [draft]);

  const moduleProgress = useMemo<Record<ModuleId, number>>(() => ({
    world: [draft.title && draft.title !== "未命名作品", draft.publicIntro, draft.coreWorld].filter(Boolean).length,
    characters: draft.characters.every((item) => item.name && item.profile) ? 3 : draft.characters.some((item) => item.name || item.profile) ? 2 : 1,
    story: [draft.openingScene, draft.openingLine, draft.exampleDialogue].filter(Boolean).length,
    visuals: draft.characters.some((item) => item.images.length > 0) ? 3 : 1,
    publish: [draft.tags, draft.confirmAdults, draft.confirmRights].filter(Boolean).length,
  }), [draft]);

  function updateDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function flash(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 2600);
  }

  function updateCharacter(patch: Partial<Character>, characterId = selectedCharacter.id) {
    setDraft((current) => ({ ...current, characters: current.characters.map((item) => item.id === characterId ? { ...item, ...patch } : item) }));
  }

  function addCharacter() {
    if (draft.characters.length >= 5) { flash("第一期原型最多支持 5 个角色"); return; }
    const character = emptyCharacter(uid("character"));
    setDraft((current) => ({ ...current, characters: [...current.characters, character] }));
    setSelectedCharacterId(character.id);
  }

  function deleteCharacter(characterId: string) {
    if (draft.characters.length === 1) { flash("一个作品至少需要一个角色"); return; }
    const remaining = draft.characters.filter((item) => item.id !== characterId);
    const nextPrimary = draft.primaryCharacterId === characterId ? remaining[0].id : draft.primaryCharacterId;
    setDraft((current) => ({ ...current, characters: remaining, primaryCharacterId: nextPrimary }));
    setSelectedCharacterId(remaining[0].id);
  }

  function moveCharacter(characterId: string, direction: -1 | 1) {
    const from = draft.characters.findIndex((item) => item.id === characterId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= draft.characters.length) return;
    const next = [...draft.characters];
    [next[from], next[to]] = [next[to], next[from]];
    updateDraft({ characters: next });
  }

  function addLore() {
    const item: LoreEntry = { id: uid("lore"), name: "新设定", keywords: "", content: "", enabled: true };
    updateDraft({ lore: [...draft.lore, item] });
  }

  function updateLore(id: string, patch: Partial<LoreEntry>) {
    updateDraft({ lore: draft.lore.map((item) => item.id === id ? { ...item, ...patch } : item) });
  }

  function loadExample() {
    setDraft(EXAMPLE_DRAFT);
    setSelectedCharacterId(EXAMPLE_DRAFT.primaryCharacterId);
    flash("示例作品已填充，可以逐项修改");
  }

  function resetDraft() {
    window.localStorage.removeItem(STORAGE_KEY);
    setDraft(EMPTY_DRAFT);
    setSelectedCharacterId("character-1");
    setActiveModule("world");
    setDialog(null);
    flash("原型已重置");
  }

  function handleImage(event: ChangeEvent<HTMLInputElement>, target: "cover" | "character") {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 1_500_000) { flash("为了本地保存，请上传小于 1.5 MB 的图片"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      if (target === "cover") updateDraft({ coverImage: result });
      else updateCharacter({ images: [...selectedCharacter.images, result].slice(0, 5) });
      flash("图片已保存到本地草稿");
    };
    reader.readAsDataURL(file);
  }

  function confirmGenerate() {
    setGenerating(true);
    window.setTimeout(() => {
      const choices = ["/characters/tipsy-reference/feed-02.avif", "/characters/tipsy-reference/feed-04.avif", "/characters/tipsy-reference/feed-06.avif"];
      const image = choices[(selectedCharacter.images.length + draft.characters.length) % choices.length];
      updateCharacter({ images: [...selectedCharacter.images, image].slice(0, 5) });
      setGenerating(false);
      setDialog(null);
      flash("模拟图片已生成，本次未扣除金币");
    }, 900);
  }

  async function importPrompt(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const content = file.name.endsWith(".json") ? JSON.stringify(JSON.parse(text), null, 2) : text;
      updateDraft({ advancedPrompt: content.slice(0, 12000) });
      flash(`${file.name} 已导入高级 Prompt`);
    } catch {
      flash("文件无法读取，请检查 TXT/JSON 格式");
    }
  }

  function goToModule(id: ModuleId) {
    setActiveModule(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const activeIndex = MODULES.findIndex((item) => item.id === activeModule);
  const nextModule = MODULES[activeIndex + 1];

  return <main className={styles.shell}>
    <header className={styles.topbar}>
      <div className={styles.brandGroup}><Brand /><span className={styles.prototypeBadge}>需求原型</span></div>
      <div className={styles.draftTitle}><small>当前作品</small><strong>{draft.title || "未命名作品"}</strong></div>
      <div className={styles.topActions}>
        <span className={styles.saveState}><i className={saveState === "saving" ? styles.saving : ""}/>{saveState === "saving" ? "正在保存" : "已保存到本地"}</span>
        <Link className={styles.ghostButton} href="/create/v1">查看第一期版</Link>
        <Link className={styles.ghostButton} href="/create/all-in-one">切换单页版</Link>
        <button className={styles.ghostButton} onClick={loadExample}>填充示例</button>
        <button className={styles.ghostButton} onClick={() => setDialog("reset")}>重置</button>
        <button className={styles.primaryButton} onClick={() => { setActiveModule("publish"); setDialog("publish"); }}>发布检查</button>
      </div>
    </header>

    <div className={styles.mobileModuleBar}>
      {MODULES.map((item) => <button key={item.id} className={activeModule === item.id ? styles.active : ""} onClick={() => goToModule(item.id)}>{item.index} {item.label}</button>)}
    </div>

    <div className={styles.workspace}>
      <aside className={styles.moduleNav}>
        <Link href="/" className={styles.backLink}>← 返回首页</Link>
        <p className={styles.navIntro}>从一个角色开始，也可以逐步扩展成多人互动世界。</p>
        <nav>{MODULES.map((item) => <button key={item.id} className={activeModule === item.id ? styles.active : ""} onClick={() => goToModule(item.id)}>
          <span className={styles.navIcon}><Icon name={item.id === "characters" ? "people" : item.id === "story" ? "story" : item.id === "visuals" ? "image" : item.id === "publish" ? "publish" : "world"}/></span>
          <span><b>{item.label}</b><small>{item.description}</small></span>
          <i className={moduleProgress[item.id] >= 3 ? styles.complete : ""}>{moduleProgress[item.id] >= 3 ? "✓" : item.index}</i>
        </button>)}</nav>
        <div className={styles.scopeNote}><b>第一期范围</b><span>不包含角色声音和对话测试</span></div>
      </aside>

      <section className={styles.editor}>
        {activeModule === "world" && <WorldEditor draft={draft} updateDraft={updateDraft} addLore={addLore} updateLore={updateLore} />}
        {activeModule === "characters" && <CharacterEditor draft={draft} selected={selectedCharacter} select={setSelectedCharacterId} update={updateCharacter} add={addCharacter} remove={deleteCharacter} move={moveCharacter} setPrimary={(id) => updateDraft({ primaryCharacterId: id })} />}
        {activeModule === "story" && <StoryEditor draft={draft} updateDraft={updateDraft} importPrompt={importPrompt} />}
        {activeModule === "visuals" && <VisualEditor draft={draft} selected={selectedCharacter} select={setSelectedCharacterId} onImage={handleImage} updateCharacter={updateCharacter} openGenerate={() => setDialog("generate")} flash={flash} />}
        {activeModule === "publish" && <PublishEditor draft={draft} updateDraft={updateDraft} missing={missing} openPublish={() => setDialog("publish")} />}

        <footer className={styles.editorFooter}>
          <span>{saveState === "saving" ? "正在保存更改…" : "所有更改已保存在此浏览器"}</span>
          {nextModule ? <button className={styles.nextButton} onClick={() => goToModule(nextModule.id)}>下一步：{nextModule.label}<Icon name="arrow"/></button> : <button className={styles.primaryButton} onClick={() => setDialog("publish")}>检查并发布</button>}
        </footer>
      </section>

      <aside className={`${styles.previewPanel} ${previewOpen ? styles.previewOpen : ""}`}>
        <button className={styles.previewClose} onClick={() => setPreviewOpen(false)} aria-label="关闭预览"><Icon name="close"/></button>
        <div className={styles.previewHeader}><span>实时预览</span><small>仅显示公开内容</small></div>
        <div className={styles.previewCard}>
          <img src={previewImage} alt="作品预览" />
          <div className={styles.previewShade}/>
          <div className={styles.previewBadges}><span>{draft.rating}</span>{draft.characters.length > 1 && <span>{draft.characters.length} Characters</span>}</div>
          <div className={styles.previewCopy}><small>{draft.concept || "一句话概念会显示在这里"}</small><h2>{draft.title || "未命名作品"}</h2><p>{draft.publicIntro || "公开介绍会显示在作品详情和推荐页面。私有人设与世界书不会出现在这里。"}</p><div>{tags.length ? tags.map((tag) => <span key={tag}>#{tag}</span>) : <span>#添加标签</span>}</div></div>
        </div>
        <div className={styles.castPreview}><header><b>登场角色</b><span>{draft.characters.length}/5</span></header>{draft.characters.map((character) => <button key={character.id} className={character.id === draft.primaryCharacterId ? styles.primaryCast : ""} onClick={() => { setSelectedCharacterId(character.id); setActiveModule("characters"); setPreviewOpen(false); }}><img src={character.images[0] || "/characters/kai.svg"} alt=""/><span><b>{character.name || "未命名角色"}</b><small>{character.role || "身份待填写"}</small></span>{character.id === draft.primaryCharacterId && <i>主要</i>}</button>)}</div>
        <div className={styles.previewNote}><Icon name="world"/><p><b>内部设定不会公开</b><span>核心背景、私有人设和世界书只用于作品运行。</span></p></div>
      </aside>
    </div>

    <button className={styles.mobilePreviewButton} onClick={() => setPreviewOpen(true)}>预览作品</button>
    {previewOpen && <button className={styles.previewBackdrop} aria-label="关闭预览" onClick={() => setPreviewOpen(false)}/>}
    {notice && <div className={styles.toast}><Icon name="check"/>{notice}</div>}

    {dialog && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !generating) setDialog(null); }}>
      <section className={styles.modal} role="dialog" aria-modal="true">
        <button className={styles.modalClose} onClick={() => !generating && setDialog(null)} aria-label="关闭"><Icon name="close"/></button>
        {dialog === "reset" && <><span className={styles.modalIcon}>↺</span><h2>重置整个原型？</h2><p>所有本地填写内容都会被清除，并恢复为一个空白角色。此操作无法撤销。</p><div className={styles.modalActions}><button className={styles.ghostButton} onClick={() => setDialog(null)}>取消</button><button className={styles.dangerButton} onClick={resetDraft}>确认重置</button></div></>}
        {dialog === "generate" && <><span className={styles.modalIcon}><Icon name="sparkle"/></span><h2>{generating ? "正在模拟生成…" : "AI 生成角色图片"}</h2><p>{generating ? "这是本地原型，不会发送角色信息或调用真实模型。" : `将根据“${selectedCharacter.name || "当前角色"}”的人设生成一张形象图。`}</p><div className={styles.coinCost}><span>预计消耗</span><strong>◉ 5 金币</strong><small>原型演示不会真实扣除</small></div><div className={styles.modalActions}><button className={styles.ghostButton} disabled={generating} onClick={() => setDialog(null)}>取消</button><button className={styles.primaryButton} disabled={generating} onClick={confirmGenerate}>{generating ? "生成中…" : "确认生成"}</button></div></>}
        {dialog === "publish" && <><span className={styles.modalIcon}>{missing.length ? "!" : <Icon name="check"/>}</span><h2>{missing.length ? `还有 ${missing.length} 项需要完成` : "作品已准备好"}</h2><p>{missing.length ? "完成必填项后才能正式发布。你可以先继续保存为本地草稿。" : "这是需求原型，点击完成只会演示发布结果，不会上传任何内容。"}</p>{missing.length > 0 && <ul className={styles.missingList}>{missing.slice(0, 7).map((item) => <li key={item}>{item}</li>)}{missing.length > 7 && <li>以及其他 {missing.length - 7} 项</li>}</ul>}<div className={styles.modalActions}><button className={styles.ghostButton} onClick={() => setDialog(null)}>返回编辑</button><button className={styles.primaryButton} disabled={missing.length > 0} onClick={() => { setDialog(null); flash("发布流程演示完成，未上传任何内容"); }}>完成发布演示</button></div></>}
      </section>
    </div>}
  </main>;
}

function WorldEditor({ draft, updateDraft, addLore, updateLore }: { draft: Draft; updateDraft: (patch: Partial<Draft>) => void; addLore: () => void; updateLore: (id: string, patch: Partial<LoreEntry>) => void }) {
  const [showLore, setShowLore] = useState(true);
  return <>
    <SectionTitle eyebrow="01 · FOUNDATION" title="作品与世界" description="先告诉用户这是什么体验，再把只供 AI 使用的规则放到内部设定。"/>
    <section className={styles.formCard}><header className={styles.cardHeader}><div><span>公开信息</span><h3>用户首先看到什么？</h3></div><i className={styles.requiredPill}>3 项必填</i></header>
      <div className={styles.twoColumns}><Field label="作品标题" required hint="作为作品卡和详情页标题"><input maxLength={30} value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })}/></Field><Field label="一句话概念" hint="用一句话说明冲突或吸引点"><input maxLength={80} value={draft.concept} placeholder="例如：暴雨夜，你被三位旧识带回一桩未结案件" onChange={(event) => updateDraft({ concept: event.target.value })}/></Field></div>
      <Field label="公开介绍" required hint="会展示给用户，但不会直接作为角色行为指令"><textarea rows={4} maxLength={360} value={draft.publicIntro} placeholder="介绍故事氛围、角色关系，以及用户可以体验什么……" onChange={(event) => updateDraft({ publicIntro: event.target.value })}/><em>{draft.publicIntro.length}/360</em></Field>
    </section>
    <section className={styles.formCard}><header className={styles.cardHeader}><div><span>核心背景</span><h3>这段故事始终遵循什么？</h3></div><i className={styles.privatePill}>仅内部可见</i></header>
      <div className={styles.threeColumns}><Field label="时代"><input value={draft.era} placeholder="近未来、维多利亚时代…" onChange={(event) => updateDraft({ era: event.target.value })}/></Field><Field label="地点"><input value={draft.location} placeholder="海滨城、魔法学院…" onChange={(event) => updateDraft({ location: event.target.value })}/></Field><Field label="人物关系"><input value={draft.relationship} placeholder="同事、宿敌、陌生人…" onChange={(event) => updateDraft({ relationship: event.target.value })}/></Field></div>
      <Field label="故事前提"><textarea rows={3} value={draft.premise} placeholder="故事开始前发生了什么，角色为什么聚集在这里？" onChange={(event) => updateDraft({ premise: event.target.value })}/></Field>
      <Field label="核心世界设定" required hint="每轮对话都会参考。只写必须始终成立的规则。"><textarea rows={6} value={draft.coreWorld} placeholder="这个世界的基本规律、角色必须知道的共同事实，以及不能被违背的设定……" onChange={(event) => updateDraft({ coreWorld: event.target.value })}/></Field>
    </section>
    <section className={styles.formCard}><button className={styles.accordionButton} onClick={() => setShowLore((value) => !value)}><span><i>高级选填</i><b>世界书</b><small>只有出现关键词时，才把对应设定提供给 AI</small></span><em>{draft.lore.length} 条 {showLore ? "⌃" : "⌄"}</em></button>
      {showLore && <div className={styles.loreList}>{draft.lore.length === 0 && <div className={styles.emptyState}><Icon name="world"/><b>还没有世界书条目</b><p>适合记录地点、组织、都市传说、物品和隐藏规则。</p></div>}{draft.lore.map((item, index) => <article className={styles.loreCard} key={item.id}><header><span>条目 {index + 1}</span><label className={styles.switch}><input type="checkbox" checked={item.enabled} onChange={(event) => updateLore(item.id, { enabled: event.target.checked })}/><i/></label></header><div className={styles.twoColumns}><Field label="条目名称"><input value={item.name} onChange={(event) => updateLore(item.id, { name: event.target.value })}/></Field><Field label="触发关键词"><input value={item.keywords} placeholder="用逗号分隔" onChange={(event) => updateLore(item.id, { keywords: event.target.value })}/></Field></div><Field label="设定内容"><textarea rows={4} value={item.content} onChange={(event) => updateLore(item.id, { content: event.target.value })}/></Field><button className={styles.textDanger} onClick={() => updateDraft({ lore: draft.lore.filter((entry) => entry.id !== item.id) })}>删除条目</button></article>)}<button className={styles.addBlockButton} onClick={addLore}><Icon name="plus"/>添加世界书条目</button></div>}
    </section>
  </>;
}

function CharacterEditor({ draft, selected, select, update, add, remove, move, setPrimary }: { draft: Draft; selected: Character; select: (id: string) => void; update: (patch: Partial<Character>, id?: string) => void; add: () => void; remove: (id: string) => void; move: (id: string, direction: -1 | 1) => void; setPrimary: (id: string) => void }) {
  const index = draft.characters.findIndex((item) => item.id === selected.id);
  return <>
    <SectionTitle eyebrow="02 · CAST" title="登场角色" description="最少一个角色，也可以添加多人。每个角色都拥有独立人设和说话方式。"/>
    <div className={styles.characterStrip}>{draft.characters.map((item, itemIndex) => <button key={item.id} className={item.id === selected.id ? styles.selected : ""} onClick={() => select(item.id)}><img src={item.images[0] || "/characters/kai.svg"} alt=""/><span><b>{item.name || `角色 ${itemIndex + 1}`}</b><small>{item.id === draft.primaryCharacterId ? "主要角色" : item.role || "待完善"}</small></span></button>)}<button className={styles.addCharacter} disabled={draft.characters.length >= 5} onClick={add}><Icon name="plus"/><span>添加角色</span><small>{draft.characters.length}/5</small></button></div>
    <section className={styles.formCard}><header className={styles.characterHeader}><div><span>角色 {index + 1}</span><h3>{selected.name || "未命名角色"}</h3></div><div><button disabled={index === 0} onClick={() => move(selected.id, -1)}>← 前移</button><button disabled={index === draft.characters.length - 1} onClick={() => move(selected.id, 1)}>后移 →</button><button className={styles.textDanger} disabled={draft.characters.length === 1} onClick={() => remove(selected.id)}>删除</button></div></header>
      <label className={styles.primaryChoice}><input type="radio" checked={draft.primaryCharacterId === selected.id} onChange={() => setPrimary(selected.id)}/><span><b>设为主要角色</b><small>决定作品默认封面、名称和推荐卡展示</small></span></label>
      <div className={styles.threeColumns}><Field label="角色名称" required><input maxLength={30} value={selected.name} onChange={(event) => update({ name: event.target.value })}/></Field><Field label="性别"><select value={selected.gender} onChange={(event) => update({ gender: event.target.value })}><option>未设定</option><option>女性</option><option>男性</option><option>非二元</option><option>其他</option></select></Field><Field label="身份/职业"><input value={selected.role} placeholder="调查员、室友、骑士…" onChange={(event) => update({ role: event.target.value })}/></Field></div>
      <Field label="公开简介" hint="用户在作品详情里可以看到"><textarea rows={3} maxLength={220} value={selected.intro} onChange={(event) => update({ intro: event.target.value })}/><em>{selected.intro.length}/220</em></Field>
      <Field label="Profile" required hint="描述外貌、性格、兴趣和鲜明特点"><textarea rows={5} value={selected.profile} placeholder="他/她是怎样的人？面对压力、亲密和冲突时会怎么做？" onChange={(event) => update({ profile: event.target.value })}/></Field>
      <div className={styles.privateGroup}><header><span>内部角色设定</span><i>不会公开展示</i></header><Field label="私有人设"><textarea rows={5} value={selected.privatePrompt} placeholder="角色知道但用户初期不知道的事实、内在目标、边界和行为原则……" onChange={(event) => update({ privatePrompt: event.target.value })}/></Field><div className={styles.twoColumns}><Field label="说话特点"><textarea rows={3} value={selected.speechStyle} placeholder="用词、语气、口头禅，以及情绪变化时的表达" onChange={(event) => update({ speechStyle: event.target.value })}/></Field><Field label="与其他角色的关系"><textarea rows={3} value={selected.relationships} placeholder="信任、秘密、冲突与共同经历" onChange={(event) => update({ relationships: event.target.value })}/></Field></div></div>
    </section>
  </>;
}

function StoryEditor({ draft, updateDraft, importPrompt }: { draft: Draft; updateDraft: (patch: Partial<Draft>) => void; importPrompt: (event: ChangeEvent<HTMLInputElement>) => void }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  return <>
    <SectionTitle eyebrow="03 · EXPERIENCE" title="故事运行方式" description="定义用户从哪里进入、角色如何开口，以及多人故事怎样自然推进。"/>
    <section className={styles.formCard}><header className={styles.cardHeader}><div><span>进入故事</span><h3>第一分钟发生什么？</h3></div><i className={styles.requiredPill}>2 项必填</i></header><Field label="开场场景" required hint="描述时间、地点、发生中的事件和用户的位置"><textarea rows={5} value={draft.openingScene} onChange={(event) => updateDraft({ openingScene: event.target.value })}/></Field><Field label="角色开场内容" required hint="用户进入后实际看到的第一段内容"><textarea rows={5} value={draft.openingLine} onChange={(event) => updateDraft({ openingLine: event.target.value })}/></Field></section>
    <section className={styles.formCard}><header className={styles.cardHeader}><div><span>表达样例</span><h3>用对话示范角色怎么说话</h3></div><i className={styles.optionalPill}>选填但推荐</i></header><Field label="示例对话" hint="使用 {{user}} 表示用户；多角色时请标明发言角色"><textarea rows={8} value={draft.exampleDialogue} placeholder="{{user}}：你为什么在这里？\n角色名：……" onChange={(event) => updateDraft({ exampleDialogue: event.target.value })}/></Field></section>
    <section className={styles.formCard}><header className={styles.cardHeader}><div><span>叙事偏好</span><h3>故事以什么方式回应？</h3></div></header><div className={styles.twoColumns}><Field label="整体风格"><select value={draft.narrativeStyle} onChange={(event) => updateDraft({ narrativeStyle: event.target.value })}><option>沉浸式对话</option><option>电影感悬疑</option><option>轻松日常</option><option>小说化叙事</option><option>快节奏冒险</option><option>自定义</option></select></Field><Field label="回复长度"><select value={draft.replyLength} onChange={(event) => updateDraft({ replyLength: event.target.value })}><option>简短</option><option>中等</option><option>详细</option><option>跟随场景变化</option></select></Field></div><Field label="多角色发言规则"><textarea rows={3} value={draft.speakerRule} onChange={(event) => updateDraft({ speakerRule: event.target.value })}/></Field></section>
    <section className={styles.formCard}><button className={styles.accordionButton} onClick={() => setAdvancedOpen((value) => !value)}><span><i>高级选填</i><b>高级 Prompt 与导入</b><small>适合已有角色卡或熟悉 Prompt 的创作者</small></span><em>{advancedOpen ? "⌃" : "⌄"}</em></button>{advancedOpen && <div className={styles.advancedContent}><label className={styles.importButton}><Icon name="upload"/><span><b>导入 TXT / JSON</b><small>内容只在本地读取</small></span><input type="file" accept=".txt,.json,text/plain,application/json" onChange={importPrompt}/></label><Field label="高级 Prompt"><textarea rows={12} value={draft.advancedPrompt} onChange={(event) => updateDraft({ advancedPrompt: event.target.value })}/></Field></div>}</section>
  </>;
}

function VisualEditor({ draft, selected, select, onImage, updateCharacter, openGenerate, flash }: { draft: Draft; selected: Character; select: (id: string) => void; onImage: (event: ChangeEvent<HTMLInputElement>, target: "cover" | "character") => void; updateCharacter: (patch: Partial<Character>, id?: string) => void; openGenerate: () => void; flash: (message: string) => void }) {
  return <>
    <SectionTitle eyebrow="04 · VISUALS" title="角色形象" description="设置作品封面和每位角色的图片。第一期不包含角色声音。"/>
    <section className={styles.formCard}><header className={styles.cardHeader}><div><span>作品封面</span><h3>用户在推荐页首先看到的画面</h3></div><i className={styles.optionalPill}>未设置时使用主要角色</i></header><div className={styles.coverEditor}><div className={styles.coverThumb}><img src={draft.coverImage || draft.characters.find((item) => item.id === draft.primaryCharacterId)?.images[0] || "/characters/luna.svg"} alt="封面"/></div><div><h4>竖版作品封面</h4><p>建议使用 2:3 或更长的竖图。原型上传限制为 1.5 MB。</p><label className={styles.secondaryButton}><Icon name="upload"/>上传封面<input type="file" accept="image/*" onChange={(event) => onImage(event, "cover")}/></label></div></div></section>
    <section className={styles.formCard}><header className={styles.cardHeader}><div><span>角色图片</span><h3>每个角色可以拥有多张形象图</h3></div><i className={styles.discussionPill}>多图用途待讨论</i></header><div className={styles.identityTabs}>{draft.characters.map((item) => <button className={item.id === selected.id ? styles.selected : ""} key={item.id} onClick={() => select(item.id)}>{item.name || "未命名角色"}<small>{item.images.length}/5</small></button>)}</div><div className={styles.imageGrid}>{selected.images.map((image, index) => <article key={`${image.slice(0, 40)}-${index}`}><img src={image} alt={`${selected.name} 图片 ${index + 1}`}/>{index === 0 && <span>默认</span>}<button aria-label="删除图片" onClick={() => updateCharacter({ images: selected.images.filter((_, itemIndex) => itemIndex !== index) })}><Icon name="close"/></button></article>)}{selected.images.length < 5 && <label className={styles.imageAdd}><Icon name="upload"/><b>上传图片</b><small>{selected.images.length}/5</small><input type="file" accept="image/*" onChange={(event) => onImage(event, "character")}/></label>}</div><div className={styles.visualActions}><button className={styles.secondaryButton} onClick={openGenerate}><Icon name="sparkle"/>AI 生成图片 <span>◉ 5</span></button><button className={styles.ghostButton} onClick={() => flash("裁切工具将在需求确认后实现")}>裁切当前图片</button></div></section>
    <div className={styles.excludedFeature}><span>第一期暂不支持</span><b>角色声音、声音上传和声音克隆</b><p>这些能力不会出现在发布必填项中。</p></div>
  </>;
}

function PublishEditor({ draft, updateDraft, missing, openPublish }: { draft: Draft; updateDraft: (patch: Partial<Draft>) => void; missing: string[]; openPublish: () => void }) {
  return <>
    <SectionTitle eyebrow="05 · RELEASE" title="预览与发布" description="确认用户能看到的内容、内容分级和访问范围。这里不提供对话测试。"/>
    <section className={styles.formCard}><header className={styles.cardHeader}><div><span>内容分类</span><h3>帮助用户找到合适的作品</h3></div></header><Field label="标签" hint="用逗号分隔，原型预览最多显示 6 个"><input value={draft.tags} placeholder="都市悬疑, 多角色, 慢热" onChange={(event) => updateDraft({ tags: event.target.value })}/></Field><div className={styles.twoColumns}><Field label="内容等级"><select value={draft.rating} onChange={(event) => updateDraft({ rating: event.target.value as Draft["rating"] })}><option>Limited</option><option>Limitless</option></select></Field><Field label="可见范围"><select value={draft.visibility} onChange={(event) => updateDraft({ visibility: event.target.value as Draft["visibility"] })}><option>Public</option><option>Private</option><option>Unlisted</option></select></Field></div></section>
    <section className={styles.formCard}><header className={styles.cardHeader}><div><span>发布确认</span><h3>内容与权利声明</h3></div></header><label className={styles.confirmRow}><input type="checkbox" checked={draft.confirmAdults} onChange={(event) => updateDraft({ confirmAdults: event.target.checked })}/><span><b>所有被描绘的角色均为成年人</b><small>角色及相关内容不得暗示未成年人参与成人情境。</small></span></label><label className={styles.confirmRow}><input type="checkbox" checked={draft.confirmRights} onChange={(event) => updateDraft({ confirmRights: event.target.checked })}/><span><b>我拥有上传内容的使用权</b><small>包括图片、文字、人物形象和其他受版权保护的材料。</small></span></label></section>
    <section className={`${styles.formCard} ${missing.length ? styles.checkIncomplete : styles.checkComplete}`}><header className={styles.releaseCheck}><span>{missing.length ? "!" : <Icon name="check"/>}</span><div><h3>{missing.length ? `还差 ${missing.length} 项必填内容` : "已满足原型发布条件"}</h3><p>{missing.length ? missing.slice(0, 4).join("、") : "可以运行发布流程演示，不会上传任何内容。"}</p></div><button className={styles.primaryButton} onClick={openPublish}>查看检查结果</button></header></section>
    <div className={styles.excludedFeature}><span>第一期暂不支持</span><b>对话测试和测试 Token / 金币计费</b><p>作品预览只检查公开展示效果，不产生任何模型回复。</p></div>
  </>;
}
