import { ref } from "vue";
import loadChatListItem from "./chatListItem.js";
import { useChatStore } from "../stores/chat.js";
import { storeToRefs } from "pinia"

function setup(props, { emit }) {
    const chatStore = useChatStore()
    const now = ref(Date.now());
    const {
      chatList,
      chatImageUrls,
      chatImageLoadingByChat,
      chatPreviewMembersByChatId,
      hasUnreadByRootChatId,
      latestMessageByRootChatId,
      areChatMessagesReady,
      isChatListLoading
    } = storeToRefs(chatStore)

    function emitUpdateChat(chatId, chatName, rootId, parentId) {
      emit("update-active-chat", chatId, chatName, rootId, parentId);
    }

    return {
      emitUpdateChat, 
      chatList,
      chatImageUrls,
      chatImageLoadingByChat,
      chatPreviewMembersByChatId,
      hasUnreadByRootChatId,
      latestMessageByRootChatId,
      areChatMessagesReady,
      isChatListLoading,
      now,
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
