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


    
    async function sendMessage(){
        if(myMessage.value.length === 0){
            console.log('empty')
            return
        }
        if(activeChatId.value == null){
            console.log('no active chat')
            return
        }
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
        // console.log('message posted')

        myMessage.value = "";
    }
    return {
        myMessage,
        sendMessage,
     };
}

export default async () => ({
    setup,
    template: await fetch(new URL("./chatInput.html", import.meta.url)).then((r) =>
        r.text(),
    ),
});
