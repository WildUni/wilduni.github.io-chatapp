import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import loadChatList from "../Components/chatList.js";
import loadChatTree from "../Components/chatTree.js";
import loadChatInput from "../Components/chatInput.js";
import loadChatFlow from "../Components/chatFlow.js";
import loadProfile from "../Components/profile.js"
import loadCreateChatButton from '../Components/createChat.js'

import { storeToRefs } from "pinia"
import { useChatStore } from "../stores/chat.js";
import { useUserStore } from "../stores/user.js";

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

  const chatStore = useChatStore();
  const {activeChatId, activeChatName, newChatName, chatList, activeChatRootId} = storeToRefs(chatStore)
  const userStore = useUserStore();
  const {profileName, profileImageUrl} = storeToRefs(userStore);

  function setActiveChat(chatId, chatName, rootId){
    activeChatId.value = chatId;
    activeChatName.value = chatName;
    activeChatRootId.value = rootId ?? chatId;
    router.push({ name: "chat", params: { chatId } })
    console.log(activeChatRootId.value)
    
  }


  //handles page refresh, extracting id from url + name from id
  watch(
    () => route.params.chatId,
    (chatId) => {
      activeChatId.value = chatId || null;
    },
    { immediate: true }
  );
  watch(
    chatList,
    (chats) => {
      const activeChat = chats.find(
        chat => chat.value.chatId === activeChatId.value
      );

      activeChatName.value = activeChat?.value.chatName ?? null;
      activeChatRootId.value = activeChat?.value.rootChatId ?? activeChatId.value;
    },
    { immediate: true }
  );
  

  function clearActive(){
    activeChat.setActiveChat(null, null);
    console.log(activeChatId.value)
  }


  return {
    setActiveChat,
    activeChatId,
    activeChatName,
    activeChatRootId,
    clearActive,
    createNewChat: chatStore.createNewChat,
    newChatName,
    profileName, 
    profileImageUrl,
  }
}

export default async () => ({
  setup,
  components: {
    ChatList: await loadChatList(),
    ChatTree: await loadChatTree(),
    ChatInput: await loadChatInput(),
    ChatFlow: await loadChatFlow(),
    Profile: await loadProfile(),
    CreateChatButton: await loadCreateChatButton(),
  },
  template: await fetch(new URL("./home.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
