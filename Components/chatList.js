import { ref } from "vue";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import loadChatListItem from "./chatListItem.js";

function setup(props, { emit }) {
    const graffiti = useGraffiti();
    const session = useGraffitiSession();
    
    // useGraffitiDiscover(
    //     [],
    //     {
    //     properties: {
    //       value: {
    //         required: ["activity", "id", "content", "published", "updated"],
    //         properties: {
    //           activity: { const: "Update" },
    //           id: { type: "string" },
    //           content: {
    //               type: "object",
    //               properties: {
    //                 name: { type: "string" },
    //                 volume: { type: "number" }
    //               },
    //               required: ["name", "volume"]
    //           },
    //           published: { type: "number" },
    //           updated: { type: "number" },
    //         },
    //       },
    //     },
    //   },
    //     session
    // )
    const chats = ref([1, 2]);
    function addChat() {
      chats.value.push(chats.value.length + 1);
    }

    function emitUpdateUrl(chatId) {
      emit("update-chat-url", chatId);
    }

    return { chats, addChat, emitUpdateUrl};
}

export default async () => ({
    setup,
    components:{
      ChatListItem: await loadChatListItem()
    },
    template: await fetch(new URL("./chatList.html", import.meta.url)).then((r) =>
        r.text(),
    ),
});
