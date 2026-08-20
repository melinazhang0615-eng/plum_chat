"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, getDebugConversation, getDebugTurn, getDebugTurns } from "@/lib/api";
import type {
  DebugConversationOverview,
  DebugPrompt,
  DebugRecord,
  DebugSnapshot,
  DebugTurnDetail,
  DebugTurnSummary,
} from "@/lib/types";
import styles from "./debug.module.css";

type Tab = "request" | "blocks" | "cast" | "lifecycle" | "raw";

const TABS: { key: Tab; label: string }[] = [
  { key: "request", label: "Request" },
  { key: "blocks", label: "Blocks" },
  { key: "cast", label: "Cast" },
  { key: "lifecycle", label: "Lifecycle" },
  { key: "raw", label: "Raw JSON" },
];

/**
 * What each connection-level card is, in two or three sentences.
 *
 * These answer "what am I looking at and where does it come into the prompt", which is the
 * question a field name alone never answers. Kept in Chinese because that is the working
 * language of the people debugging this.
 */
const CARD_HELP: Record<string, { zh: string; help: string }> = {
  conversation: {
    zh: "会话",
    help: "这条聊天本身的记录：绑定的 runtime 账号与 session、模型档位、语言口径和状态。Restart 会归档旧会话并新建一条，所以换会话后这里的 id 会变。",
  },
  connection: {
    zh: "连接",
    help: "用户与某个剧本的长期关系实例，跨会话存在。它记录当前采用的剧本版本和 Cast 内容修订；每轮编排的版本号都从这里取。",
  },
  conversationState: {
    zh: "会话状态",
    help: "这条会话推进到哪儿了：章节号、场景 key、剧情状态和状态版本号。每轮都会注入 prompt；模型只能提议状态变化，最终以库里这份为准。",
  },
  scenario: {
    zh: "剧本版本",
    help: "被冻结的那一版剧本内容与约束：开场、世界观、回复契约、内容分级、每轮片段上限。剧本发新版不会自动改写已有连接，除非发生采用。",
  },
  castRevision: {
    zh: "Cast 内容修订",
    help: "连接在某个时刻采用的整套角色版本快照。角色发布新内容会生成新修订，兼容才会被采用；prompt 里的角色设定就来自这一份。",
  },
  modelProfile: {
    zh: "模型档位",
    help: "这条会话选中的档位（fast / balanced / immersive 或游客档），决定实际的 provider、模型和每条消息的金币价。",
  },
  languagePreference: {
    zh: "语言偏好",
    help: "用户账号级的界面语言与默认回复语言。本轮的实际语言由它和请求解析共同决定，最终口径以 snapshot 里的语言四元组为准。",
  },
  castMember: {
    zh: "Cast 成员",
    help: "这份修订里的一个角色槽位：cast_key、角色内容版本、prompt 版本和编译产物 id。编排按 sort_order 依次拼装角色 Block。",
  },
  relationship: {
    zh: "关系状态",
    help: "用户与这个角色槽位之间的关系阶段与累计轮数，按连接维度存储。每轮作为关系 Block 注入 prompt。",
  },
  presentCast: {
    zh: "在场 Cast",
    help: "当前场景里在场的角色槽位。它决定这轮允许谁发言，以及 tail 里注入哪些 active_cast。",
  },
};

/** Values arrive straight from database rows, so anything can be anything. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value === "" ? "—" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function isBlock(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

/**
 * A record rendered as a key/value grid; nested objects fall back to formatted JSON.
 *
 * Overview cards start collapsed: the connection-level facts are reference material you
 * consult, while the turn you clicked is what you came to read. `help` explains what the
 * card *is* and opens independently of the rows, so you can ask "what is this?" without
 * unfolding forty fields.
 */
