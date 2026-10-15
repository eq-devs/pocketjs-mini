import { createEffect, createSignal, on, Show } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { VirtualList } from "@pocketjs/framework/virtual-list";
import { fetchJson } from "./net.ts";
import { ago, describe, DOT, notify, prefs, query, sdk, updatePrefs } from "./state.ts";
import { clean, domainOf, htmlToText, SLOT, wrap } from "./text.ts";
import { Button, contentWidth, ErrorCard, GAP, Header, HEADER, pageHeight, SEGMENT, Segmented, Skeleton, SmallButton } from "./ui.tsx";

// Hacker News through the public Algolia search API: one request per feed or comment page.

type Story = { id: string; title: string; url: string; domain: string; points: number; comments: number; author: string; at: number; text: string };
type Comment = { id: string; author: string; at: number; text: string };
type Hit = { objectID: string; title?: string | null; url?: string | null; points?: number | null; num_comments?: number | null; author?: string; created_at_i?: number; story_text?: string | null; comment_text?: string | null; parent_id?: number | null };

const API = "https://hn.algolia.com/api/v1";
const PLAIN = "&attributesToHighlight=none&attributesToSnippet=none";
const STORY_FIELDS = `attributesToRetrieve=title,url,points,num_comments,author,created_at_i${PLAIN}`;
const FEEDS = [
  { id: "top", label: "Top" },
  { id: "new", label: "New" },
  { id: "ask", label: "Ask" },
  { id: "show", label: "Show" },
];
function feedUrl(feed: string): string {
  const week = Math.floor(Date.now() / 1000) - 7 * 86400;
  if (feed === "new") return `${API}/search_by_date?tags=story&hitsPerPage=30&${STORY_FIELDS}`;
  if (feed === "ask") return `${API}/search?tags=ask_hn&numericFilters=created_at_i%3E${week}&hitsPerPage=30&${STORY_FIELDS},story_text`;
  if (feed === "show") return `${API}/search?tags=show_hn&numericFilters=created_at_i%3E${week}&hitsPerPage=30&${STORY_FIELDS},story_text`;
  return `${API}/search?tags=front_page&hitsPerPage=30&${STORY_FIELDS}`;
}

const ROW = 76, COMMENT_ROW = 120;
const cache = new Map<string, { at: number; stories: Story[] }>();
const stories = new Map<string, Story>();
const comments = new Map<string, Comment[]>();
const [list, setList] = createSignal<Story[]>([]);
const [listAt, setListAt] = createSignal(0);
const [loading, setLoading] = createSignal(false);
const [error, setError] = createSignal("");
const [thread, setThread] = createSignal<Comment[] | undefined>();
const [threadError, setThreadError] = createSignal("");
let latestFeedRequest = 0, latestThreadRequest = 0;

function toStory(hit: Hit): Story {
  const url = hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;
  return {
    id: hit.objectID, title: clean(hit.title ?? "(untitled)"), url, domain: hit.url ? domainOf(hit.url) : "news.ycombinator.com",
    points: hit.points ?? 0, comments: hit.num_comments ?? 0, author: clean(hit.author ?? "?"),
    at: (hit.created_at_i ?? 0) * 1000, text: hit.story_text ? htmlToText(hit.story_text) : "",
  };
}

export async function loadNews(force = false) {
  const feed = prefs().feed, cached = cache.get(feed);
  if (!force && cached && Date.now() - cached.at < 5 * 60_000) { setList(cached.stories); setListAt(cached.at); setError(""); return; }
  const request = ++latestFeedRequest;
  setLoading(true);
  setError("");
  if (!cached) setList([]);
  try {
    const result = await fetchJson<{ hits: Hit[] }>(feedUrl(feed));
    const next = result.hits.filter(hit => hit.title).map(toStory);
    for (const story of next) stories.set(story.id, story);
    cache.set(feed, { at: Date.now(), stories: next });
    if (request !== latestFeedRequest) return;
    setList(next);
    setListAt(Date.now());
  } catch (failure) {
    if (request !== latestFeedRequest) return;
    setError(describe(failure));
    if (list().length) notify(`News: ${describe(failure)}`);
  } finally {
    if (request === latestFeedRequest) setLoading(false);
  }
}

