import { useChatStore } from "../stores/chat.js";
import {
  useGraffitiSession,
  useGraffitiDiscover,
  useGraffiti
} from "@graffiti-garden/wrapper-vue";

import loadMessage from "./message.js";
import { storeToRefs } from "pinia"
import { computed, nextTick, onMounted, ref, watch } from 'vue'

const MESSAGE_CHUNK_GAP_MS = 10 * 60 * 1000;

function setup() {
  const graffiti = useGraffiti();
  const session = useGraffitiSession();
  const chatStore = useChatStore();
  const { activeChatId } = storeToRefs(chatStore);

  function displayGraffitiHandle(handle) {
    return handle?.endsWith(".graffiti.actor")
      ? handle.slice(0, -".graffiti.actor".length)
      : handle;
  }

  function isToday(date) {
    const today = new Date();

    return date.getFullYear() === today.getFullYear()
      && date.getMonth() === today.getMonth()
      && date.getDate() === today.getDate();
  }

  function formatMessageTimestamp(published) {
    const date = new Date(published);

    if (isToday(date)) {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit"
      });
    }

    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function formatMessageTime(published) {
    return new Date(published).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  /**
   * Get message channel for current active chat
   */
  function chatMessageChannels() {
    return activeChatId.value == null ? [] : [`chat:${activeChatId.value}:Messages`];
  }

  // Discover all messages in active chat
  const { objects: chatMessages } = useGraffitiDiscover(
    chatMessageChannels,
    {
      properties: {
        value: {
          required: ["action", "content", "published", 'user'],
          properties: {
            action: { const: "Message" },
            chatId: { type: "string" },
            content: { type: "string" },
            published: { type: "number" },
            user: { type: "string" }
          },
        },
      },
    },
    session
  );

  /**
   * Extract unique user IDs from messages
   * Using Set for automatic deduplication
   */
  const usersInView = computed(() => {
    return [...new Set(chatMessages.value.map(m => m.value.user))];
  });

  const handleCache = ref(new Map());
  const pendingHandles = new Map();

  async function resolveHandle(user) {
    if (!user) return null;

    const cache = handleCache.value;
    if (cache.has(user)) return cache.get(user);
    if (pendingHandles.has(user)) return pendingHandles.get(user);

    const pending = graffiti.actorToHandle(user)
      .then((handle) => {
        const displayHandle = displayGraffitiHandle(handle);
        handleCache.value = new Map(handleCache.value).set(user, displayHandle);
        return displayHandle;
      })
      .catch((err) => {
        console.error("Failed to resolve actor handle:", err);
        handleCache.value = new Map(handleCache.value).set(user, user);
        return user;
      })
      .finally(() => {
        pendingHandles.delete(user);
      });

    pendingHandles.set(user, pending);
    return pending;
  }

  watch(usersInView, async (users) => {
    await Promise.all(users.map(resolveHandle));
  }, { immediate: true });

  // Discover all user profiles for users in view
  const { objects: profileObjects } = useGraffitiDiscover(
    () => usersInView.value.map(u => `user:${u}:Activities`),
    {
      properties: {
        value: {
          required: ["action", "published", 'user'],
          properties: {
            action: { type: "string" },
            published: { type: "number" },
            name: { type: "string" },
            content: { type: "string" },
            url: { type: "string" }
          }
        }
      }
    },
    session
  );

  /**
   * Build profile map from activities
   * Keeps only the most recent ProfileName and ProfileImage for each user
   */
  const profileMap = computed(() => {
    const profiles = {};

    // Iterate through all profile activities
    for (const obj of profileObjects.value) {
      const { user, action, name, url, published } = obj.value;
      if (!user) continue;

      // Initialize user profile if not exists
      if (!profiles[user]) {
        profiles[user] = {
          name: handleCache.value.get(user) ?? user,
          avatarUrl: null,
          _ts: {}
        };
      }

      const userProfile = profiles[user];

      // Update ProfileName if this is newer
      if (action === "ProfileName" && (!userProfile._ts.name || userProfile._ts.name < published)) {
        userProfile.name = name;
        userProfile._ts.name = published;
      }

      // Update ProfileImage if this is newer
      if (action === "ProfileImage" && (!userProfile._ts.avatarUrl || userProfile._ts.avatarUrl < published)) {
        userProfile.avatarUrl = url;
        userProfile._ts.avatarUrl = published;
      }
    }

    return profiles;
  });

  // Use Map for better performance with avatar caching
  const avatarCache = ref(new Map());

  /**
   * Resolve Graffiti media URL to a browser-compatible object URL
   * Results are cached to avoid redundant API calls
   * @param {string} url - Graffiti media URL
   * @returns {Promise<string|null>} Object URL or null on error
   */
  async function resolveAvatar(url) {
    if (!url) return null;

    // Return cached URL if already resolved
    const cache = avatarCache.value;
    if (cache.has(url)) return cache.get(url);

    try {
      const blob = await graffiti.getMedia(url, session.value);
      const objectUrl = URL.createObjectURL(blob.data);
      cache.set(url, objectUrl);
      return objectUrl;
    } catch (err) {
      console.error("Failed to load avatar:", err);
      cache.set(url, null); // Cache the failure to avoid retry
      return null;
    }
  }

  /**
   * Profile map with resolved avatar URLs (blob URLs)
   */
  const resolvedProfileMap = ref({});

  // Watch profileMap and resolve avatars
  watch(profileMap, async (profiles) => {
    const resolved = {};

    for (const [user, profile] of Object.entries(profiles)) {
      let avatar = profile.avatarUrl;

      // Resolve Graffiti URLs to object URLs
      if (avatar?.startsWith("graffiti:")) {
        avatar = await resolveAvatar(avatar);
      }

      resolved[user] = { ...profile, avatarUrl: avatar };
    }

    resolvedProfileMap.value = resolved;
  }, { immediate: true });

  /**
   * Messages enriched with user profile information
   */
  const messagesWithProfiles = computed(() => {
    const orderedMessages = [...chatMessages.value].sort(
      (a, b) => a.value.published - b.value.published
    );

    function isSameChunk(firstMessage, secondMessage) {
      if (!firstMessage || !secondMessage) return false;
      if (firstMessage.value.user !== secondMessage.value.user) return false;

      return Math.abs(secondMessage.value.published - firstMessage.value.published) < MESSAGE_CHUNK_GAP_MS;
    }

    function isSameTimeChunk(firstMessage, secondMessage) {
      if (!firstMessage || !secondMessage) return false;

      return Math.abs(secondMessage.value.published - firstMessage.value.published) < MESSAGE_CHUNK_GAP_MS;
    }

    return orderedMessages.map((msg, index) => {
      const previousMessage = orderedMessages[index - 1];
      const nextMessage = orderedMessages[index + 1];
      const user = msg.value.user;

      return {
        ...msg,
        isFirstInChunk: !isSameChunk(previousMessage, msg),
        isLastInChunk: !isSameChunk(msg, nextMessage),
        isFirstInTimeChunk: !isSameTimeChunk(previousMessage, msg),
        profile: resolvedProfileMap.value[user] ?? {
          name: handleCache.value.get(user) ?? user,
          avatarUrl: null
        }
      };
    });
  });

  const messagesEnd = ref(null);

  function getScrollParent(element) {
    let parent = element?.parentElement;

    while (parent) {
      const style = window.getComputedStyle(parent);
      if (/(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) {
        return parent;
      }

      parent = parent.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  function scrollElementToBottom(element) {
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }

  function forceScrollToBottom() {
    const scrollParent = getScrollParent(messagesEnd.value);
    const main = messagesEnd.value?.closest("main") ?? document.querySelector("main");

    messagesEnd.value?.scrollIntoView({ block: "end" });
    scrollElementToBottom(main);
    scrollElementToBottom(scrollParent);
    scrollElementToBottom(document.scrollingElement || document.documentElement);
  }

  async function scrollToLatestMessage() {
    await nextTick();

    requestAnimationFrame(() => {
      forceScrollToBottom();
      requestAnimationFrame(forceScrollToBottom);
    });

    setTimeout(forceScrollToBottom, 100);
  }

  watch(
    () => messagesWithProfiles.value.length,
    () => scrollToLatestMessage(),
    { flush: "post", immediate: true }
  );

  watch(
    () => [
      activeChatId.value,
      chatMessages.value.reduce((latest, msg) => Math.max(latest, msg.value.published ?? 0), 0),
    ],
    ([chatId, latestMessageAt]) => {
      if (chatId && latestMessageAt) {
        chatStore.markChatRead(chatId);
      }
    },
    { immediate: true }
  );

  watch(
    activeChatId,
    () => scrollToLatestMessage(),
    { flush: "post", immediate: true }
  );

  onMounted(scrollToLatestMessage);

  return {
    chatMessages,
    messagesWithProfiles,
    activeChatId,
    session,
    messagesEnd,
    formatMessageTimestamp,
    formatMessageTime
  };
}

export default async () => ({
  props: ["chatId", "showTimestampColumn"],
  setup,
  components: {
    Message: await loadMessage(),
  },
  template: await fetch(new URL("./chatFlow.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});

