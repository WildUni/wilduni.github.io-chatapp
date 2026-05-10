import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  useGraffiti,
  useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";

const DEFAULT_MAX_BYTES = 30 * 1024 * 1024;

function setup(props) {
  const graffiti = useGraffiti();
  const session = useGraffitiSession();
  const objectUrl = ref(null);
  const isLoading = ref(false);
  const loadError = ref(false);
  const isLightboxOpen = ref(false);
  let loadRun = 0;

  const mediaKind = computed(() => props.attachment?.type || "");
  const isImage = computed(() => mediaKind.value === "image");
  const isVideo = computed(() => mediaKind.value === "video");
  const displayName = computed(() => props.attachment?.name || "Media attachment");
  const sourceUrl = computed(() => props.attachment?.previewUrl || objectUrl.value);
  const attachmentStyle = computed(() => {
    const width = Number(props.attachment?.width);
    const height = Number(props.attachment?.height);

    if (props.compact || !width || !height) return {};

    return {
      aspectRatio: `${width} / ${height}`,
    };
  });

  function openLightbox() {
    if (!sourceUrl.value || loadError.value) return;
    isLightboxOpen.value = true;
  }

  function closeLightbox() {
    isLightboxOpen.value = false;
  }

  function closeOnEscape(event) {
    if (event.key === "Escape") closeLightbox();
  }

  function cleanupObjectUrl() {
    if (objectUrl.value) {
      URL.revokeObjectURL(objectUrl.value);
      objectUrl.value = null;
    }
  }

  async function getMediaWithFallback(url) {
    const maxBytes = props.maxBytes || DEFAULT_MAX_BYTES;
    const acceptedTypes = props.attachment?.mimeType
      ? [props.attachment.mimeType]
      : ["image/*", "video/*"];

    try {
      return await graffiti.getMedia(
        url,
        {
          types: acceptedTypes,
          maxBytes,
        },
        session.value
      );
    } catch (err) {
      return graffiti.getMedia(url, session.value);
    }
  }

  watch(
    () => props.attachment?.url,
    async (url) => {
      const run = ++loadRun;
      cleanupObjectUrl();
      loadError.value = false;

      if (!url || props.attachment?.previewUrl) {
        isLoading.value = false;
        return;
      }

      isLoading.value = true;

      try {
        const media = await getMediaWithFallback(url);
        if (run !== loadRun) return;
        objectUrl.value = URL.createObjectURL(media.data);
      } catch (err) {
        if (run !== loadRun) return;
        loadError.value = true;
        console.error("Failed to load media attachment:", err);
      } finally {
        if (run === loadRun) {
          isLoading.value = false;
        }
      }
    },
    { immediate: true }
  );

  watch(isLightboxOpen, (isOpen) => {
    if (isOpen) {
      document.addEventListener("keydown", closeOnEscape);
      document.body.classList.add("media-lightbox-open");
    } else {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("media-lightbox-open");
    }
  });

  onBeforeUnmount(() => {
    loadRun += 1;
    document.removeEventListener("keydown", closeOnEscape);
    document.body.classList.remove("media-lightbox-open");
    cleanupObjectUrl();
  });

  return {
    sourceUrl,
    attachmentStyle,
    isImage,
    isVideo,
    displayName,
    isLoading,
    loadError,
    isLightboxOpen,
    openLightbox,
    closeLightbox,
  };
}

export default async () => ({
  props: ["attachment", "compact", "maxBytes"],
  setup,
  template: await fetch(new URL("./mediaAttachment.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
