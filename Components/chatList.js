import { ref, watchEffect, watch, computed} from "vue";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import loadChatListItem from "./chatListItem.js";

function setup(props, { emit }) {
    const graffiti = useGraffiti();
    const session = useGraffitiSession();

    const channels = computed(() => {
      return session.value ? [`user:${session.value.actor}:Membership`] : [];
    });

    const {objects: activities} =  useGraffitiDiscover(
      channels,
      {
        properties:{
          value: {
            required: ['action', 'value', 'chatId', 'chatName', 'published'],
            properties: {
              action: { type: 'string' },
              value: { type: 'string' },
              chatId: { type: 'string' },
              chatName: { type: 'string' },
              published: { type: 'number' },
            }
          }
        },
      },
      session,
    )
    const chatList = computed(() => {
      return Object.values(
        activities.value.reduce((acc, obj) => {
          const {chatId, published } = obj.value;
          if (!acc[chatId] || acc[chatId].value.published < published) {
            acc[chatId] = obj;
          }
          return acc;
        }, {})
      );
    });

    
    const chats = ref([{chatName:'test1', chatId:1}, {chatName:'test2', chatId:2}]);
    function emitUpdateChat(chatId, chatName) {
      emit("update-active-chat", chatId, chatName);
    }

    return { chats, 
      emitUpdateChat, 
      activities,
      chatList,
    };
}

export default async () => ({
    setup,
    components:{
      ChatListItem: await loadChatListItem()
    },
    emits: ['updateActiveChat'],
    template: await fetch(new URL("./chatList.html", import.meta.url)).then((r) =>
        r.text(),
    ),
});
