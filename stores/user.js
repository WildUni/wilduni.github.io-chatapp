// ============================================================
// IMPORTS - Core Dependencies
// ============================================================
import { ref, computed, watch } from "vue";
import { defineStore } from "pinia";
import {
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover
} from "@graffiti-garden/wrapper-vue";

// ============================================================
// PINIA STORE - User Profile State Management
// ============================================================
export const useUserStore = defineStore("user", () => {
  // Access Graffiti API and user session
  const graffiti = useGraffiti();
  const session = useGraffitiSession();

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
  let currentObjectUrl = null;

  // Watch for profile image changes and create blob URL
  watch(
    () => profileImageRawUrl.value,
    async (url) => {
      if (!url) return;

      // Cleanup old object URL to prevent memory leaks
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }

      // Fetch image blob from Graffiti and create local URL
      const blob = await graffiti.getMedia(url, session.value);
      currentObjectUrl = URL.createObjectURL(blob.data);
      profileImageUrl.value = currentObjectUrl;
    },
    { immediate: true }
  );

  // ============================================================
  // COMPUTED - Profile Text Fields
  // ============================================================
  
  // Get user's display name
  const profileName = computed(() =>
    userInformation.value.ProfileName?.value?.name ?? null
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
    if (!trimmed) return;

    // Post profile name update to Graffiti
    graffiti.post({
      value: {
        user: session.value.actor,
        action: 'ProfileName',
        name: name,
        published: Date.now(),
      },
      channels: [`user:${session.value.actor}:Activities`],
    },
    session.value);
  }

  /**
   * Update user's profile image
   * Uploads image file and posts media URL
   * @param {File} file - Image file to upload
   */
  async function updateProfileImage(file) {
    // Upload image to Graffiti and get media URL
    const mediaUrl = await graffiti.postMedia(
      {
        data: file
      },
      session.value
    );

    const oldUrl = profileImageRawUrl.value;

    // Post profile image update to Graffiti
    graffiti.post({
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
  }

  /**
   * Update user's bio/profile description
   * Posts to user's activity channel
   * @param {string} content - New bio text
   */
  async function updateProfileBio(content) {
    // Post profile bio update to Graffiti
    graffiti.post({
      value: {
        user: session.value.actor,
        action: 'ProfileBio',
        content: content,
        published: Date.now(),
      },
      channels: [`user:${session.value.actor}:Activities`],
    },
    session.value);
  }

  /**
   * Handle file input from upload control
   * Extracts file and calls updateProfileImage
   * @param {Event} event - File input change event
   */
  async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Upload the selected image
    await updateProfileImage(file);

    // Clear input for future uploads
    event.target.value = "";
  }

  // ============================================================
  // COMPUTED - Helper Flags
  // ============================================================
  
  // Check if user has set a profile name
  const hasProfileName = computed(() =>
    !!profileName.value?.trim()
  );

  // ============================================================
  // EXPORTS - Store API
  // ============================================================
  
  // Return public API for use in components
  return {
    // Profile display data
    profileName,
    profileImageUrl,
    profileBio,

    // Profile update actions
    updateProfileName,
    updateProfileImage,
    updateProfileBio,
    handleFileUpload,

    // Helper flags
    hasProfileName
  };
});