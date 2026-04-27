import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import loadChatList from "../Components/chatList.js";
import loadChatTree from "../Components/chatTree.js";
import loadChatInput from "../Components/chatInput.js";
import loadChatFlow from "../Components/chatFlow.js";


import { storeToRefs } from "pinia"
import { useActiveChatStore } from "../stores/activeChat.js";

function setup() {
  const route = useRoute()
  const router = useRouter()

  const chats = ref([1, 2])

  const activeChat = useActiveChatStore()
  const { activeChatId } = storeToRefs(activeChat)

  function updateChatUrl(chatId) {
    router.push({ name: "chat", params: { chatId } })
  }

  watch(
    () => route.params.chatId,
    (chatId) => {
      activeChat.setActiveChat(chatId ? Number(chatId) : null)
    },
    { immediate: true }
  )

  return {
    chats,
    updateChatUrl,
    activeChatId
  }
}

export default async () => ({
  setup,
  components: {
    ChatList: await loadChatList(),
    ChatTree: await loadChatTree(),
    ChatInput: await loadChatInput(),
    ChatFlow: await loadChatFlow(),
  },
  template: await fetch(new URL("./home.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
