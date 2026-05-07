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
    const {chatList, chatImageUrls, hasUnreadByRootChatId} = storeToRefs(chatStore)

    
    function emitUpdateChat(chatId, chatName, rootId, parentId) {
      emit("update-active-chat", chatId, chatName, rootId, parentId);
    }

    return {
      emitUpdateChat, 
      chatList,
      chatImageUrls,
      hasUnreadByRootChatId,
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