async function loadThread(id: string) {
  const request = ++latestThreadRequest;
  setThreadError("");
  if (comments.has(id)) { setThread(comments.get(id)); return; }
  setThread(undefined);
  try {
    // parent_id = story id keeps top-level comments only.
    const result = await fetchJson<{ hits: Hit[] }>(`${API}/search?tags=comment,story_${id}&numericFilters=parent_id%3D${id}&hitsPerPage=20&attributesToRetrieve=comment_text,author,created_at_i${PLAIN}`);
    const next = result.hits.filter(hit => hit.comment_text).map(hit => ({
      id: hit.objectID, author: clean(hit.author ?? "?"), at: (hit.created_at_i ?? 0) * 1000,
      text: htmlToText(hit.comment_text ?? ""),
    }));
    comments.set(id, next);
    if (request === latestThreadRequest) setThread(next);
  } catch (failure) {
    if (request === latestThreadRequest) setThreadError(describe(failure));
  }
}

function meta(story: Story): string {
  return `${story.points} points${DOT}${story.comments} comments${DOT}${ago(story.at)}`;
}
/** One line that ends in an ellipsis instead of running off the row. */
function rowMeta(story: Story, width: number): string {
  return wrap(`${story.points} pts${DOT}${story.comments} comments${DOT}${ago(story.at)}${DOT}${story.domain}`, SLOT.xs, width, 1).text;
}

export function NewsTab() {
  const titleWidth = contentWidth - 24 - 12 - 8;
  const listHeight = () => pageHeight() - HEADER - SEGMENT - GAP * 2;
  return <View class="w-full flex-col gap-3">
    <Header title="Hacker News" subtitle={loading() ? "Loading..." : listAt() ? `Updated ${ago(listAt())}` : "news.ycombinator.com"}
      right={<SmallButton label="Refresh" disabled={loading()} onPress={() => loadNews(true)} />} />
    <Segmented options={FEEDS} value={prefs().feed} onChange={feed => { updatePrefs({ feed }); loadNews(); }} />
    <Show when={list().length} fallback={
      <Show when={error()} fallback={<><Skeleton height={ROW - 8} /><Skeleton height={ROW - 8} /><Skeleton height={ROW - 8} /><Skeleton height={ROW - 8} /></>}>
        <ErrorCard message={error()} onRetry={() => loadNews(true)} />
      </Show>
    }>
      <VirtualList count={list().length} rowHeight={ROW} height={listHeight()} overscan={ROW * 2}
        onRowPress={index => { const story = list()[index]; if (story) sdk().navigation.push("/story", { id: story.id }); }}
        renderRow={index => {
          const story = () => list()[index];
          return <View class="w-full flex-col" style={{ height: ROW }}>
            <View class="w-full flex-1 flex-row gap-3 px-1 active:bg-slate-900">
              <View class="w-[24] pt-3"><Text class="text-slate-500 text-sm">{`${index + 1}`}</Text></View>
              <View class="flex-1 flex-col pt-2 gap-1 overflow-hidden">
                <Text class="text-white text-base leading-5">{story() ? wrap(story()!.title, SLOT.base, titleWidth, 2).text : ""}</Text>
                <Text class={story() && story()!.points >= 300 ? "text-amber-400 text-xs" : "text-slate-400 text-xs"}>{story() ? rowMeta(story()!, titleWidth) : ""}</Text>
              </View>
            </View>
            <View class="w-full h-[1] bg-slate-800" />
          </View>;
        }} />
    </Show>
  </View>;
}

function copy(text: string, label: string) {
  sdk().clipboard.write(text.slice(0, 1000)).promise.then(() => notify(`${label} copied`), failure => notify(`Copy failed: ${describe(failure)}`));
}

