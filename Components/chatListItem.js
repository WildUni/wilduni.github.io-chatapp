
import {storeToRefs} from 'pinia';
import { useChatStore } from "../stores/chat.js";
import { computed } from "vue";

function setup(props) {
  const chatStore = useChatStore();
  const { activeChatId } = storeToRefs(chatStore);

  const latestMessageText = computed(() => {
    if (!props.latestMessage) return "No messages yet";

    return `${props.latestMessage.senderName || props.latestMessage.user}: ${props.latestMessage.content}`;
  });

  const latestMessageAge = computed(() => {
    const published = props.latestMessage?.published;
    if (!published) return "";

    const seconds = Math.max(0, Math.floor((props.now - published) / 1000));
    if (seconds < 5) return "now";
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;

    return new Date(published).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  });

  return {
    activeChatId,
    latestMessageText,
    latestMessageAge,
  };
}

export default async () => ({
  props: ["chatId", 'chatName', 'chatImageUrl', 'isChatImageLoading', 'previewMembers', 'hasUnread', 'latestMessage', 'isMessagePreviewLoading', 'now'],
  setup,
  template: await fetch(new URL("./chatListItem.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
