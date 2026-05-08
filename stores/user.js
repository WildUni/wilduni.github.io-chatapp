// ============================================================
// IMPORTS - Core Dependencies
// ============================================================
import { ref, computed, watch } from "vue";
import { defineStore } from "pinia";
import {
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";

// ============================================================
// PINIA STORE - User Profile State Management
// ============================================================
export const useUserStore = defineStore("user", () => {
  // Access Graffiti API and user session
  const graffiti = useGraffiti();
  const session = useGraffitiSession();

  function displayGraffitiHandle(handle) {
    return handle?.endsWith(".graffiti.actor")
      ? handle.slice(0, -".graffiti.actor".length)
      : handle;
  }

  // ============================================================
  // STATE - User Activities Discovery
  // ============================================================
  
  // Subscribe to user's activity channel
  const channels = computed(() => {
    return session.value ? [`user:${session.value.actor}:Activities`] : [];
  });

  // Discover all activity records from Graffiti
  // Activities include: ProfileName, ProfileImage, ProfileBio, etc.
  const { objects: activities } = useGraffitiDiscover(
    channels,
    {
      properties: {
        value: {
          required: ["action", "published", 'user'],
          properties: {
            action: { type: "string" },
            published: { type: "number" },
            // Optional fields depend on action type
            name: { type: "string" },
            content: { type: "string" },
            url: { type: "string" }
          }
        }
      }
    },
    session,
    true
  );

  // ============================================================
  // COMPUTED - User Information
  // ============================================================
  
  /**
   * Consolidate all user activities into a single object
   * Keeps only the most recent activity for each action type
   */
  const userInformation = computed(() => {
    return activities.value.reduce((acc, obj) => {
      const { action, published } = obj.value;
      // Keep only the most recent activity for each action
      if (!acc[action] || acc[action].value.published < published) {
        acc[action] = obj;
      }
      return acc;
    }, {});
  });

  // ============================================================
  // COMPUTED - Profile Image
  // ============================================================
  
  // Get raw media URL from user information
  const profileImageRawUrl = computed(() =>
    userInformation.value.ProfileImage?.value?.url ?? null
  );

  // Convert raw URL to object URL for browser display
  const profileImageUrl = ref();
  const profileImageLoading = ref(false);
  const isProfileUpdating = ref(false);
  const profileUpdateError = ref(false);
  const profileUpdateSuccess = ref(false);
  let currentObjectUrl = null;
  let profileImageRequest = 0;
  let profileSuccessTimer = null;

  function showProfileUpdateSuccess() {
    profileUpdateSuccess.value = true;
    clearTimeout(profileSuccessTimer);
    profileSuccessTimer = setTimeout(() => {
      profileUpdateSuccess.value = false;
      profileSuccessTimer = null;
    }, 1500);
  }

  // Cleanup function for memory management
  const cleanupProfileImage = () => {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
  };

  // Watch for profile image changes and create blob URL
  watch(
    () => profileImageRawUrl.value,
    async (url) => {
      const request = ++profileImageRequest;

      if (!url) {
        // Cleanup if URL was removed
        cleanupProfileImage();
        profileImageUrl.value = null;
        profileImageLoading.value = false;
        return;
      }

      try {
        // Cleanup old object URL to prevent memory leaks
        cleanupProfileImage();
        profileImageLoading.value = true;

        // Fetch image blob from Graffiti and create local URL
        const blob = await graffiti.getMedia(url, session.value);
        if (request !== profileImageRequest) return;
        currentObjectUrl = URL.createObjectURL(blob.data);
        profileImageUrl.value = currentObjectUrl;
      } catch (err) {
        if (request !== profileImageRequest) return;
        console.error("Failed to load profile image:", err);
        profileImageUrl.value = null;
      } finally {
        if (request === profileImageRequest) {
          profileImageLoading.value = false;
        }
      }
    },
    { immediate: true }
  );

  // ============================================================
  // COMPUTED - Profile Text Fields
  // ============================================================

  const profileHandle = ref(null);
  let profileHandleRequest = 0;

  watch(
    () => session.value?.actor,
    async (actor) => {
      const request = ++profileHandleRequest;

      if (!actor) {
        profileHandle.value = null;
        return;
      }

      try {
        const handle = await graffiti.actorToHandle(actor);
        if (request === profileHandleRequest) {
          profileHandle.value = displayGraffitiHandle(handle);
        }
      } catch (err) {
        console.error("Failed to resolve actor handle:", err);
        if (request === profileHandleRequest) {
          profileHandle.value = actor;
        }
      }
    },
    { immediate: true }
  );
  
  // Get user's display name
  const profileName = computed(() =>
    userInformation.value.ProfileName?.value?.name
      ?? profileHandle.value
  );

  // Get user's bio/description
  const profileBio = computed(() =>
    userInformation.value.ProfileBio?.value?.content ?? null
  );

  // ============================================================
  // ACTIONS - Update Profile Information
  // ============================================================
  
  /**
   * Update user's profile name
   * Posts to user's activity channel
   * @param {string} name - New profile name
   */
  async function updateProfileName(name) {
    // Trim whitespace and validate input
    const trimmed = name.trim();
    if (!session.value?.actor || !trimmed) return false;

    // Post profile name update to Graffiti
    await graffiti.post({
      value: {
        user: session.value.actor,
        action: 'ProfileName',
        name: trimmed,
        published: Date.now(),
      },
      channels: [`user:${session.value.actor}:Activities`],
    },
    session.value);

    return true;
  }

  /**
   * Update user's profile image
   * Uploads image file and posts media URL
   * @param {File} file - Image file to upload
   */
  async function updateProfileImage(file) {
    if (!session.value?.actor || !file) return false;

    // Upload image to Graffiti and get media URL
    const mediaUrl = await graffiti.postMedia(
      {
        data: file
      },
      session.value
    );

    const oldUrl = profileImageRawUrl.value;

    // Post profile image update to Graffiti
    await graffiti.post({
      value: {
        user: session.value.actor,
        action: 'ProfileImage',
        url: mediaUrl,
        published: Date.now(),
      },
      channels: [`user:${session.value.actor}:Activities`],
    },
    session.value);

    // Cleanup old image from Graffiti to save storage
    if (oldUrl) {
      try {
        await graffiti.deleteMedia(oldUrl, session.value);
      } catch (e) {
        console.log("Failed to delete old image:", e);
      }
    }

    return true;
  }

  /**
   * Update user's bio/profile description
   * Posts to user's activity channel
   * @param {string} content - New bio text
   */
  async function updateProfileBio(content) {
    if (!session.value?.actor) return false;
    const normalizedContent = content ?? "";

    // Post profile bio update to Graffiti
    await graffiti.post({
      value: {
        user: session.value.actor,
        action: 'ProfileBio',
        content: normalizedContent,
        published: Date.now(),
      },
      channels: [`user:${session.value.actor}:Activities`],
    },
    session.value);

    return true;
  }

  /**
   * Handle file input from upload control
   * Extracts file and calls updateProfileImage
   * @param {Event} event - File input change event
   */
  async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return false;

    isProfileUpdating.value = true;
    profileUpdateError.value = false;
    profileUpdateSuccess.value = false;

    try {
      // Upload the selected image
      const success = await updateProfileImage(file);
      if (success) showProfileUpdateSuccess();
      return success;
    } catch (err) {
      profileUpdateError.value = true;
      console.error("Failed to update profile image:", err);
      return false;
    } finally {
      isProfileUpdating.value = false;

      // Clear input for future uploads
      event.target.value = "";
    }
  }

  // ============================================================
  // COMPUTED - Helper Flags
  // ============================================================
  
  // ============================================================
  // EXPORTS - Store API
  // ============================================================
  
  // Return public API for use in components
  return {
    // Profile display data
    profileName,
    profileImageUrl,
    profileImageLoading,
    profileBio,
    isProfileUpdating,
    profileUpdateError,
    profileUpdateSuccess,

    // Profile update actions
    updateProfileName,
    updateProfileImage,
    updateProfileBio,
    handleFileUpload,

  };
});
