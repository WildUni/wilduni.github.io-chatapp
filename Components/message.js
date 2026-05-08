import { onBeforeUnmount, onMounted, ref } from "vue";

function setup() {
    const messageWrapper = ref(null);
    const isActionTrayPinned = ref(false);

    function toggleActionTray() {
        isActionTrayPinned.value = !isActionTrayPinned.value;
    }

    function closeActionTrayOnOutsideClick(event) {
        if (!messageWrapper.value?.contains(event.target)) {
            isActionTrayPinned.value = false;
        }
    }

    onMounted(() => {
        document.addEventListener("click", closeActionTrayOnOutsideClick);
    });

    onBeforeUnmount(() => {
        document.removeEventListener("click", closeActionTrayOnOutsideClick);
    });

    return {
        messageWrapper,
        isActionTrayPinned,
        toggleActionTray,
    }
}

export default async () => ({
    props: ["username", "messageContent", "avatarUrl", "avatarIsLoading", "published", "isOwnMessage", "showName", "showAvatar", "isPending", "pendingStatus", "messageId", "likeCount", "isLiked", "isPinned", "replyTo", "replyToContent"],
    emits: ["toggle-like", "toggle-pin", "reply", "open-reply"],
    setup,
    template: await fetch(new URL("./message.html", import.meta.url)).then((r) =>
        r.text(),
    ),
});
