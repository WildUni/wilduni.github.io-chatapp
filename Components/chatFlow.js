import { useChatStore } from "../stores/chat.js";
import {
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";

import loadMessage from "./message.js";
import { storeToRefs } from "pinia"

function setup() {
    const session = useGraffitiSession();
    const chatStore = useChatStore();
    const {activeChatId} = storeToRefs(chatStore);

    function currentChannels() {
      return activeChatId.value == null ? [] : [String(activeChatId.value)];
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

