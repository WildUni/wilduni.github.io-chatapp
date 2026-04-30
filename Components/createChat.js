import { ref, computed, watch } from "vue";
import { storeToRefs } from "pinia"
import { useChatStore } from "../stores/chat.js";

function setup() {
    const chatStore = useChatStore();
    const {newChatName, createNewChat} = storeToRefs(chatStore);
    const activeTab = ref('newchat')
    return{
        newChatName,
        createNewChat:chatStore.createNewChat,
        activeTab
    }
}

export default async () => ({
    setup,
    template: await fetch(new URL("./createChat.html", import.meta.url)).then((r) =>
    r.text(),
    ),
});
