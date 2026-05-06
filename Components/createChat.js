import { ref } from "vue";
import { storeToRefs } from "pinia"
import { useChatStore } from "../stores/chat.js";
import { delay } from "../index.js";

function setup() {
  const chatStore = useChatStore();
  const {
    newChatName,
    joinChatId,
    isCreating,
    createError,
    createSuccess,
    isJoining,
    joinError,
    joinSuccess,
  } = storeToRefs(chatStore);

  const activeTab = ref('newchat');

  /**
   * Close the chat creation drawer
   */
  function closeDrawer() {
    const drawer = document.querySelector("#newChatMenu");
    if (drawer) drawer.open = false;
  }

  /**
   * Handle new chat creation
   * Shows drawer on error, closes on success
   */
  async function handleCreateChat() {
    const success = await chatStore.createNewChat();
    if (success) {
      await delay();
      closeDrawer();
    }
  }

  /**
   * Handle join existing chat
   * Shows drawer on error, closes on success
   */
  async function handleJoinChat() {
    const success = await chatStore.joinChat();
    if (success) {
      await delay();
      closeDrawer();
    }
  }

  return {
    newChatName,
    activeTab,
    joinChatId,
    isCreating,
    createError,
    createSuccess,
    isJoining,
    joinError,
    joinSuccess,
    handleCreateChat,
    handleJoinChat,
  };
}

export default async () => ({
  setup,
  template: await fetch(new URL("./createChat.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
