import { computed, ref } from "vue";
import { defineStore } from "pinia";

export const usePendingMessagesStore = defineStore("pendingMessages", () => {
  const pendingMessages = ref([]);

  const pendingCount = computed(() =>
    pendingMessages.value.filter((message) => message.status === "sending").length
  );

  function addPendingMessage(message) {
    pendingMessages.value.push({
      ...message,
      status: "sending",
    });
  }

  function failPendingMessage(clientId) {
    const message = pendingMessages.value.find((item) => item.clientId === clientId);
    if (message) {
      message.status = "failed";
    }
  }

  function removePendingMessage(clientId) {
    pendingMessages.value = pendingMessages.value.filter(
      (message) => message.clientId !== clientId
    );
  }

  function removeConfirmedMessages(messages) {
    const confirmedClientIds = new Set(
      messages
        .map((message) => message.value?.clientId)
        .filter(Boolean)
    );

    pendingMessages.value = pendingMessages.value.filter(
      (message) => {
        if (confirmedClientIds.has(message.clientId)) return false;

        return !messages.some((confirmed) => {
          const value = confirmed.value;
          return value?.chatId === message.chatId
            && value?.user === message.user
            && value?.content === message.content
            && value?.published === message.published;
        });
      }
    );
  }

  function pendingMessagesForChat(chatId) {
    return pendingMessages.value.filter((message) => message.chatId === chatId);
  }

  return {
    pendingMessages,
    pendingCount,
    addPendingMessage,
    failPendingMessage,
    removePendingMessage,
    removeConfirmedMessages,
    pendingMessagesForChat,
  };
});
