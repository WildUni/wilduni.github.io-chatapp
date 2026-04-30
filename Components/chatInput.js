import { ref } from "vue";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import {storeToRefs} from 'pinia';
import { useChatStore } from "../stores/chat.js";


function setup() {
    const graffiti = useGraffiti();
    const session = useGraffitiSession();
    const chatStore = useChatStore();
    const {activeChatId} = storeToRefs(chatStore)
    const myMessage = ref('')
    const isSending = ref(false);
    const sendError = ref("");

    
    async function sendMessage(){
        if(myMessage.value.length === 0){
            console.log('empty')
            return
        }
        if(activeChatId.value == null){
            console.log('no active chat')
            return
        }
        isSending.value = true;
        sendError.value = "";
        try {
            await graffiti.post(
                {
                    value: {
                        action: "Message",
                        content: myMessage.value,
                        published: Date.now(),
                        user: session.value?.actor
                    },
                    channels: [`chat:${activeChatId.value}:Messages`]
                },
                session.value,
            );

            myMessage.value = "";
            // console.log(`chat:${activeChatId.value}:Messages`)
        } catch (err) {
            sendError.value = "Message failed to send.";
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
