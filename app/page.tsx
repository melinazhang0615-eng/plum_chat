"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand, CoinBadge } from "@/components/brand";
import { createConversation, getBootstrap, getFeed } from "@/lib/api";
import type { Character } from "@/lib/types";

const coverById: Record<string, string> = {
  char_luna: "/characters/luna.svg",
  char_kai: "/characters/kai.svg",
};

const editorialById: Record<string, { eyebrow: string; match: number; note: string }> = {
  char_luna: { eyebrow: "今夜推荐", match: 98, note: "12.8k 人正在收听" },
  char_kai: { eyebrow: "城市邂逅", match: 94, note: "9.3k 人走进过他的镜头" },
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M14 7l5 5-5 5" />
    </svg>
  );
}

function FeedSkeleton() {
  return (
    <div className="discovery-grid" aria-label="正在加载角色">
      {[0, 1].map((item) => (
        <div className="discovery-card discovery-skeleton" key={item}>
          <div className="skeleton skeleton-cover" />
        </div>
      ))}
    </div>
  );
}

export default function FeedPage() {
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [bootstrap, feed] = await Promise.all([getBootstrap(), getFeed()]);
      setBalance(bootstrap.wallet.balance);
      setCharacters(feed.items);
    } catch {
      setError("暂时没能连上角色世界，请确认本地后端已经启动。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function openCharacter(character: Character) {
    if (openingId) return;
    setOpeningId(character.id);
    setError(null);
    try {
      const result = await createConversation(character.id);
      router.push(`/chat/${character.id}?conversation=${result.conversation.id}`);
    } catch {
      setError("进入聊天失败了，请稍后再试。");
      setOpeningId(null);
    }
  }

  return (
    <main className="feed-shell">
      <header className="site-header">
        <Brand />
        <nav className="desktop-nav" aria-label="发现导航">
          <button className="active">为你</button>
          <button>热门</button>
          <button>剧情</button>
          <button>新角色</button>
        </nav>
        <div className="header-actions">
          <button className="round-action" aria-label="搜索角色"><SearchIcon /></button>
          <CoinBadge balance={balance} />
          <div className="user-avatar" title="测试用户">F</div>
        </div>
      </header>

      <section className="discovery-shell">
        <div className="discovery-heading">
          <div>
            <span className="live-kicker"><i /> LIVE CHARACTERS</span>
            <h1>今晚，想进入<br /><em>谁的故事？</em></h1>
          </div>
          <p>每个角色都有自己的记忆、语气和生活。<br />选一个让你好奇的人，从第一句话开始。</p>
        </div>

        <div className="category-row" aria-label="角色分类">
          {['✨ 为你精选', '温柔陪伴', '轻松日常', '心动剧情', '深夜电台', '城市故事'].map((label, index) => (
            <button className={index === 0 ? "active" : ""} key={label}>{label}</button>
          ))}
        </div>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => void load()}>重新加载</button>
          </div>
        )}

        {loading ? (
          <FeedSkeleton />
        ) : (
          <div className="discovery-grid">
            {characters.map((character) => {
              const editorial = editorialById[character.id] ?? { eyebrow: "为你推荐", match: 92, note: `${character.heat_count} 人聊过` };
              return (
                <article className="discovery-card" key={character.id} style={{ "--accent": character.accent_color } as React.CSSProperties}>
                  <Image
                    className="character-cover"
                    src={coverById[character.id] ?? "/characters/luna.svg"}
                    alt={`${character.display_name}的角色封面`}
                    fill
                    priority
                    sizes="(max-width: 720px) 100vw, 50vw"
                  />
                  <div className="cover-shade" />
                  <div className="card-topline">
                    <span className="editorial-badge"><i /> {editorial.eyebrow}</span>
                    <span className="match-badge">契合度 {editorial.match}%</span>
                  </div>
                  <div className="discovery-copy">
                    <div className="tag-cloud">
                      {character.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
                    </div>
                    <h2>{character.display_name}</h2>
                    <p className="card-tagline">“{character.tagline}”</p>
                    <p className="card-intro">{character.intro}</p>
                    <div className="card-foot">
                      <div className="creator-line">
                        <span className="creator-avatar">F</span>
                        <span><b>Fibre 原创</b><small>{editorial.note}</small></span>
                      </div>
                      <button
                        className="enter-story"
                        onClick={() => void openCharacter(character)}
                        disabled={openingId !== null}
                        aria-label={`和${character.display_name}开始聊天`}
                      >
                        <span>{openingId === character.id ? "进入中" : "开始故事"}</span>
                        <ArrowIcon />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <section className="coming-soon">
          <div>
            <span>THE STORY CONTINUES</span>
            <h2>更多相遇，正在路上。</h2>
          </div>
          <p>正式角色卡数据接入后，这里会变成持续更新的角色世界。</p>
        </section>
      </section>

      <footer className="feed-footer">
        <Brand />
        <p>有人设，也有温度的 AI 对话。</p>
        <span>FIBRE · 2026</span>
      </footer>
    </main>
  );
}