function Facts({
  record,
  title,
  subtitle,
  help,
  defaultOpen = true,
}: {
  record: DebugRecord | null;
  title: string;
  subtitle?: string;
  help?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [helpOpen, setHelpOpen] = useState(false);
  const entries = Object.entries(record ?? {});
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <button
          type="button"
          className={styles.cardToggle}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <span className={styles.caret} aria-hidden="true">{open ? "▾" : "▸"}</span>
          <span className={styles.cardTitle}>{title}</span>
          {subtitle && <span className={styles.cardSubtitle}>{subtitle}</span>}
        </button>
        {help && (
          <button
            type="button"
            className={styles.helpButton}
            onClick={() => setHelpOpen((value) => !value)}
            aria-expanded={helpOpen}
            aria-label={`${title} 说明`}
          >
            ?
          </button>
        )}
      </div>
      {helpOpen && help && <p className={styles.help}>{help}</p>}
      {open &&
        (entries.length === 0 ? (
          <p className={styles.empty}>No rows.</p>
        ) : (
          <dl className={styles.facts}>
            {entries.map(([key, value]) => (
              <div key={key} className={styles.fact}>
                <dt>{key}</dt>
                <dd className={isBlock(value) ? styles.factBlock : undefined}>
                  {formatValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        ))}
    </section>
  );
}

/** A list of records (cast members, segments, …) as one card per row. */
function RecordList({ records, title }: { records: DebugRecord[]; title: string }) {
  if (records.length === 0) {
    return (
      <section className={styles.card}>
        <h3 className={styles.cardTitle}>{title}</h3>
        <p className={styles.empty}>No rows.</p>
      </section>
    );
  }
  return (
    <>
      {records.map((record, index) => (
        <Facts
          key={index}
          record={record}
          title={`${title} · ${String(record.cast_key ?? record.ordinal ?? index + 1)}`}
        />
      ))}
    </>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={styles.ghostButton}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => setCopied(false),
        );
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/**
 * The exact provider request, in the order the provider received it: the system prompt
 * first, then every message. The hash badge is the whole point of the view — it says
 * whether this text is what was dispatched, or merely something that looks like it.
 */
function RequestView({ prompt }: { prompt: DebugPrompt | null }) {
  if (!prompt) {
    return (
      <p className={styles.empty}>
        No captured request for this attempt. The Debug Console was closed when this turn ran,
        or the capture has passed its retention window. The block manifest below is still exact.
      </p>
    );
  }
  const wholeRequest = JSON.stringify(
    {
      system_prompt: prompt.system_prompt,
      messages: prompt.messages,
      response_format: prompt.response_format,
    },
    null,
    2,
  );
  return (
    <>
      <div className={styles.requestBar}>
        <span className={prompt.hash_matches ? styles.badgeOk : styles.badgeWarn}>
          {prompt.hash_matches
            ? "✓ matches dispatched request hash"
            : "! hash mismatch — do not trust this text"}
        </span>
        <span className={styles.mutedInline}>captured {prompt.captured_at}</span>
        <span className={styles.mutedInline}>expires {prompt.expires_at}</span>
        <CopyButton text={wholeRequest} label="Copy whole request" />
      </div>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>
            System prompt
            <span className={styles.muted}> · {prompt.system_prompt.length} chars</span>
          </h3>
          <CopyButton text={prompt.system_prompt} label="Copy" />
        </div>
        <pre className={styles.prompt}>{prompt.system_prompt}</pre>
      </section>

      {prompt.messages.map((message, index) => {
        const content = String(message.content ?? "");
        // The renderer puts the system prompt in `messages[0]` as well. Showing the same
        // 5k characters twice buries the turn's actual messages, so the duplicate is kept
        // (it *was* sent) but folded away.
        const duplicatesSystem = content === prompt.system_prompt;
        return (
          <section key={index} className={styles.card}>
            <div className={styles.cardHead}>
              <h3 className={styles.cardTitle}>
                {`messages[${index}]`}
                <span className={styles.muted}> · {message.role} · {content.length} chars</span>
              </h3>
              <CopyButton text={content} label="Copy" />
            </div>
            {duplicatesSystem ? (
              <details className={styles.fold}>
                <summary>Identical to the system prompt above — expand to verify</summary>
                <pre className={styles.prompt}>{content}</pre>
              </details>
            ) : (
              <pre className={styles.prompt}>{content}</pre>
            )}
          </section>
        );
      })}

      <Facts record={prompt.request_meta} title="Provider parameters" />
      <Facts record={prompt.response_format} title="Response format" />
    </>
  );
}

function BlocksView({ snapshot }: { snapshot: DebugSnapshot }) {
  const manifest = snapshot.block_manifest;
  if (!manifest) return <p className={styles.empty}>No block manifest.</p>;
  const blocks = Array.isArray(manifest.blocks) ? (manifest.blocks as DebugRecord[]) : [];
  const sourceRefs = Array.isArray(manifest.source_refs)
    ? (manifest.source_refs as DebugRecord[])
    : [];
  const scalars = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => !["blocks", "source_refs"].includes(key)),
  );
  return (
    <>
      <Facts record={scalars} title="Manifest" />
      <RecordList records={blocks} title="Block" />
      <RecordList records={sourceRefs} title="Source" />
    </>
  );
}

export default function DebugConsolePage() {
  const params = useParams<{ conversationId: string }>();
  const router = useRouter();
  const conversationId = params.conversationId;

  const [overview, setOverview] = useState<DebugConversationOverview | null>(null);
  const [turns, setTurns] = useState<DebugTurnSummary[]>([]);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DebugTurnDetail | null>(null);
  const [attemptIndex, setAttemptIndex] = useState(0);
  const [tab, setTab] = useState<Tab>("request");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [conversation, timeline] = await Promise.all([
        getDebugConversation(conversationId),
        getDebugTurns(conversationId),
      ]);
      setOverview(conversation);
      setTurns(timeline.items);
      setSelectedTurnId((current) => current ?? timeline.items[0]?.id ?? null);
    } catch (loadError) {
      // 404 is the closed-console answer as well as the wrong-owner answer: the backend
      // deliberately does not distinguish them, and neither does this message.
      setError(
        loadError instanceof ApiError && loadError.status === 404
          ? "The debug console is not available for this account, or this conversation is not yours."
          : "Could not load the debug console. Try refreshing.",
      );
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedTurnId) return;
    let cancelled = false;
    setDetailLoading(true);
    getDebugTurn(selectedTurnId)
      .then((payload) => {
        if (cancelled) return;
        setDetail(payload);
        setAttemptIndex(0);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTurnId]);

  const snapshot = useMemo<DebugSnapshot | null>(
    () => detail?.snapshots?.[attemptIndex] ?? null,
    [detail, attemptIndex],
  );

  if (loading) {
    return <main className={styles.page}><p className={styles.empty}>Loading…</p></main>;
  }
  if (error) {
    return (
      <main className={styles.page}>
        <div className={styles.fatal}>
          <h1>Debug console</h1>
          <p>{error}</p>
          <button type="button" className={styles.ghostButton} onClick={() => router.push("/")}>
            Back to characters
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.topIds}>
          <strong>Debug console</strong>
          <span className={styles.mono}>{conversationId}</span>
          <CopyButton text={conversationId} label="Copy id" />
        </div>
        <div className={styles.topActions}>
          <button type="button" className={styles.ghostButton} onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.timeline}>
          <h2 className={styles.sideTitle}>Turns</h2>
          {turns.length === 0 && <p className={styles.empty}>No turns yet.</p>}
          {turns.map((turn) => (
            <button
              key={turn.id}
              type="button"
              className={`${styles.turnItem} ${turn.id === selectedTurnId ? styles.turnItemActive : ""}`}
              onClick={() => {
                // Clear here rather than in the effect: the old turn's prompt must not stay
                // on screen under a new turn's heading while the request is in flight.
                setDetail(null);
                setSelectedTurnId(turn.id);
              }}
            >
              <span className={styles.turnHead}>
                <span className={styles.mono}>{turn.id.replace("turn_", "").slice(0, 10)}</span>
                <span className={styles[`status_${turn.status}`] ?? styles.statusOther}>
                  {turn.status}
                </span>
              </span>
              <span className={styles.turnMeta}>
                {turn.created_at}
                {turn.attempt > 1 ? ` · ${turn.attempt} attempts` : ""}
                {turn.has_prompt ? "" : " · no prompt"}
              </span>
              <span className={styles.turnMeta}>
                {turn.model_ref ?? "—"}
                {turn.error_code ? ` · ${turn.error_code}` : ""}
              </span>
            </button>
          ))}
        </aside>

        <div className={styles.detail}>
          <div className={styles.overviewGrid}>
            <Facts
              record={overview?.conversation ?? null}
              title="Conversation"
              subtitle={CARD_HELP.conversation.zh}
              help={CARD_HELP.conversation.help}
              defaultOpen={false}
            />
            <Facts
              record={overview?.connection ?? null}
              title="Connection"
              subtitle={CARD_HELP.connection.zh}
              help={CARD_HELP.connection.help}
              defaultOpen={false}
            />
            <Facts
              record={overview?.conversation_state ?? null}
              title="Conversation state"
              subtitle={CARD_HELP.conversationState.zh}
              help={CARD_HELP.conversationState.help}
              defaultOpen={false}
            />
            <Facts
              record={overview?.scenario ?? null}
              title="Scenario version"
              subtitle={CARD_HELP.scenario.zh}
              help={CARD_HELP.scenario.help}
              defaultOpen={false}
            />
            <Facts
              record={overview?.cast_revision ?? null}
              title="Cast content revision"
              subtitle={CARD_HELP.castRevision.zh}
              help={CARD_HELP.castRevision.help}
              defaultOpen={false}
            />
            <Facts
              record={overview?.model_profile ?? null}
              title="Model profile"
              subtitle={CARD_HELP.modelProfile.zh}
              help={CARD_HELP.modelProfile.help}
              defaultOpen={false}
            />
            <Facts
              record={overview?.language_preference ?? null}
              title="Language preference"
              subtitle={CARD_HELP.languagePreference.zh}
              help={CARD_HELP.languagePreference.help}
              defaultOpen={false}
            />
            {(overview?.cast_members ?? []).map((member, index) => (
              <Facts
                key={index}
                record={member}
                title={`Cast member · ${String(member.cast_key ?? index)}`}
                subtitle={CARD_HELP.castMember.zh}
                help={CARD_HELP.castMember.help}
                defaultOpen={false}
              />
            ))}
            {(overview?.relationship_states ?? []).map((state, index) => (
              <Facts
                key={index}
                record={state}
                title={`Relationship · ${String(state.cast_key ?? index)}`}
                subtitle={CARD_HELP.relationship.zh}
                help={CARD_HELP.relationship.help}
                defaultOpen={false}
              />
            ))}
            {(overview?.present_cast ?? []).map((present, index) => (
              <Facts
                key={index}
                record={present}
                title={`Present cast · ${String(present.cast_key ?? index)}`}
                subtitle={CARD_HELP.presentCast.zh}
                help={CARD_HELP.presentCast.help}
                defaultOpen={false}
              />
            ))}
          </div>

          <div className={styles.turnPanel}>
            {!selectedTurnId && <p className={styles.empty}>Select a turn.</p>}
            {selectedTurnId && detailLoading && <p className={styles.empty}>Loading turn…</p>}
            {selectedTurnId && !detailLoading && !detail && (
              <p className={styles.empty}>This turn could not be loaded.</p>
            )}
            {detail && (
              <>
                {detail.snapshots.length > 1 && (
                  <div className={styles.attemptBar}>
                    {detail.snapshots.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`${styles.attemptButton} ${index === attemptIndex ? styles.attemptButtonActive : ""}`}
                        onClick={() => setAttemptIndex(index)}
                      >
                        {`attempt ${item.attempt} · request ${item.request_ordinal}`}
                      </button>
                    ))}
                  </div>
                )}
                <nav className={styles.tabs}>
                  {TABS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`${styles.tab} ${tab === item.key ? styles.tabActive : ""}`}
                      onClick={() => setTab(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>

                {!snapshot && tab !== "lifecycle" && tab !== "raw" && (
                  <p className={styles.empty}>
                    This turn has no context snapshot — it failed before the prompt was compiled.
                  </p>
                )}
                {tab === "request" && snapshot && <RequestView prompt={snapshot.prompt} />}
                {tab === "blocks" && snapshot && <BlocksView snapshot={snapshot} />}
                {tab === "cast" && snapshot && (
                  <RecordList records={snapshot.cast ?? []} title="Snapshot cast" />
                )}
                {tab === "lifecycle" && (
                  <>
                    <Facts record={detail.turn} title="Turn run" />
                    {snapshot && (
                      <Facts
                        record={Object.fromEntries(
                          Object.entries(snapshot).filter(
                            ([key]) => !["prompt", "cast", "block_manifest"].includes(key),
                          ),
                        )}
                        title="Snapshot"
                      />
                    )}
                    <Facts record={detail.billing} title="Billing" />
                    <RecordList records={detail.segments ?? []} title="Scene segment" />
                    <Facts record={detail.ownership} title="Ownership" />
                  </>
                )}
                {tab === "raw" && (
                  <section className={styles.card}>
                    <div className={styles.cardHead}>
                      <h3 className={styles.cardTitle}>Raw response</h3>
                      <CopyButton text={JSON.stringify(detail, null, 2)} label="Copy" />
                    </div>
                    <pre className={styles.prompt}>{JSON.stringify(detail, null, 2)}</pre>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