export function StoryPage() {
  const story = () => stories.get(query().id ?? "");
  createEffect(on(() => query().id, id => { if (id) loadThread(id); }));
  const innerWidth = contentWidth - 32;
  const title = () => wrap(story()?.title ?? "", SLOT.lgBold, innerWidth, 4);
  const body = () => story()?.text ? wrap(story()!.text, SLOT.sm, innerWidth, 4) : undefined;
  const cardHeight = () => 32 + title().lines * 24 + 8 + 16 + (body() ? 8 + body()!.lines * 20 : 0) + 12 + 44;
  const listHeight = () => Math.max(COMMENT_ROW, pageHeight() - HEADER - cardHeight() - 20 - GAP * 3);
  const commentWidth = contentWidth - 24;
  return <View class="w-full flex-col gap-3">
    <Header title="Story" subtitle={story()?.domain ?? ""} back />
    <Show when={story()} fallback={<Text class="text-slate-400 text-base">This story is no longer loaded.</Text>}>
      <View class="w-full flex-col bg-slate-900 rounded-xl p-4 gap-2" style={{ height: cardHeight() }}>
        <Text class="text-white text-lg font-bold leading-6">{title().text}</Text>
        <Text class="text-slate-400 text-xs">{`by ${story()!.author}${DOT}${meta(story()!)}`}</Text>
        <Show when={body()}><Text class="text-slate-300 text-sm leading-5">{body()!.text}</Text></Show>
        <View class="w-full flex-row gap-2 pt-1">
          <Button label="Copy link" onPress={() => copy(story()!.url, "Link")} />
          <Button label="Copy HN link" onPress={() => copy(`https://news.ycombinator.com/item?id=${story()!.id}`, "HN link")} />
        </View>
      </View>
      <Text class="text-slate-400 text-xs">{thread() ? `COMMENTS${DOT}${thread()!.length} top-level of ${story()!.comments}` : "COMMENTS"}</Text>
      <Show when={thread()} fallback={
        <Show when={threadError()} fallback={<><Skeleton height={COMMENT_ROW - 8} /><Skeleton height={COMMENT_ROW - 8} /></>}>
          <ErrorCard message={threadError()} onRetry={() => loadThread(story()!.id)} />
        </Show>
      }>
        <Show when={thread()!.length} fallback={<Text class="text-slate-400 text-sm">No comments yet.</Text>}>
          <VirtualList count={thread()!.length} rowHeight={COMMENT_ROW} height={listHeight()} overscan={COMMENT_ROW * 2}
            onRowPress={index => sdk().navigation.push("/comment", { story: story()!.id, index: String(index) })}
            renderRow={index => {
              const comment = () => thread()![index];
              return <View class="w-full flex-col" style={{ height: COMMENT_ROW }}>
                <View class="w-full flex-col bg-slate-900 rounded-xl p-3 gap-1 overflow-hidden active:bg-slate-800" style={{ height: COMMENT_ROW - 8 }}>
                  <View class="w-full flex-row justify-between">
                    <Text class="text-cyan-400 text-sm">{comment()?.author ?? ""}</Text>
                    <Text class="text-slate-500 text-xs">{comment() ? ago(comment()!.at) : ""}</Text>
                  </View>
                  <Text class="text-slate-200 text-sm leading-5">{comment() ? wrap(comment()!.text, SLOT.sm, commentWidth, 3).text : ""}</Text>
                </View>
              </View>;
            }} />
        </Show>
      </Show>
    </Show>
  </View>;
}

export function CommentPage() {
  const comment = () => comments.get(query().story ?? "")?.[Number(query().index)];
  const maxLines = () => Math.max(4, Math.floor((pageHeight() - HEADER - 32 - 24 - 56 - GAP * 2) / 20));
  const text = () => comment() ? wrap(comment()!.text, SLOT.sm, contentWidth - 32, maxLines()) : undefined;
  return <View class="w-full flex-col gap-3">
    <Header title={comment()?.author ?? "Comment"} subtitle={comment() ? ago(comment()!.at) : ""} back />
    <Show when={text()} fallback={<Text class="text-slate-400 text-base">This comment is no longer loaded.</Text>}>
      <View class="w-full flex-col bg-slate-900 rounded-xl p-4 gap-2">
        <Text class="text-slate-200 text-sm leading-5">{text()!.text}</Text>
        <Show when={text()!.truncated}><Text class="text-slate-500 text-xs">Shortened to fit the screen.</Text></Show>
      </View>
      <View class="w-full flex-row"><Button label="Copy comment" onPress={() => copy(comment()!.text, "Comment")} /></View>
    </Show>
  </View>;
}
