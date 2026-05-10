import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
  useGraffiti,
  useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import { storeToRefs } from 'pinia';
import { useChatStore } from "../stores/chat.js";
import { usePendingMessagesStore } from "../stores/pendingMessages.js";

const MAX_ATTACHMENTS = 4;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
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
  const { activeChatId, replyTarget, mentionRequest } = storeToRefs(chatStore);

  const myMessage = ref('');
  const messageInput = ref(null);
  const selectedMedia = ref([]);
  const isSending = ref(false);
  const sendError = ref("");

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
    return null;
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
      throw new Error(`${file.name} is not an image or video`);
    }

    if (kind === "video" && file.size > MAX_VIDEO_BYTES) {
      throw new Error(`${file.name} is larger than ${formatBytes(MAX_VIDEO_BYTES)}`);
    }

    const preparedFile = kind === "image" ? await compressImage(file) : file;
    const dimensions = kind === "image"
      ? await measureImage(preparedFile).catch(() => ({}))
      : await measureVideo(preparedFile);

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

  onBeforeUnmount(clearSelectedMedia);

  watch(
    mentionRequest,
    async (request) => {
      if (!request?.text) return;

      myMessage.value = myMessage.value
        ? `${myMessage.value.trimEnd()} ${request.text}`
        : request.text;

      await nextTick();
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

    const attachments = [...selectedMedia.value];

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
        content: trimmedMessage || (media[0]?.type === "video" ? "Shared a video" : "Shared an image"),
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
    selectedMedia,
    sendMessage,
    handleMediaSelect,
    removeSelectedMedia,
    formatBytes,
    isSending,
    sendError,
    replyTarget,
    clearReplyTarget: chatStore.clearReplyTarget,
  };
}

export default async () => ({
  setup,
  template: await fetch(new URL("./chatInput.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
