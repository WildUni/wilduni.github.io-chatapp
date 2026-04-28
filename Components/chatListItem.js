
import {storeToRefs} from 'pinia';
import { useChatStore } from "../stores/chat.js";

function setup(props) {
  const chatStore = useChatStore();
  const { activeChatId } = storeToRefs(chatStore);
  
  return {
    activeChatId
  };
}

export default async () => ({
  props: ["chatId", 'chatName'],
  setup,
  template: await fetch(new URL("./chatListItem.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
