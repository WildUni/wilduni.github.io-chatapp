import { computed, onBeforeUnmount, ref, watch } from "vue";
import loadMediaAttachment from "./mediaAttachment.js";

function setup(props, { emit }) {
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

    function requestEdit() {
        if (!props.canManageMessage || props.isRecalled) return;

        isActionTrayPinned.value = false;
        emit("edit-message");
    }

    function recallMessage() {
        if (!props.canManageMessage || props.isRecalled) return;

        isActionTrayPinned.value = false;
        emit("recall-message");
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

    function normalizeHref(url) {
        return /^https?:\/\//i.test(url) ? url : `https://${url}`;
    }

    function linkifyText(text) {
        if (!text) return [];

        const tokens = [];
        const urlPattern = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
        let lastIndex = 0;
        let match;

        while ((match = urlPattern.exec(text)) !== null) {
            if (match.index > lastIndex) {
                tokens.push({
                    type: "text",
                    text: text.slice(lastIndex, match.index),
                });
            }

            const rawUrl = match[0];
            const trailing = rawUrl.match(/[.,!?;:)]*$/)?.[0] ?? "";
            const cleanUrl = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;

            if (cleanUrl) {
                tokens.push({
                    type: "link",
                    text: cleanUrl,
                    href: normalizeHref(cleanUrl),
                });
            }

            if (trailing) {
                tokens.push({
                    type: "text",
                    text: trailing,
                });
            }

            lastIndex = match.index + rawUrl.length;
        }

        if (lastIndex < text.length) {
            tokens.push({
                type: "text",
                text: text.slice(lastIndex),
            });
        }

        return tokens;
    }

    return {
        messageWrapper,
        isActionTrayPinned,
        isProfileCardOpen,
        toggleActionTray,
        toggleProfileCard,
        requestEdit,
        recallMessage,
        linkifyText,
    }
}

export default async () => ({
    props: ["username", "profileBio", "profilePronouns", "messageContent", "mediaAttachments", "avatarUrl", "avatarIsLoading", "published", "isOwnMessage", "showName", "showAvatar", "isPending", "pendingStatus", "messageId", "likeCount", "isLiked", "isPinned", "replyTo", "replyToContent", "isEdited", "isRecalled", "canManageMessage"],
    emits: ["toggle-like", "toggle-pin", "reply", "open-reply", "mention-user", "edit-message", "recall-message"],
    setup,
    components: {
        MediaAttachment: await loadMediaAttachment(),
    },
    template: await fetch(new URL("./message.html", import.meta.url)).then((r) =>
        r.text(),
    ),
});
