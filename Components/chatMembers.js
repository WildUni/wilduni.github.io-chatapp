import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import {
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import { useChatStore } from "../stores/chat.js";

function setup() {
  const graffiti = useGraffiti();
  const session = useGraffitiSession();
  const chatStore = useChatStore();
  const { activeChatId, activeChatRootId } = storeToRefs(chatStore);

  function displayGraffitiHandle(handle) {
    return handle?.endsWith(".graffiti.actor")
      ? handle.slice(0, -".graffiti.actor".length)
      : handle;
  }

  const membershipChannels = computed(() => {
    const membershipChatId = activeChatRootId.value ?? activeChatId.value;
    return session.value && membershipChatId
      ? [`chat:${membershipChatId}:Membership`]
      : [];
  });

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

      if (!acc[user] || acc[user].value.published < published) {
        acc[user] = obj;
      }

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
      .catch((err) => {
        console.error("Failed to resolve member handle:", err);
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
      console.error("Failed to load member avatar:", err);
      cache.set(url, null);
      return null;
    }
  }

  const resolvedProfileMap = ref({});

  watch(profileMap, async (profiles) => {
    const resolved = {};

    for (const [user, profile] of Object.entries(profiles)) {
      let avatar = profile.avatarUrl;

      if (avatar?.startsWith("graffiti:")) {
        avatar = await resolveAvatar(avatar);
      }

      resolved[user] = { ...profile, avatarUrl: avatar };
    }

    resolvedProfileMap.value = resolved;
  }, { immediate: true });

  const members = computed(() =>
    memberActors.value.map(user => ({
      user,
      profile: resolvedProfileMap.value[user] ?? {
        name: handleCache.value.get(user) ?? user,
        avatarUrl: null,
      },
    })),
  );

  return {
    activeChatId,
    members,
  };
}

export default async () => ({
  setup,
  template: await fetch(new URL("./chatMembers.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
