import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import {
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import { useChatStore } from "../stores/chat.js";

function setup() {
  const route = useRoute();
  const router = useRouter();
  const graffiti = useGraffiti();
  const session = useGraffitiSession();
  const chatStore = useChatStore();
  const { chatList, isJoining, joinError } = storeToRefs(chatStore);
  const chatImageUrl = ref(null);
  let currentChatImageObjectUrl = null;

  const chatId = computed(() => route.params.chatId || null);

  function displayGraffitiHandle(handle) {
    return handle?.endsWith(".graffiti.actor")
      ? handle.slice(0, -".graffiti.actor".length)
      : handle;
  }

  const chatActivityChannels = computed(() =>
    session.value && chatId.value ? [`chat:${chatId.value}:Activities`] : []
  );

  const { objects: chatActivities } = useGraffitiDiscover(
    chatActivityChannels,
    {
      properties: {
        value: {
          required: ["action", "published"],
          properties: {
            action: { type: "string" },
            chatId: { type: "string" },
            chatName: { type: "string" },
            name: { type: "string" },
            url: { type: "string" },
            published: { type: "number" },
          },
        },
      },
    },
    session,
    true,
  );

  const latestChatActivity = computed(() =>
    chatActivities.value
      .filter(obj => ["Create", "Rename", "Delete"].includes(obj.value.action))
      .reduce((latest, obj) => {
        if (!latest || latest.value.published < obj.value.published) return obj;
        return latest;
      }, null)
  );

  const chatExists = computed(() =>
    latestChatActivity.value != null && latestChatActivity.value.value.action !== "Delete"
  );

  const chatImageRawUrl = computed(() =>
    chatActivities.value.reduce((latest, obj) => {
      if (
        obj.value.action !== "ChatImage" ||
        obj.value.chatId !== chatId.value ||
        !obj.value.url
      ) {
        return latest;
      }

      if (!latest || latest.value.published < obj.value.published) return obj;
      return latest;
    }, null)?.value.url ?? null
  );

  function cleanupChatImage() {
    if (currentChatImageObjectUrl) {
      URL.revokeObjectURL(currentChatImageObjectUrl);
      currentChatImageObjectUrl = null;
    }
  }

  watch(
    chatImageRawUrl,
    async (url) => {
      if (!url) {
        cleanupChatImage();
        chatImageUrl.value = null;
        return;
      }

      try {
        cleanupChatImage();
        const blob = await graffiti.getMedia(url, session.value);
        currentChatImageObjectUrl = URL.createObjectURL(blob.data);
        chatImageUrl.value = currentChatImageObjectUrl;
      } catch (err) {
        console.error("Failed to load join chat image:", err);
        chatImageUrl.value = null;
      }
    },
    { immediate: true }
  );

  const membershipChannels = computed(() =>
    session.value && chatId.value ? [`chat:${chatId.value}:Membership`] : []
  );

  const { objects: membershipActivities } = useGraffitiDiscover(
    membershipChannels,
    {
      properties: {
        value: {
          required: ["action", "value", "user", "published"],
          properties: {
            action: { const: "Membership" },
            value: { type: "string" },
            user: { type: "string" },
            published: { type: "number" },
          },
        },
      },
    },
    session,
    true,
  );

  const memberActors = computed(() => {
    const latestByUser = membershipActivities.value.reduce((acc, obj) => {
      const { user, published } = obj.value;
      if (!user || !published) return acc;

      if (!acc[user] || acc[user].value.published < published) acc[user] = obj;
      return acc;
    }, {});

    return Object.values(latestByUser)
      .filter(obj => obj.value.value === "Join")
      .sort((a, b) => a.value.published - b.value.published)
      .map(obj => obj.value.user);
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
      .catch(() => {
        handleCache.value = new Map(handleCache.value).set(user, user);
        return user;
      })
      .finally(() => {
        pendingHandles.delete(user);
      });

    pendingHandles.set(user, pending);
    return pending;
  }

  watch(memberActors, async (users) => {
    await Promise.all(users.map(resolveHandle));
  }, { immediate: true });

  const { objects: profileObjects } = useGraffitiDiscover(
    () => memberActors.value.map(user => `user:${user}:Activities`),
    {
      properties: {
        value: {
          required: ["action", "published", "user"],
          properties: {
            action: { type: "string" },
            published: { type: "number" },
            user: { type: "string" },
            name: { type: "string" },
            url: { type: "string" },
          },
        },
      },
    },
    session,
  );

  const profileMap = computed(() => {
    const profiles = {};

    for (const user of memberActors.value) {
      profiles[user] = {
        name: handleCache.value.get(user) ?? user,
        avatarUrl: null,
        _ts: {},
      };
    }

    for (const obj of profileObjects.value) {
      const { user, action, name, url, published } = obj.value;
      if (!user) continue;

      if (!profiles[user]) {
        profiles[user] = {
          name: handleCache.value.get(user) ?? user,
          avatarUrl: null,
          _ts: {},
        };
      }

      if (action === "ProfileName" && (!profiles[user]._ts.name || profiles[user]._ts.name < published)) {
        profiles[user].name = name;
        profiles[user]._ts.name = published;
      }

      if (action === "ProfileImage" && (!profiles[user]._ts.avatarUrl || profiles[user]._ts.avatarUrl < published)) {
        profiles[user].avatarUrl = url;
        profiles[user]._ts.avatarUrl = published;
      }
    }

    return profiles;
  });

  function getProfileName(user) {
    return profileMap.value[user]?.name || handleCache.value.get(user) || user;
  }

  const automaticChatName = computed(() => {
    const actors = memberActors.value;
    const ownActor = session.value?.actor;

    if (actors.length === 2 && ownActor) {
      const otherActor = actors.find(user => user !== ownActor);
      if (otherActor) return getProfileName(otherActor);
    }

    if (actors.length > 0) return actors.map(getProfileName).join(", ");
    return ownActor ? (handleCache.value.get(ownActor) ?? ownActor) : "Untitled chat";
  });

  const chatName = computed(() =>
    latestChatActivity.value?.value.chatName ||
    latestChatActivity.value?.value.name ||
    automaticChatName.value
  );

  const avatarCache = ref(new Map());

  async function resolveAvatar(url) {
    if (!url) return null;

    const cache = avatarCache.value;
    if (cache.has(url)) return cache.get(url);

    try {
      const blob = await graffiti.getMedia(url, session.value);
      const objectUrl = URL.createObjectURL(blob.data);
      cache.set(url, objectUrl);
      return objectUrl;
    } catch (err) {
      console.error("Failed to load join member avatar:", err);
      cache.set(url, null);
      return null;
    }
  }

  const previewMembers = ref([]);

  watch([profileMap, memberActors, handleCache], async ([profiles]) => {
    const resolved = [];

    for (const user of memberActors.value.slice(0, 4)) {
      const profile = profiles[user] ?? {
        name: handleCache.value.get(user) ?? user,
        avatarUrl: null,
      };
      let avatar = profile.avatarUrl;

      if (avatar?.startsWith("graffiti:")) avatar = await resolveAvatar(avatar);

      resolved.push({
        user,
        profile: { ...profile, avatarUrl: avatar },
      });
    }

    previewMembers.value = resolved;
  }, { immediate: true });

  const isAlreadyMember = computed(() =>
    chatList.value.some(chat => chat.value.chatId === chatId.value && chat.value.value === "Join") ||
    memberActors.value.includes(session.value?.actor)
  );

  watch(
    isAlreadyMember,
    (alreadyMember) => {
      if (alreadyMember && chatId.value) {
        router.replace({ name: "chat", params: { chatId: chatId.value } });
      }
    },
    { immediate: true }
  );

  async function confirmJoin() {
    if (!chatId.value || isJoining.value) return;

    chatStore.joinChatId = chatId.value;
    const success = await chatStore.joinChat();

    if (success) {
      router.replace({ name: "chat", params: { chatId: chatId.value } });
    }
  }

  function goHome() {
    router.push({ name: "home" });
  }

  return {
    chatId,
    chatName,
    chatExists,
    chatImageUrl,
    previewMembers,
    isJoining,
    joinError,
    confirmJoin,
    goHome,
  };
}

export default async () => ({
  setup,
  template: await fetch(new URL("./join.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
