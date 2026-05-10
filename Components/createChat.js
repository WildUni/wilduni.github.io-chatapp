import { ref } from "vue";
import { storeToRefs } from "pinia"
import { useChatStore } from "../stores/chat.js";

function delay(ms = 1000) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

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
  const showCreateChatPanel = ref(false);
  const showJoinChatPanel = ref(false);

  function closeCreateChatPanel() {
    showCreateChatPanel.value = false;
  }

  function closeJoinChatPanel() {
    showJoinChatPanel.value = false;
  }

  /**
   * Handle new chat creation.
   * Keeps the panel open on error and closes after success.
   */
  async function handleCreateChat() {
    const success = await chatStore.createNewChat();
    if (success) {
      await delay();
      closeCreateChatPanel();
    }
  }

  /**
   * Handle joining an existing chat.
   * Keeps the panel open on error and closes after success.
   */
  async function handleJoinChat() {
    const success = await chatStore.joinChat();
    if (success) {
      await delay();
      closeJoinChatPanel();
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
    showCreateChatPanel,
    showJoinChatPanel,
    closeCreateChatPanel,
    closeJoinChatPanel,
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
