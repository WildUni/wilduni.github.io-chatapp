import { useActiveChatStore } from "../stores/activeChat.js";
import {
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";

import loadMessage from "./message.js";


function setup() {
    const session = useGraffitiSession();
    const activeChat = useActiveChatStore();

    function currentChannels() {
      return activeChat.activeChatId == null ? [] : [String(activeChat.activeChatId)];
    }
    
    const { objects: chatMessages } = useGraffitiDiscover(
        currentChannels,
        {
        properties: {
          value: {
            required: ["action", "content", "published"],
            properties: {
              action: { const: "Message" },
              content: { type: "string"},
              published: { type: "number" },
            },
          },
        },
      },
        session
    );
    return {
      chatMessages
    };
}


export default async () => ({
  props: ["chatId"],
  setup,
  components:{
    Message: await loadMessage(),
  },
  template: await fetch(new URL("./chatFlow.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});

