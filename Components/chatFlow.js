import { useChatStore } from "../stores/chat.js";
import {
  useGraffitiSession,
  useGraffitiDiscover,
  useGraffiti
} from "@graffiti-garden/wrapper-vue";

import loadMessage from "./message.js";
import { storeToRefs } from "pinia"
import { computed, ref, watch } from 'vue'

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
  const messagesWithProfiles = computed(() =>
    chatMessages.value.map(msg => ({
      ...msg,
      profile: resolvedProfileMap.value[msg.value.user] ?? {
        name: handleCache.value.get(msg.value.user) ?? msg.value.user,
        avatarUrl: null
      }
    }))
  );

  return {
    chatMessages,
    messagesWithProfiles,
    activeChatId
  };
}

export default async () => ({
  props: ["chatId"],
  setup,
  components: {
    Message: await loadMessage(),
  },
  template: await fetch(new URL("./chatFlow.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});

