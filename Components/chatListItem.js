import { useActiveChatStore } from "../stores/activeChat.js";
import { storeToRefs } from "pinia";

function setup(props) {
  // console.log(props.chats);
  const activeChat = useActiveChatStore();
  const { activeChatId } = storeToRefs(activeChat);
  
  return {
    activeChatId
  };
}

export default async () => ({
  props: ["chatId"],
  setup,
  template: await fetch(new URL("./chatListItem.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
