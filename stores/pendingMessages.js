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
    const confirmedFingerprints = new Set(
      messages
        .map((message) => {
          const value = message.value;
          return value?.chatId && value?.user && value?.content && value?.published
            ? `${value.chatId}\u0000${value.user}\u0000${value.published}\u0000${value.content}`
            : null;
        })
        .filter(Boolean)
    );

    pendingMessages.value = pendingMessages.value.filter(
      (message) => {
        if (confirmedClientIds.has(message.clientId)) return false;

        return !confirmedFingerprints.has(
          `${message.chatId}\u0000${message.user}\u0000${message.published}\u0000${message.content}`
        );
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
