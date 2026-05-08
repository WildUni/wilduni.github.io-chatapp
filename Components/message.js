import { computed, onBeforeUnmount, ref, watch } from "vue";

function setup() {
    const messageWrapper = ref(null);
    const isActionTrayPinned = ref(false);
    const isProfileCardOpen = ref(false);
    const hasOpenOverlay = computed(() => isActionTrayPinned.value || isProfileCardOpen.value);
    let isListeningForOutsideClick = false;

    function toggleActionTray() {
        isActionTrayPinned.value = !isActionTrayPinned.value;
    }

    function closeActionTrayOnOutsideClick(event) {
        if (!messageWrapper.value?.contains(event.target)) {
            isActionTrayPinned.value = false;
            isProfileCardOpen.value = false;
        }
    }

    function toggleProfileCard() {
        isProfileCardOpen.value = !isProfileCardOpen.value;
    }

    function addOutsideClickListener() {
        if (isListeningForOutsideClick) return;
        document.addEventListener("click", closeActionTrayOnOutsideClick);
        isListeningForOutsideClick = true;
    }

    function removeOutsideClickListener() {
        if (!isListeningForOutsideClick) return;
        document.removeEventListener("click", closeActionTrayOnOutsideClick);
        isListeningForOutsideClick = false;
    }

    watch(hasOpenOverlay, (isOpen) => {
        if (isOpen) {
            addOutsideClickListener();
        } else {
            removeOutsideClickListener();
        }
    });

    onBeforeUnmount(removeOutsideClickListener);

    return {
        messageWrapper,
        isActionTrayPinned,
        isProfileCardOpen,
        toggleActionTray,
        toggleProfileCard,
    }
}

export default async () => ({
    props: ["username", "profileBio", "messageContent", "avatarUrl", "avatarIsLoading", "published", "isOwnMessage", "showName", "showAvatar", "isPending", "pendingStatus", "messageId", "likeCount", "isLiked", "isPinned", "replyTo", "replyToContent"],
    emits: ["toggle-like", "toggle-pin", "reply", "open-reply", "mention-user"],
    setup,
    template: await fetch(new URL("./message.html", import.meta.url)).then((r) =>
        r.text(),
    ),
});
