import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import {
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";

export const useProfileCacheStore = defineStore("profileCache", () => {
  const graffiti = useGraffiti();
  const session = useGraffitiSession();

  const requestedUsers = ref([]);
  const handleCache = ref(new Map());
  const pendingHandles = new Map();
  const avatarCache = ref(new Map());
  const pendingAvatars = new Map();
  const resolvedProfiles = ref({});

  function displayGraffitiHandle(handle) {
    return handle?.endsWith(".graffiti.actor")
      ? handle.slice(0, -".graffiti.actor".length)
      : handle;
  }

  function ensureUsers(users) {
    const knownUsers = new Set(requestedUsers.value);
    let changed = false;

    for (const user of users) {
      if (!user || knownUsers.has(user)) continue;
      knownUsers.add(user);
      changed = true;
    }

    if (changed) {
      requestedUsers.value = [...knownUsers];
    }
  }

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

  watch(requestedUsers, async (users) => {
    await Promise.all(users.map(resolveHandle));
  }, { immediate: true });

  const profileChannels = computed(() =>
    requestedUsers.value.map(user => `user:${user}:Activities`)
  );

  const { objects: profileObjects } = useGraffitiDiscover(
    profileChannels,
    {
      properties: {
        value: {
          required: ["action", "published", "user"],
          properties: {
            action: { type: "string" },
            published: { type: "number" },
            user: { type: "string" },
            name: { type: "string" },
            content: { type: "string" },
            url: { type: "string" },
          },
        },
      },
    },
    session,
  );

  const rawProfileMap = computed(() => {
    const profiles = {};

    for (const user of requestedUsers.value) {
      profiles[user] = {
        name: handleCache.value.get(user) ?? user,
        bio: null,
        avatarRawUrl: null,
        avatarUrl: null,
        avatarIsLoading: false,
        latestPublished: 0,
        _ts: {},
      };
    }

    for (const obj of profileObjects.value) {
      const { user, action, name, content, url, published } = obj.value;
      if (!user) continue;

      if (!profiles[user]) {
        profiles[user] = {
          name: handleCache.value.get(user) ?? user,
          bio: null,
          avatarRawUrl: null,
          avatarUrl: null,
          avatarIsLoading: false,
          latestPublished: 0,
          _ts: {},
        };
      }

      const profile = profiles[user];
      profile.latestPublished = Math.max(profile.latestPublished, published ?? 0);

      if (action === "ProfileName" && (!profile._ts.name || profile._ts.name < published)) {
        profile.name = name;
        profile._ts.name = published;
      }

      if (action === "ProfileBio" && (!profile._ts.bio || profile._ts.bio < published)) {
        profile.bio = content;
        profile._ts.bio = published;
      }

      if (action === "ProfileImage" && (!profile._ts.avatarUrl || profile._ts.avatarUrl < published)) {
        profile.avatarRawUrl = url;
        profile.avatarUrl = url;
        profile._ts.avatarUrl = published;
      }
    }

    return profiles;
  });

  async function resolveAvatar(url) {
    if (!url) return null;

    const cache = avatarCache.value;
    if (cache.has(url)) return cache.get(url);
    if (pendingAvatars.has(url)) return pendingAvatars.get(url);

    const pending = graffiti.getMedia(url, session.value)
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob.data);
        avatarCache.value = new Map(avatarCache.value).set(url, objectUrl);
        return objectUrl;
      })
      .catch((err) => {
        console.error("Failed to load avatar:", err);
        avatarCache.value = new Map(avatarCache.value).set(url, null);
        return null;
      })
      .finally(() => {
        pendingAvatars.delete(url);
      });

    pendingAvatars.set(url, pending);
    return pending;
  }

  watch(rawProfileMap, async (profiles) => {
    const resolved = {};

    for (const [user, profile] of Object.entries(profiles)) {
      let avatar = profile.avatarUrl;
      const needsResolvedAvatar = avatar?.startsWith("graffiti:");

      if (needsResolvedAvatar && !avatarCache.value.has(avatar)) {
        resolved[user] = { ...profile, avatarUrl: null, avatarIsLoading: true };
        resolvedProfiles.value = { ...resolvedProfiles.value, ...resolved };
        avatar = await resolveAvatar(avatar);
      } else if (needsResolvedAvatar) {
        avatar = avatarCache.value.get(avatar);
      }

      resolved[user] = {
        ...profile,
        avatarUrl: avatar,
        avatarIsLoading: false,
      };
    }

    resolvedProfiles.value = {
      ...resolvedProfiles.value,
      ...resolved,
    };
  }, { immediate: true });

  function getProfile(user) {
    return resolvedProfiles.value[user]
      ?? rawProfileMap.value[user]
      ?? {
        name: handleCache.value.get(user) ?? user,
        bio: null,
        avatarRawUrl: null,
        avatarUrl: null,
        avatarIsLoading: false,
        latestPublished: 0,
      };
  }

  return {
    ensureUsers,
    getProfile,
    profilesByUser: resolvedProfiles,
  };
});
