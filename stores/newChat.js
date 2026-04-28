import { ref } from "vue";
import { defineStore } from "pinia";
import {
  useGraffiti,
  useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";

import { useActiveChatStore } from "./activeChat.js";

export const useNewChatStore = defineStore("newChat", () => {
    const graffiti = useGraffiti();
    const session = useGraffitiSession();
    const activeChat = useActiveChatStore();


    const newChatName = ref('');
    
    function setNewChatName(name) {
        newChatName.value = name;
    }
    
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
        newChatName,
        createNewChat,
        setNewChatName
    }
});


