import { ref, computed, watch } from "vue";
import { storeToRefs } from "pinia"
import { useChatStore } from "../stores/chat.js";
import { delay } from "../index.js";
function setup() {
    const chatStore = useChatStore();
    const {newChatName, 
        createNewChat, 
        joinChatId, 
        isCreating,
        createError, 
        createSuccess,
        isJoining, 
        joinError, 
        joinSuccess,
        activeChatId, 
        activeChatRootId,
        } = storeToRefs(chatStore);
    const activeTab = ref('newchat');
    function closeDrawer() {
        document.querySelector("#newChatMenu").open = false;
    }
    async function handleCreateChat() {
        const success = await chatStore.createNewChat();
        if (success){ 
            await delay()
            closeDrawer();
        }
    }
    async function handleJoinChat() {
        const success = await chatStore.joinChat();
        if (success){ 
            await delay()
            closeDrawer();
        }
    }
    return{
        newChatName,
        activeTab,
        joinChatId,
        isCreating,
        createError,
        createSuccess,
        isJoining,
        joinError,
        joinSuccess,
        handleCreateChat,
        handleJoinChat,
        
    }
}

export default async () => ({
    setup,
    template: await fetch(new URL("./createChat.html", import.meta.url)).then((r) =>
    r.text(),
    ),
});
