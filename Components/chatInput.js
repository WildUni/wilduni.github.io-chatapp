import { ref } from "vue";
import {
  useGraffiti,
  useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import { storeToRefs } from 'pinia';
import { useChatStore } from "../stores/chat.js";

function setup() {
  const graffiti = useGraffiti();
  const session = useGraffitiSession();
  const chatStore = useChatStore();
  const { activeChatId } = storeToRefs(chatStore);

  const myMessage = ref('');
  const isSending = ref(false);
  const sendError = ref("");

  /**
   * Send a message to the active chat
   * Validates chat and message content before posting
   */
  async function sendMessage() {
    // Trim whitespace for validation and sending
    const trimmedMessage = myMessage.value.trim();

    // Validate message is not empty
    if (!trimmedMessage) {
      sendError.value = "Message cannot be empty";
      return;
    }

    // Validate active chat exists
    if (!activeChatId.value) {
      sendError.value = "No active chat selected";
      return;
    }

    isSending.value = true;
    sendError.value = "";

    try {
      // Post message to Graffiti
      await graffiti.post(
        {
          value: {
            action: "Message",
            chatId: activeChatId.value,
            content: trimmedMessage,
            published: Date.now(),
            user: session.value?.actor
          },
          channels: [`chat:${activeChatId.value}:Messages`]
        },
        session.value,
      );

      // Clear input on success
      myMessage.value = "";
    } catch (err) {
      sendError.value = "Message failed to send. Please try again.";
      console.error("Failed to send message:", err);
    } finally {
      isSending.value = false;
    }
  }

  return {
    myMessage,
    sendMessage,
    isSending,
    sendError,
  };
}

export default async () => ({
  setup,
  template: await fetch(new URL("./chatInput.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
