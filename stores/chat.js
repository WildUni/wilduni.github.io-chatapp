import { ref } from "vue";
import { defineStore } from "pinia";
import {
  useGraffiti,
  useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";

export const useChatStore = defineStore("chat", () => {
    const graffiti = useGraffiti();
    const session = useGraffitiSession();


    const activeChatId = ref(null);
    const activeChatName = ref(null);


    const joinChatId = ref(null);

    const newChatName = ref('');


    async function createNewChat(parent = null){
        if(!newChatName.value) return
        
        const chatId = crypto.randomUUID();
        graffiti.post(
            {
                value:{
                    action: 'Membership',
                    value: 'Join',
                    chatId: chatId, 
                    chatName: newChatName.value,
                    published: Date.now(),
                },
                channels: [`user:${session.value.actor}:Membership`],
                // channels: [`user:${session.value.actor}:Membership`],
                // allowed: []
            },
            session.value      
        )
        graffiti.post(
            {
                value:{
                    action: 'Create',
                    chatId: chatId, 
                    name: newChatName.value,
                    published: Date.now(),
                },
                channels: [`Chat:${chatId}:Activity`],
            },
            session.value      
        )
        graffiti.post(
            {
                value:{
                    action: 'Membership',
                    value: 'Join',
                    user: session.value.actor,
                    published: Date.now(),
                    parent
                },
                channels: [`Chat:${chatId}:Membership`],
            },
            session.value      
        )
        newChatName.value = "";
        console.log('chat-posted')
    }

    return {
        activeChatId,
        activeChatName,
        newChatName,
        createNewChat,
        joinChatId,
        
    }
});


