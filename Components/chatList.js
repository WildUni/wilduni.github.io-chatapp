import { ref, watchEffect, watch, computed} from "vue";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import loadChatListItem from "./chatListItem.js";
import { useChatStore } from "../stores/chat.js";
import { storeToRefs } from "pinia"

function setup(props, { emit }) {
    const graffiti = useGraffiti();
    const session = useGraffitiSession();
    const chatStore = useChatStore()
    const {chatList} = storeToRefs(chatStore)
    // const channels = computed(() => {
    //   return session.value ? [`user:${session.value.actor}:Membership`] : [];
    // });

    // const {objects: activities} =  useGraffitiDiscover(
    //   channels,
    //   {
    //     properties:{
    //       value: {
    //         required: ['action', 'value', 'chatId', 'chatName', 'published'],
    //         properties: {
    //           action: { type: 'string' },
    //           value: { type: 'string' },
    //           chatId: { type: 'string' },
    //           chatName: { type: 'string' },
    //           published: { type: 'number' },
    //         }
    //       }
    //     },
    //   },
    //   session,
    //   true
    // )
    // const chatList = computed(() => {
    //   return Object.values(
    //     activities.value.reduce((acc, obj) => {
    //       const {chatId, published } = obj.value;
    //       if (!acc[chatId] || acc[chatId].value.published < published) {
    //         acc[chatId] = obj;
    //       }
    //       return acc;
    //     }, {})
    //   );
    // });

    
    function emitUpdateChat(chatId, chatName) {
      emit("update-active-chat", chatId, chatName);
    }

    return {
      emitUpdateChat, 
      chatList,
    };
}

export default async () => ({
    setup,
    components:{
      ChatListItem: await loadChatListItem()
    },
    emits: ["update-active-chat"],
    template: await fetch(new URL("./chatList.html", import.meta.url)).then((r) =>
        r.text(),
    ),
});
