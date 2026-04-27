import { ref } from "vue";
import { defineStore } from "pinia";

export const useActiveChatStore = defineStore("activeChat", () => {
  const activeChatId = ref(null);

  function setActiveChat(chatId) {
    activeChatId.value = chatId;
  }

  return { activeChatId, setActiveChat };
});


