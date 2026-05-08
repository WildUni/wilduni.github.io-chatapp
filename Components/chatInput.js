import { nextTick, ref, watch } from "vue";
import {
  useGraffiti,
  useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import { storeToRefs } from 'pinia';
import { useChatStore } from "../stores/chat.js";
import { usePendingMessagesStore } from "../stores/pendingMessages.js";

function setup() {
  const graffiti = useGraffiti();
  const session = useGraffitiSession();
  const chatStore = useChatStore();
  const pendingMessagesStore = usePendingMessagesStore();
  const { activeChatId, replyTarget, mentionRequest } = storeToRefs(chatStore);

  const myMessage = ref('');
  const messageInput = ref(null);
  const isSending = ref(false);
  const sendError = ref("");

  watch(
    mentionRequest,
    async (request) => {
      if (!request?.text) return;

      myMessage.value = myMessage.value
        ? `${myMessage.value.trimEnd()} ${request.text}`
        : request.text;

      await nextTick();
      messageInput.value?.focus?.();
    },
  );

  /**
   * Send a message to the active chat
   * Validates chat and message content before posting
   */
  async function sendMessage() {
    if (isSending.value) return;

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

    if (!session.value?.actor) {
      sendError.value = "Please log in before sending a message";
      return;
    }

    const chatId = activeChatId.value;
    const actor = session.value.actor;
    const published = Date.now();
    const clientId = crypto.randomUUID();
    const reply = replyTarget.value;

    myMessage.value = "";
    chatStore.clearReplyTarget();
    isSending.value = true;
    sendError.value = "";
    pendingMessagesStore.addPendingMessage({
      clientId,
      chatId,
      content: trimmedMessage,
      published,
      user: actor,
      replyTo: reply?.id,
      replyToContent: reply?.content,
      replyToUser: reply?.user,
    });

    try {
      // Post message to Graffiti
      await graffiti.post(
        {
          value: {
            action: "Message",
            chatId,
            clientId,
            content: trimmedMessage,
            published,
            user: actor,
            replyTo: reply?.id,
            replyToContent: reply?.content,
            replyToUser: reply?.user,
          },
          channels: [`chat:${chatId}:Messages`]
        },
        session.value,
      );
    } catch (err) {
      sendError.value = "Message failed to send. Please try again.";
      pendingMessagesStore.failPendingMessage(clientId);
      console.error("Failed to send message:", err);
    } finally {
      isSending.value = false;
    }
  }

  return {
    myMessage,
    messageInput,
    sendMessage,
    isSending,
    sendError,
    replyTarget,
    clearReplyTarget: chatStore.clearReplyTarget,
  };
}

export default async () => ({
  setup,
  template: await fetch(new URL("./chatInput.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
