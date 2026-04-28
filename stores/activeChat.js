import { ref } from "vue";
import { defineStore } from "pinia";

export const useActiveChatStore = defineStore("activeChat", () => {
  const activeChatId = ref(null);
  const activeChatName = ref(null);

  return { activeChatId };
});


