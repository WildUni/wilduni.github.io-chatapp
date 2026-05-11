import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  useGraffiti,
  useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import { storeToRefs } from 'pinia';
import { useChatStore } from "../stores/chat.js";
import { usePendingMessagesStore } from "../stores/pendingMessages.js";

const MAX_ATTACHMENTS = 4;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
const MAX_PDF_BYTES = 30 * 1024 * 1024;
const IMAGE_TARGET_BYTES = 2.5 * 1024 * 1024;
const IMAGE_MAX_EDGE = 1600;
const COMPRESSIBLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function setup() {
  const graffiti = useGraffiti();
  const session = useGraffitiSession();
  const chatStore = useChatStore();
  const pendingMessagesStore = usePendingMessagesStore();
  const { activeChatId, replyTarget, editTarget, mentionRequest } = storeToRefs(chatStore);

  const myMessage = ref('');
  const messageInput = ref(null);
  const attachmentMenuWrapper = ref(null);
  const selectedMedia = ref([]);
  const isAttachmentMenuOpen = ref(false);
  const isSending = ref(false);
  const sendError = ref("");
  const composerTarget = computed(() => editTarget.value || replyTarget.value);
  const isEditingMessage = computed(() => Boolean(editTarget.value));
  const isAttachmentDisabled = computed(() => (
    isSending.value || isEditingMessage.value || selectedMedia.value.length >= MAX_ATTACHMENTS
  ));
  const submitLabel = computed(() => {
    if (isSending.value) return isEditingMessage.value ? "Saving..." : "Sending...";
    return isEditingMessage.value ? "Save" : "Send";
  });
  const isSubmitDisabled = computed(() => {
    if (isSending.value) return true;

    const trimmedMessage = myMessage.value.trim();
    if (isEditingMessage.value) {
      return !trimmedMessage || trimmedMessage === (editTarget.value?.content || "").trim();
    }

    return !trimmedMessage && selectedMedia.value.length === 0;
  });

  function resizeMessageInput() {
    const input = messageInput.value;
    if (!input) return;

    input.style.height = "auto";
    const nextHeight = Math.min(input.scrollHeight, 160);
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > nextHeight ? "auto" : "hidden";
  }

  function handleMessageInput(event) {
    myMessage.value = event.target.value;
    resizeMessageInput();
  }

  function handleMessageKeydown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;

    event.preventDefault();
    sendMessage();
  }

  function closeAttachmentMenu() {
    isAttachmentMenuOpen.value = false;
  }

  function toggleAttachmentMenu() {
    if (isAttachmentDisabled.value) return;
    isAttachmentMenuOpen.value = !isAttachmentMenuOpen.value;
  }

  function closeAttachmentMenuOnOutsideClick(event) {
    if (!isAttachmentMenuOpen.value) return;
    if (attachmentMenuWrapper.value?.contains(event.target)) return;
    closeAttachmentMenu();
  }

  function closeAttachmentMenuOnEscape(event) {
    if (event.key === "Escape") {
      closeAttachmentMenu();
    }
  }

  function openAttachmentPicker(event) {
    event.currentTarget.querySelector("input")?.click();
  }

  function clearComposerTarget() {
    if (isEditingMessage.value) {
      chatStore.clearEditTarget();
      myMessage.value = "";
      sendError.value = "";
      nextTick(resizeMessageInput);
      return;
    }

    chatStore.clearReplyTarget();
  }

  function revokeSelectedMediaPreview(item) {
    if (item?.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }

  function clearSelectedMedia() {
    selectedMedia.value.forEach(revokeSelectedMediaPreview);
    selectedMedia.value = [];
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, exponent);
    return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
  }

  function getMediaKind(file) {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
    return null;
  }

  function getAttachmentLabel(type) {
    if (type === "video") return "Shared a video";
    if (type === "pdf") return "Shared a PDF";
    return "Shared an image";
  }

  function measureImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      };

      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Unable to read image"));
      };

      image.src = url;
    });
  }

  function measureVideo(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");

      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve({
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
        });
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({});
      };

      video.preload = "metadata";
      video.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
      canvas.toBlob(resolve, type, quality);
    });
  }

  async function compressImage(file) {
    if (!COMPRESSIBLE_IMAGE_TYPES.has(file.type) || file.type === "image/gif") {
      return file;
    }

    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const outputType = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    let quality = file.size > IMAGE_TARGET_BYTES ? 0.78 : 0.86;
    let blob = await canvasToBlob(canvas, outputType, quality);

    while (blob && blob.size > IMAGE_TARGET_BYTES && quality > 0.52) {
      quality -= 0.08;
      blob = await canvasToBlob(canvas, outputType, quality);
    }

    if (!blob || blob.size >= file.size) return file;

    const extension = outputType === "image/webp" ? "webp" : "jpg";
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.${extension}`, {
      type: outputType,
      lastModified: Date.now(),
    });
  }

  async function prepareMediaFile(file) {
    const kind = getMediaKind(file);
    if (!kind) {
      throw new Error(`${file.name} is not an image, video, or PDF`);
    }

    if (kind === "video" && file.size > MAX_VIDEO_BYTES) {
      throw new Error(`${file.name} is larger than ${formatBytes(MAX_VIDEO_BYTES)}`);
    }

    if (kind === "pdf" && file.size > MAX_PDF_BYTES) {
      throw new Error(`${file.name} is larger than ${formatBytes(MAX_PDF_BYTES)}`);
    }

    const preparedFile = kind === "image" ? await compressImage(file) : file;
    const dimensions = kind === "image"
      ? await measureImage(preparedFile).catch(() => ({}))
      : kind === "video"
        ? await measureVideo(preparedFile)
        : {};

    return {
      file: preparedFile,
      kind,
      dimensions,
      originalSize: file.size,
    };
  }

  async function uploadMediaItem(item) {
    const prepared = await prepareMediaFile(item.file);
    const mediaUrl = await graffiti.postMedia(
      {
        data: prepared.file,
      },
      session.value
    );

    return {
      url: mediaUrl,
      type: prepared.kind,
      mimeType: prepared.file.type,
      name: prepared.file.name,
      size: prepared.file.size,
      originalSize: prepared.originalSize,
      width: prepared.dimensions.width,
      height: prepared.dimensions.height,
      duration: prepared.dimensions.duration,
    };
  }

  function handleMediaSelect(event) {
    closeAttachmentMenu();

    if (isEditingMessage.value) {
      event.target.value = "";
      return;
    }

    const files = [...event.target.files];
    const remainingSlots = MAX_ATTACHMENTS - selectedMedia.value.length;
    const acceptedFiles = files.slice(0, Math.max(0, remainingSlots));
    const rejectedByCount = files.length - acceptedFiles.length;
    const nextMedia = [];

    sendError.value = "";

    for (const file of acceptedFiles) {
      const kind = getMediaKind(file);
      if (!kind) continue;

      if (kind === "video" && file.size > MAX_VIDEO_BYTES) {
        sendError.value = `Videos must be ${formatBytes(MAX_VIDEO_BYTES)} or smaller.`;
        continue;
      }

      if (kind === "pdf" && file.size > MAX_PDF_BYTES) {
        sendError.value = `PDFs must be ${formatBytes(MAX_PDF_BYTES)} or smaller.`;
        continue;
      }

      nextMedia.push({
        id: crypto.randomUUID(),
        file,
        kind,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (rejectedByCount > 0) {
      sendError.value = `You can attach up to ${MAX_ATTACHMENTS} files per message.`;
    }

    selectedMedia.value = [...selectedMedia.value, ...nextMedia];
    event.target.value = "";
  }

  function removeSelectedMedia(id) {
    const item = selectedMedia.value.find((media) => media.id === id);
    revokeSelectedMediaPreview(item);
    selectedMedia.value = selectedMedia.value.filter((media) => media.id !== id);
  }

  onMounted(() => {
    document.addEventListener("click", closeAttachmentMenuOnOutsideClick);
    document.addEventListener("keydown", closeAttachmentMenuOnEscape);
  });

  onBeforeUnmount(() => {
    clearSelectedMedia();
    document.removeEventListener("click", closeAttachmentMenuOnOutsideClick);
    document.removeEventListener("keydown", closeAttachmentMenuOnEscape);
  });

  watch(
    editTarget,
    async (target) => {
      if (!target) return;

      clearSelectedMedia();
      myMessage.value = target.content || "";
      sendError.value = "";
      await nextTick();
      resizeMessageInput();
      messageInput.value?.focus?.();
    },
  );

  watch(
    mentionRequest,
    async (request) => {
      if (!request?.text) return;

      myMessage.value = myMessage.value
        ? `${myMessage.value.trimEnd()} ${request.text}`
        : request.text;

      await nextTick();
      resizeMessageInput();
      messageInput.value?.focus?.();
    },
  );

  /**
   * Send a message to the active chat
   * Validates chat and message content before posting
   */
  async function sendMessage() {
    if (isSending.value) return;

    // Trim whitespace for validation and sending
    const trimmedMessage = myMessage.value.trim();
    const edit = editTarget.value;

    const attachments = [...selectedMedia.value];

    if (edit) {
      if (!trimmedMessage) {
        sendError.value = "Edited message cannot be empty";
        return;
      }

      if (trimmedMessage === (edit.content || "").trim()) {
        sendError.value = "Make a change before saving";
        return;
      }

      if (!activeChatId.value) {
        sendError.value = "No active chat selected";
        return;
      }

      if (!session.value?.actor) {
        sendError.value = "Please log in before editing a message";
        return;
      }

      const chatId = activeChatId.value;
      const actor = session.value.actor;
      const clientId = crypto.randomUUID();

      isSending.value = true;
      sendError.value = "";

      try {
        await graffiti.post(
          {
            value: {
              action: "MessageEdit",
              value: trimmedMessage,
              clientId,
              messageId: edit.id,
              chatId,
              published: Date.now(),
              user: actor,
            },
            channels: [`chat:${chatId}:MessageInteractions`],
          },
          session.value,
        );

        myMessage.value = "";
        chatStore.clearEditTarget();
        await nextTick();
        resizeMessageInput();
      } catch (err) {
        sendError.value = "Edit failed to save. Please try again.";
        console.error("Failed to edit message:", err);
      } finally {
        isSending.value = false;
      }

      return;
    }

    // Validate message is not empty
    if (!trimmedMessage && attachments.length === 0) {
      sendError.value = "Add a message or attach media";
      return;
    }

    // Validate active chat exists
    if (!activeChatId.value) {
      sendError.value = "No active chat selected";
      return;
    }

    if (!session.value?.actor) {
      sendError.value = "Please log in before sending a message";
      return;
    }

    const chatId = activeChatId.value;
    const actor = session.value.actor;
    const published = Date.now();
    const clientId = crypto.randomUUID();
    const reply = replyTarget.value;

    myMessage.value = "";
    selectedMedia.value = [];
    chatStore.clearReplyTarget();
    isSending.value = true;
    sendError.value = "";
    await nextTick();
    resizeMessageInput();

    try {
      const media = attachments.length
        ? await Promise.all(attachments.map(uploadMediaItem))
        : [];

      pendingMessagesStore.addPendingMessage({
        clientId,
        chatId,
        content: trimmedMessage,
        media,
        published,
        user: actor,
        replyTo: reply?.id,
        replyToContent: reply?.content,
        replyToUser: reply?.user,
      });

      // Post message to Graffiti
      await graffiti.post(
        {
          value: {
            action: "Message",
            chatId,
            clientId,
            content: trimmedMessage,
            media,
            published,
            user: actor,
            replyTo: reply?.id,
            replyToContent: reply?.content,
            replyToUser: reply?.user,
          },
          channels: [`chat:${chatId}:Messages`]
        },
        session.value,
      );

      chatStore.recordLatestMessage({
        chatId,
        content: trimmedMessage || getAttachmentLabel(media[0]?.type),
        published,
        user: actor,
      });
      attachments.forEach(revokeSelectedMediaPreview);
    } catch (err) {
      sendError.value = "Message failed to send. Please try again.";
      pendingMessagesStore.failPendingMessage(clientId);
      selectedMedia.value = attachments;
      console.error("Failed to send message:", err);
    } finally {
      isSending.value = false;
    }
  }

  return {
    myMessage,
    messageInput,
    attachmentMenuWrapper,
    selectedMedia,
    composerTarget,
    isEditingMessage,
    isAttachmentDisabled,
    isAttachmentMenuOpen,
    submitLabel,
    isSubmitDisabled,
    sendMessage,
    toggleAttachmentMenu,
    openAttachmentPicker,
    handleMessageInput,
    handleMessageKeydown,
    handleMediaSelect,
    removeSelectedMedia,
    formatBytes,
    isSending,
    sendError,
    replyTarget,
    editTarget,
    clearComposerTarget,
  };
}

export default async () => ({
  setup,
  template: await fetch(new URL("./chatInput.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
