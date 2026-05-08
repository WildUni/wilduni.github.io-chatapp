import { useChatStore } from "../stores/chat.js";
import { usePendingMessagesStore } from "../stores/pendingMessages.js";
import { useProfileCacheStore } from "../stores/profileCache.js";
import {
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";

import loadMessage from "./message.js";
import { storeToRefs } from "pinia"
import { computed, nextTick, onMounted, ref, watch } from 'vue'

const MESSAGE_CHUNK_GAP_MS = 10 * 60 * 1000;

function setup() {
  const graffiti = useGraffiti();
  const session = useGraffitiSession();
  const chatStore = useChatStore();
  const pendingMessagesStore = usePendingMessagesStore();
  const profileCache = useProfileCacheStore();
  const { activeChatId } = storeToRefs(chatStore);

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
  const { objects: chatMessages, isFirstPoll: isMessagesFirstPoll } = useGraffitiDiscover(
    chatMessageChannels,
    {
      properties: {
        value: {
          required: ["action", "content", "published", 'user'],
          properties: {
            action: { const: "Message" },
            chatId: { type: "string" },
            clientId: { type: "string" },
            content: { type: "string" },
            published: { type: "number" },
            replyTo: { type: "string" },
            replyToContent: { type: "string" },
            replyToUser: { type: "string" },
            user: { type: "string" }
          },
        },
      },
    },
    session
  );

  const pendingMessagesInActiveChat = computed(() =>
    pendingMessagesStore.pendingMessagesForChat(activeChatId.value).map((message) => ({
      url: `pending:${message.clientId}`,
      isPending: true,
      pendingStatus: message.status,
      value: {
        action: "Message",
        chatId: message.chatId,
        clientId: message.clientId,
        content: message.content,
        published: message.published,
        replyTo: message.replyTo,
        replyToContent: message.replyToContent,
        replyToUser: message.replyToUser,
        user: message.user,
      },
    }))
  );

  const messageInteractionChannels = computed(() =>
    activeChatId.value == null ? [] : [`chat:${activeChatId.value}:MessageInteractions`]
  );

  const { objects: messageInteractions } = useGraffitiDiscover(
    messageInteractionChannels,
    {
      properties: {
        value: {
          required: ["action", "messageId", "published", "user"],
          properties: {
            action: { type: "string" },
            chatId: { type: "string" },
            clientId: { type: "string" },
            messageId: { type: "string" },
            value: { type: "string" },
            published: { type: "number" },
            user: { type: "string" },
          },
        },
      },
    },
    session
  );

  const pendingMessageInteractions = ref([]);

  const messagesInView = computed(() => {
    const confirmedClientIds = new Set(
      chatMessages.value.map((message) => message.value.clientId).filter(Boolean)
    );

    const pendingMessages = pendingMessagesInActiveChat.value.filter(
      (message) => !confirmedClientIds.has(message.value.clientId)
    );

    return [...chatMessages.value, ...pendingMessages];
  });

  function getMessageId(message) {
    return message.url || message.value.clientId || `${message.value.user}:${message.value.published}`;
  }

  const messageInteractionsInView = computed(() => [
    ...messageInteractions.value,
    ...pendingMessageInteractions.value,
  ]);

  const messageInteractionState = computed(() => {
    const latestLikeByMessageAndUser = {};
    const latestPinByMessage = {};

    for (const obj of messageInteractionsInView.value) {
      const { action, messageId, published, user } = obj.value;
      if (!messageId || !published || !user) continue;

      if (action === "MessageLike") {
        latestLikeByMessageAndUser[messageId] ??= {};
        const existing = latestLikeByMessageAndUser[messageId][user];
        if (!existing || existing.value.published < published) {
          latestLikeByMessageAndUser[messageId][user] = obj;
        }
      }

      if (action === "MessagePin") {
        const existing = latestPinByMessage[messageId];
        if (!existing || existing.value.published < published) {
          latestPinByMessage[messageId] = obj;
        }
      }
    }

    const likesByMessage = {};
    const likedByCurrentUser = {};

    for (const [messageId, latestByUser] of Object.entries(latestLikeByMessageAndUser)) {
      const activeLikes = Object.values(latestByUser).filter(obj => obj.value.value === "Like");
      likesByMessage[messageId] = activeLikes.length;
      likedByCurrentUser[messageId] = activeLikes.some(obj => obj.value.user === session.value?.actor);
    }

    const pinnedByMessage = Object.fromEntries(
      Object.entries(latestPinByMessage).map(([messageId, obj]) => [
        messageId,
        obj.value.value === "Pin",
      ])
    );

    return {
      likesByMessage,
      likedByCurrentUser,
      pinnedByMessage,
    };
  });

  /**
   * Extract unique user IDs from messages
   * Using Set for automatic deduplication
   */
  const usersInView = computed(() => {
    return [...new Set(messagesInView.value.map(m => m.value.user))];
  });

  watch(usersInView, (users) => {
    profileCache.ensureUsers(users);
  }, { immediate: true });

  /**
   * Messages enriched with user profile information
   */
  const messagesWithProfiles = computed(() => {
    const orderedMessages = [...messagesInView.value].sort(
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
      const messageId = getMessageId(msg);

      return {
        ...msg,
        messageId,
        isFirstInChunk: !isSameChunk(previousMessage, msg),
        isLastInChunk: !isSameChunk(msg, nextMessage),
        isFirstInTimeChunk: !isSameTimeChunk(previousMessage, msg),
        profile: profileCache.getProfile(user),
        likeCount: messageInteractionState.value.likesByMessage[messageId] ?? 0,
        isLikedByCurrentUser: !!messageInteractionState.value.likedByCurrentUser[messageId],
        isPinned: !!messageInteractionState.value.pinnedByMessage[messageId],
      };
    });
  });

  async function postMessageInteraction(messageId, action, value) {
    if (!session.value?.actor || !activeChatId.value || !messageId || messageId.startsWith("pending:")) return;
    const clientId = crypto.randomUUID();
    const interaction = {
      action,
      value,
      clientId,
      messageId,
      chatId: activeChatId.value,
      published: Date.now(),
      user: session.value.actor,
    };

    if (action === "MessageLike" || action === "MessagePin") {
      pendingMessageInteractions.value.push({
        url: `pending-interaction:${clientId}`,
        value: interaction,
      });
    }

    try {
      await graffiti.post(
        {
          value: interaction,
          channels: [`chat:${activeChatId.value}:MessageInteractions`],
        },
        session.value
      );
    } catch (err) {
      pendingMessageInteractions.value = pendingMessageInteractions.value.filter(
        pending => pending.value.clientId !== clientId
      );
      console.error("Failed to post message interaction:", err);
    }
  }

  function toggleLike(message) {
    const value = message.isLikedByCurrentUser ? "Unlike" : "Like";
    return postMessageInteraction(message.messageId, "MessageLike", value);
  }

  function togglePin(message) {
    const value = message.isPinned ? "Unpin" : "Pin";
    return postMessageInteraction(message.messageId, "MessagePin", value);
  }

  function replyToMessage(message) {
    if (message.isPending) return;

    chatStore.setReplyTarget({
      id: message.messageId,
      content: message.value.content,
      user: message.value.user,
      username: message.profile?.name,
    });
  }

  function scrollToMessage(messageId) {
    if (!messageId) return;

    const messageElement = [...document.querySelectorAll(".chatflow-message-item")]
      .find(element => element.dataset.messageId === messageId);

    if (!messageElement) return;

    messageElement.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    messageElement.classList.remove("reply-jump-highlight");
    requestAnimationFrame(() => {
      messageElement.classList.add("reply-jump-highlight");
      setTimeout(() => {
        messageElement.classList.remove("reply-jump-highlight");
      }, 1200);
    });
  }

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
    chatMessages,
    (messages) => pendingMessagesStore.removeConfirmedMessages(messages),
    { immediate: true }
  );

  watch(
    messageInteractions,
    (interactions) => {
      const confirmedClientIds = new Set(
        interactions.map(interaction => interaction.value.clientId).filter(Boolean)
      );

      pendingMessageInteractions.value = pendingMessageInteractions.value.filter(
        pending => !confirmedClientIds.has(pending.value.clientId)
      );
    },
    { immediate: true }
  );

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
    isMessagesLoading: computed(() =>
      activeChatId.value != null
        && isMessagesFirstPoll.value
        && messagesInView.value.length === 0
    ),
    session,
    messagesEnd,
    formatMessageTimestamp,
    formatMessageTime,
    toggleLike,
    togglePin,
    replyToMessage,
    scrollToMessage
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

