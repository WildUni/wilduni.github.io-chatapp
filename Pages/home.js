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
import { delay } from "../index.js";


function setup() {
  const route = useRoute()
  const router = useRouter()
  const session = useGraffitiSession();

  const chatStore = useChatStore();
  const {activeChatId, 
    activeChatName, 
    newChatName, 
    chatList, 
    activeChatRootId,
    isLeaving,
    leaveSuccess} = storeToRefs(chatStore)
  const userStore = useUserStore();
  const {profileName, profileImageUrl, hasProfileName} = storeToRefs(userStore);

  const firstName = ref("");

  /**
   * Set active chat and update route
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
   * Complete user onboarding by setting profile name
   */
  async function completeOnboarding() {
    if (!firstName.value.trim()) return;
    await userStore.updateProfileName(firstName.value);
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
   * - Update active chat name and root ID from chat list data
   */
  watch(
    () => [route.params.chatId, chatList.value],
    ([chatId, chats]) => {
      // Update active chat from route params
      activeChatId.value = chatId || null;

      // Find and extract info from chat list
      if (chats && activeChatId.value) {
        const activeChat = chats.find(
          chat => chat.value.chatId === activeChatId.value
        );

        activeChatName.value = activeChat?.value.chatName ?? null;
        activeChatRootId.value = activeChat?.value.rootChatId ?? activeChatId.value;
      } else {
        activeChatName.value = null;
        activeChatRootId.value = null;
      }
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
    profileName, 
    profileImageUrl,
    leaveActiveChat,
    firstName,
    hasProfileName,
    completeOnboarding,
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
