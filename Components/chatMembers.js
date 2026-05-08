import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import {
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import { useChatStore } from "../stores/chat.js";
import { useProfileCacheStore } from "../stores/profileCache.js";

function setup() {
  const session = useGraffitiSession();
  const chatStore = useChatStore();
  const profileCache = useProfileCacheStore();
  const { activeChatId, activeChatRootId } = storeToRefs(chatStore);

  const shareChatId = computed(() => activeChatRootId.value ?? activeChatId.value);

  const joinChatLink = computed(() => {
    if (!shareChatId.value) return "";

    const { origin, pathname, search } = window.location;
    return `${origin}${pathname}${search}#/join/${encodeURIComponent(shareChatId.value)}`;
  });

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
    if (membershipActivities.value.every(obj => obj.value.value === "Join")) {
      const users = membershipActivities.value
        .filter(obj => obj.value.user && obj.value.published);
      const uniqueUsers = new Set(users.map(obj => obj.value.user));

      if (uniqueUsers.size === users.length) {
        return users
          .sort((a, b) => a.value.published - b.value.published)
          .map(obj => obj.value.user);
      }
    }

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

  watch(memberActors, (users) => {
    profileCache.ensureUsers(users);
  }, { immediate: true });

  const members = computed(() =>
    memberActors.value.map(user => ({
      user,
      profile: profileCache.getProfile(user),
    })),
  );

  return {
    activeChatId,
    shareChatId,
    joinChatLink,
    members,
  };
}

export default async () => ({
  setup,
  template: await fetch(new URL("./chatMembers.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
