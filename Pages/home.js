import { watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import loadChatList from "../Components/chatList.js";
import loadChatTree from "../Components/chatTree.js";
import loadChatInput from "../Components/chatInput.js";
import loadChatFlow from "../Components/chatFlow.js";
import loadProfile from "../Components/profile.js"
import loadCreateChatButton from '../Components/createChat.js'

import { storeToRefs } from "pinia"
import { useChatStore } from "../stores/chat.js";

import { delay } from "../index.js";


function setup() {
  const route = useRoute()
  const router = useRouter()
  const chatStore = useChatStore();
  const {activeChatId, 
    activeChatName, 
    newChatName, 
    chatList, 
    activeChatRootId,
    isLeaving,
    leaveSuccess} = storeToRefs(chatStore)

  /**
   * Set active chat and update route
   * Chat-list selections pass their own chat ID as rootId.
   * Branch-tree selections pass the branch ID as chatId and keep the original rootId.
   */
  function setActiveChat(chatId, chatName, rootId) {
    activeChatId.value = chatId;
    activeChatName.value = chatName;
    activeChatRootId.value = rootId ?? chatId;
    router.push({ name: "chat", params: { chatId } });
  }

  /**
   * Clear active chat selection
   */
  function clearActive() {
    setActiveChat(null, null, null);
  }

  /**
   * Leave active chat and navigate home
   */
  async function leaveActiveChat(chatId) {
    await chatStore.leaveChat(chatId);
    await delay();
    router.push({ name: "home" });
  }

  /**
   * Combined watch: Handle route changes and update chat info from list
   * - Update active chat ID when route changes (page refresh support)
   * - Use chat list data for root chats
   * - Preserve the known root ID for branch chats, which are not in chatList
   */
  watch(
    () => [route.params.chatId, chatList.value],
    ([chatId, chats]) => {
      const routeChatId = chatId || null;
      const knownActiveName = activeChatName.value;
      const knownRootId = activeChatRootId.value;

      // Update active chat from route params
      activeChatId.value = routeChatId;

      if (!routeChatId) {
        activeChatName.value = null;
        activeChatRootId.value = null;
        return;
      }

      // Find and extract info from chat list
      if (chats) {
        const activeChat = chats.find(
          chat => chat.value.chatId === routeChatId
        );

        if (activeChat) {
          activeChatName.value = activeChat.value.chatName;
          activeChatRootId.value = activeChat.value.rootChatId ?? activeChat.value.chatId;
          return;
        }
      }

      activeChatName.value = knownActiveName;
      activeChatRootId.value = knownRootId ?? routeChatId;
    },
    { immediate: true }
  );

  return {
    setActiveChat,
    clearActive,
    activeChatId,
    activeChatName,
    activeChatRootId,
    createNewChat: chatStore.createNewChat,
    newChatName,
    leaveActiveChat,
    isLeaving,
    leaveSuccess
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
