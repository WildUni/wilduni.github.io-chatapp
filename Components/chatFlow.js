import { useChatStore } from "../stores/chat.js";
import {
  useGraffitiSession,
  useGraffitiDiscover,
  useGraffiti
} from "@graffiti-garden/wrapper-vue";

import loadMessage from "./message.js";
import { storeToRefs } from "pinia"
import {computed, ref, watch } from 'vue'

function setup() {
    const graffiti = useGraffiti();
    const session = useGraffitiSession();
    const chatStore = useChatStore();
    const {activeChatId} = storeToRefs(chatStore);

    function chatMessageChannels() {
      return activeChatId.value == null ? [] : [`chat:${activeChatId.value}:Messages`];
    }
    
    const { objects: chatMessages } = useGraffitiDiscover(
      chatMessageChannels,
      {
        properties: {
          value: {
            required: ["action", "content", "published", 'user'],
            properties: {
              action: { const: "Message" },
              content: { type: "string"},
              published: { type: "number" },
              user: { type: "string" }
            },
          },
        },
      },
      session
    );

    const usersInView = computed(() => {
      return [...new Set(chatMessages.value.map(m => m.value.user))];
    });


    const { objects: profileObjects } = useGraffitiDiscover(
      () => usersInView.value.map(u => `user:${u}:Activities`),
      {
        properties: {
          value: {
            required: ["action", "published", 'user'],
            properties: {
              action: { type: "string" },
              published: { type: "number" },

              // optional fields depending on action
              name: { type: "string" },
              content: { type: "string" },
              url: { type: "string" }
            }
          }
        }
      },
      session
    );
    

    //reduces user
    const profileMap = computed(() => {
      const acc = {};

      for (const obj of profileObjects.value) {
        const { user, action, name, url, published } = obj.value;
        if (!user) continue;

        // initialize per-user bucket
        if (!acc[user]) {
          acc[user] = {
            name: null,
            avatarUrl: null,
            _ts: {}
          };
        }

        // reduce WITHIN that user only
        if (action === "ProfileName") {
          if (!acc[user]._ts.name || acc[user]._ts.name < published) {
            acc[user].name = name;
            acc[user]._ts.name = published;
          }
        }

        if (action === "ProfileImage") {
          if (!acc[user]._ts.avatarUrl || acc[user]._ts.avatarUrl < published) {
            acc[user].avatarUrl = url;
            acc[user]._ts.avatarUrl = published;
          }
        }
      }
      
      return acc;
    });
    const avatarCache = ref({}); // { [graffitiUrl]: objectURL }

    async function resolveAvatar(url) {
      if (!url) return null;

      // already resolved
      if (avatarCache.value[url]) return avatarCache.value[url];

      try {
        const blob = await graffiti.getMedia(url, session.value);
        const objectUrl = URL.createObjectURL(blob.data);

        avatarCache.value[url] = objectUrl;
        return objectUrl;
      } catch (e) {
        console.error("Failed to load avatar:", url, e);
        return null;
      }
    }

    const resolvedProfileMap = ref({});

    watch(profileMap, async (map) => {
      const newMap = {};

      for (const user in map) {
        const profile = map[user];

        let avatar = profile.avatarUrl;

        if (avatar?.startsWith("graffiti:")) {
          avatar = await resolveAvatar(avatar);
        }

        newMap[user] = {
          ...profile,
          avatarUrl: avatar
        };
      }

      resolvedProfileMap.value = newMap;
    }, { immediate: true });

  
    const messagesWithProfiles = computed(() =>
      chatMessages.value.map(msg => ({
        ...msg,
        profile: resolvedProfileMap.value[msg.value.user]
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
  components:{
    Message: await loadMessage(),
  },
  template: await fetch(new URL("./chatFlow.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});

