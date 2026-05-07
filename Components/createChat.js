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

  /**
   * Close a chat action drawer
   */
  function closeDrawer(drawerId) {
    const drawer = document.querySelector(drawerId);
    if (drawer) drawer.open = false;
  }

  /**
   * Handle new chat creation
   * Shows create drawer on error, closes on success
   */
  async function handleCreateChat() {
    const success = await chatStore.createNewChat();
    if (success) {
      await delay();
      closeDrawer("#createChatMenu");
    }
  }

  /**
   * Handle join existing chat
   * Shows join drawer on error, closes on success
   */
  async function handleJoinChat() {
    const success = await chatStore.joinChat();
    if (success) {
      await delay();
      closeDrawer("#joinChatMenu");
    }
  }

  return {
    newChatName,
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
