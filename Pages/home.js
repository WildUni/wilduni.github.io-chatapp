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
  const { newChatName } = storeToRefs(newChat)

  function updateChatUrl(chatId) {
    // activeChat.setActiveChat(chatId);
    router.push({ name: "chat", params: { chatId } })
    console.log(activeChat.activeChatId)
  }

  function setActiveChat(chatId, chatName){
    activeChat.activeChatId = chatId;
    activeChat.activeChatName = chatName;
    console.log(activeChat.activeChatId)
    console.log(activeChat.activeChatName)
    router.push({ name: "chat", params: { chatId } })
    
  }

    // router.push({ name: "chat", params: { chatId:1 } })

    // router.push({ name: "chat", params: { chatId:3 } })


  function clearActive(){
    // activeChat.setActiveChat(null);
    console.log(activeChat.activeChatId)
  }
  // watch(
  //   () => route.params.chatId,
  //   (chatId) => {
  //     activeChat.setActiveChat(chatId ? Number(chatId) : null)
  //   },
  //   { immediate: true }
  // )

  function printActive(){
    console.log(session.value.actor)
  }
  // console.log(activeChat)
  // console.log(newChat.setNewChatName)

  return {
    chats,
    setActiveChat,
    activeChatId,
    clearActive,
    printActive,
    createNewChat: newChat.createNewChat,
    newChatName,
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
