import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import loadChatList from "../Components/chatList.js";
import loadChatTree from "../Components/chatTree.js";
import loadChatInput from "../Components/chatInput.js";
import loadChatFlow from "../Components/chatFlow.js";


import { storeToRefs } from "pinia"
import { useActiveChatStore } from "../stores/activeChat.js";
import { useNewChatStore } from "../stores/newChat.js";

import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";


function setup() {
  const route = useRoute()
  const router = useRouter()
  const session = useGraffitiSession();
  

  const chats = ref([1, 2])

  const activeChat = useActiveChatStore();
  const { activeChatId } = storeToRefs(activeChat)

  const newChat = useNewChatStore();

  function updateChatUrl(chatId) {
    activeChat.setActiveChat(chatId);
    router.push({ name: "chat", params: { chatId } })
    console.log(activeChat.activeChatId)
  }

  function clearActive(){
    activeChat.setActiveChat(null);
    console.log(activeChat.activeChatId)
  }
  watch(
    () => route.params.chatId,
    (chatId) => {
      activeChat.setActiveChat(chatId ? Number(chatId) : null)
    },
    { immediate: true }
  )

  function printActive(){
    console.log(session.value.actor)
  }
  console.log(activeChat)
  console.log(newChat.setNewChatName)

  return {
    chats,
    updateChatUrl,
    activeChatId,
    clearActive,
    printActive,
    createNewChat: newChat.createNewChat,
    newChatName: newChat.newChatName,
    setNewChatName: newChat.setNewChatName,
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
