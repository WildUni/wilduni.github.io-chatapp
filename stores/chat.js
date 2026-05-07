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
// PINIA STORE - Chat State Management
// ============================================================
export const useChatStore = defineStore("chat", () => {
  // Access Graffiti API and user session
  const graffiti = useGraffiti();
  const session = useGraffitiSession();

  // ============================================================
  // STATE - Active Chat Information
  // ============================================================
  
  // Track the currently opened chat
  const activeChatId = ref(null);
  const activeChatName = ref(null);
  const activeChatRootId = ref(null);
  const activeChatParentId = ref(null);

  // ============================================================
  // STATE - Chat Creation & Joining
  // ============================================================
  
  // Form inputs for creating and joining chats
  const newChatName = ref('');
  const joinChatId = ref('');


  // ============================================================
  // STATE - Operation Status & Feedback
  // ============================================================
  
  // Chat creation operation status
  const isCreating = ref(false);
  const createError = ref(false);
  const createSuccess = ref(false);
  
  // Chat joining operation status
  const isJoining = ref(false);
  const joinError = ref(false);
  const joinSuccess = ref(false);
  
  // Chat leaving operation status
  const isLeaving = ref(false);
  const leaveError = ref(false);
  const leaveSuccess = ref(false);

  // Chat rename operation status
  const isRenaming = ref(false);
  const renameError = ref(false);
  const renameSuccess = ref(false);

  // Active chat image display URL
  const activeChatImageUrl = ref(null);
  let currentChatImageObjectUrl = null;

  // ============================================================
  // ACTIONS - Create New Chat
  // ============================================================
  
  /**
   * Creates a new chat room and posts membership to Graffiti
   * @param {string|null} parent - Parent chat ID for nested chats (optional)
   * @param {string|null} root - Root chat ID for threading (optional)
   * @returns {boolean} Success status of chat creation
   */
  async function createNewChat(parent = null, root = null) {
    // Validate chat name is provided
    if (!newChatName.value) {
      return false;
    }

    // Reset status flags
    isCreating.value = true;
    createError.value = false;
    createSuccess.value = false;

    // Generate unique IDs for chat hierarchy
    const chatId = crypto.randomUUID();
    const parentChatId = parent ? parent : chatId;
    const rootChatId = root ? root : chatId;
    console.log(newChatName.value, parentChatId, rootChatId)

    try {
      const now = Date.now();
      const postOperations = [];

      // Only perform full setup if this is a root-level chat (not a child)
      if (!root) {
        // Collect all posts for root-level chat setup
        postOperations.push(
          // 1. Post membership record to user's channel
          graffiti.post(
            {
              value: {
                action: 'Membership',
                value: 'Join',
                chatId: chatId,
                chatName: newChatName.value,
                published: now,
              },
              channels: [`user:${session.value.actor}:Membership`],
              allowed: []
            },
            session.value
          ),
          // 2. Post creation activity to chat channel
          graffiti.post(
            {
              value: {
                action: 'Create',
                chatId: chatId,
                chatName: newChatName.value,
                published: now,
                parentChatId: parentChatId,
                rootChatId: rootChatId,
              },
              channels: [`chat:${chatId}:Activities`],
            },
            session.value
          ),
          // 3. Post user membership to chat channel
          graffiti.post(
            {
              value: {
                action: 'Membership',
                value: 'Join',
                user: session.value.actor,
                published: now,
              },
              channels: [`chat:${chatId}:Membership`],
            },
            session.value
          )
        );
      }

      // Post chat creation to root chat's descendants channel
      postOperations.push(
        graffiti.post(
          {
            value: {
              action: 'Create',
              chatId: chatId,
              name: newChatName.value,
              published: now,
              parentChatId: parentChatId,
              rootChatId: rootChatId,
            },
            channels: [`chat:${rootChatId}:Descendants`],
          },
          session.value
        )
      );

      // Execute all posts in parallel for better performance
      await Promise.all(postOperations);

      // Show success message and clear input
      createSuccess.value = true;
      setTimeout(() => {
        createSuccess.value = false;
      }, 1500);

      newChatName.value = "";

    } catch (err) {
      createError.value = true;
    } finally {
      isCreating.value = false;
    }

    return !createError.value;
  }

  // ============================================================
  // ACTIONS - Rename Chat or Branch
  // ============================================================

  /**
   * Rename a root chat or branch by posting the newest display-name activity.
   * @param {string} chatId - Chat/branch ID to rename
   * @param {string} name - New display name
   * @param {string|null} rootChatId - Root chat ID for branch tree updates
   * @param {string|null} parentChatId - Parent chat ID for branch tree structure
   * @returns {boolean} Success status of rename operation
   */
  async function renameChat(chatId, name, rootChatId = null, parentChatId = null) {
    const trimmedName = name.trim();

    if (!session.value?.actor || !chatId || !trimmedName) return false;

    isRenaming.value = true;
    renameError.value = false;
    renameSuccess.value = false;

    try {
      const now = Date.now();
      const rootId = rootChatId ?? chatId;
      const parentId = parentChatId ?? chatId;
      const postOperations = [
        graffiti.post(
          {
            value: {
              action: 'Rename',
              chatId,
              name: trimmedName,
              published: now,
              parentChatId: parentId,
              rootChatId: rootId,
            },
            channels: [`chat:${rootId}:Descendants`],
          },
          session.value
        )
      ];

      if (chatId === rootId) {
        postOperations.push(
          graffiti.post(
            {
              value: {
                action: 'Rename',
                chatId,
                chatName: trimmedName,
                published: now,
                parentChatId: parentId,
                rootChatId: rootId,
              },
              channels: [`chat:${chatId}:Activities`],
            },
            session.value
          ),
          graffiti.post(
            {
              value: {
                action: 'Membership',
                value: 'Join',
                chatId,
                chatName: trimmedName,
                published: now,
              },
              channels: [`user:${session.value.actor}:Membership`],
              allowed: []
            },
            session.value
          )
        );
      }

      await Promise.all(postOperations);

      if (activeChatId.value === chatId) {
        activeChatName.value = trimmedName;
      }

      renameSuccess.value = true;
      setTimeout(() => {
        renameSuccess.value = false;
      }, 1500);
    } catch (err) {
      renameError.value = true;
    } finally {
      isRenaming.value = false;
    }

    return !renameError.value;
  }

  async function deleteBranch(chatId, rootChatId = null, parentChatId = null, name = "") {
    if (!session.value?.actor || !chatId || !rootChatId) return false;

    try {
      await graffiti.post(
        {
          value: {
            action: 'Delete',
            chatId,
            name,
            published: Date.now(),
            parentChatId: parentChatId ?? chatId,
            rootChatId,
          },
          channels: [`chat:${rootChatId}:Descendants`],
        },
        session.value
      );
    } catch (err) {
      return false;
    }

    return true;
  }

  /**
   * Upload and set an image for a root chat.
   * @param {string} chatId - Root chat ID
   * @param {File} file - Image file to upload
   * @returns {boolean} Success status of image update
   */
  async function updateChatImage(chatId, file) {
    if (!session.value?.actor || !chatId || !file) return false;

    renameError.value = false;

    try {
      const mediaUrl = await graffiti.postMedia(
        {
          data: file
        },
        session.value
      );

      const oldUrl = activeChatImageRawUrl.value;

      await graffiti.post(
        {
          value: {
            action: 'ChatImage',
            chatId,
            url: mediaUrl,
            published: Date.now(),
          },
          channels: [`chat:${chatId}:Activities`],
        },
        session.value
      );

      if (oldUrl) {
        try {
          await graffiti.deleteMedia(oldUrl, session.value);
        } catch (err) {
          console.log("Failed to delete old chat image:", err);
        }
      }
    } catch (err) {
      renameError.value = true;
    }

    return !renameError.value;
  }

  async function handleChatImageUpload(event, chatId = activeChatRootId.value) {
    const file = event.target.files[0];
    if (!file) return false;

    const success = await updateChatImage(chatId, file);
    event.target.value = "";
    return success;
  }


  // ============================================================
  // COMPUTED - Chat List (User's Active Chats)
  // ============================================================
  
  // Subscribe to user's membership activity channel
  const channels = computed(() => {
    return session.value ? [`user:${session.value.actor}:Membership`] : [];
  });

  // Discover all membership activities from Graffiti
  const { objects: activities } = useGraffitiDiscover(
    channels,
    {
      properties: {
        value: {
          required: ['action', 'value', 'chatId', 'published'],
          properties: {
            action: { type: 'string' },
            value: { type: 'string' }, // 'Join' or 'Leave'
            chatId: { type: 'string' },
            chatName: { type: 'string' },
            published: { type: 'number' },
          }
        }
      },
    },
    session,
    true
  );

  const activeChatActivityChannels = computed(() => {
    return session.value && activeChatRootId.value
      ? [`chat:${activeChatRootId.value}:Activities`]
      : [];
  });

  const { objects: activeChatActivities } = useGraffitiDiscover(
    activeChatActivityChannels,
    {
      properties: {
        value: {
          required: ['action', 'published'],
          properties: {
            action: { type: 'string' },
            chatId: { type: 'string' },
            url: { type: 'string' },
            published: { type: 'number' },
          }
        }
      },
    },
    session,
    true
  );

  const activeChatImageRawUrl = computed(() => {
    return activeChatActivities.value.reduce((latest, obj) => {
      if (
        obj.value.action !== 'ChatImage' ||
        obj.value.chatId !== activeChatRootId.value ||
        !obj.value.url
      ) {
        return latest;
      }

      if (!latest || latest.value.published < obj.value.published) {
        return obj;
      }

      return latest;
    }, null)?.value.url ?? null;
  });

  function cleanupActiveChatImage() {
    if (currentChatImageObjectUrl) {
      URL.revokeObjectURL(currentChatImageObjectUrl);
      currentChatImageObjectUrl = null;
    }
  }

  watch(
    () => activeChatImageRawUrl.value,
    async (url) => {
      if (!url) {
        cleanupActiveChatImage();
        activeChatImageUrl.value = null;
        return;
      }

      try {
        cleanupActiveChatImage();
        const blob = await graffiti.getMedia(url, session.value);
        currentChatImageObjectUrl = URL.createObjectURL(blob.data);
        activeChatImageUrl.value = currentChatImageObjectUrl;
      } catch (err) {
        console.error("Failed to load chat image:", err);
        activeChatImageUrl.value = null;
      }
    },
    { immediate: true }
  );

  /**
   * Compute list of active chats for the current user
   * Filters to only show chats where the latest action is 'Join'
   * (effectively hides left/deleted chats)
   */
  const chatList = computed(() => {
    // Find the most recent membership record for each chat
    const latestByChat = activities.value.reduce((acc, obj) => {
      const { chatId, published } = obj.value;

      if (!chatId || !published) return acc;

      const existing = acc[chatId];

      // Keep only the most recent activity for each chat
      if (!existing || existing.value.published < published) {
        acc[chatId] = obj;
      }

      return acc;
    }, {});

    // Filter to only show chats where user is currently joined
    const ret = Object.values(latestByChat).filter(
      chat => chat.value.value === 'Join'
    );

    return ret;
  });

  const chatActivityChannels = computed(() => {
    return session.value
      ? chatList.value.map(chat => `chat:${chat.value.chatId}:Activities`)
      : [];
  });

  const { objects: chatImageActivities } = useGraffitiDiscover(
    chatActivityChannels,
    {
      properties: {
        value: {
          required: ['action', 'chatId', 'published'],
          properties: {
            action: { type: 'string' },
            chatId: { type: 'string' },
            url: { type: 'string' },
            published: { type: 'number' },
          }
        }
      },
    },
    session,
    true
  );

  const chatImageRawByChat = computed(() => {
    return chatImageActivities.value.reduce((acc, obj) => {
      const { action, chatId, url, published } = obj.value;

      if (action !== 'ChatImage' || !chatId || !url || !published) return acc;

      if (!acc[chatId] || acc[chatId].published < published) {
        acc[chatId] = { url, published };
      }

      return acc;
    }, {});
  });

  const chatImageUrls = ref({});
  const chatImageObjectUrls = new Map();

  watch(
    chatImageRawByChat,
    async (imagesByChat) => {
      const nextUrls = {};
      const activeUrls = new Set();

      for (const [chatId, image] of Object.entries(imagesByChat)) {
        activeUrls.add(image.url);

        if (!chatImageObjectUrls.has(image.url)) {
          try {
            const blob = await graffiti.getMedia(image.url, session.value);
            chatImageObjectUrls.set(image.url, URL.createObjectURL(blob.data));
          } catch (err) {
            console.error("Failed to load chat list image:", err);
            chatImageObjectUrls.set(image.url, null);
          }
        }

        nextUrls[chatId] = chatImageObjectUrls.get(image.url);
      }

      for (const [url, objectUrl] of chatImageObjectUrls.entries()) {
        if (!activeUrls.has(url)) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          chatImageObjectUrls.delete(url);
        }
      }

      chatImageUrls.value = nextUrls;
    },
    { immediate: true }
  );


  // ============================================================
  // UTILITY - Wait for Graffiti Activities with Timeout
  // ============================================================
  
  /**
   * Helper to wait for activities to populate with a timeout
   * Prevents infinite waiting for data that may not load
   * @param {Array} activities - Reactive activities array to monitor
   * @param {number} timeout - Milliseconds to wait before resolving empty
   * @returns {Promise<Array>} Resolves with activities or empty array
   */
  function waitForActivities(activities, timeout = 2000) {
    return new Promise(resolve => {
      const stop = watch(activities, (val) => {
        if (val.length > 0) {
          stop();
          resolve(val);
        }
      }, { immediate: true });

      const timer = setTimeout(() => {
        stop();
        resolve([]);
      }, timeout);
    });
  }

  /**
   * Find the most recent Create action in activities
   * Returns null if latest action is Delete (chat was deleted)
   * @param {Array} activities - Array of activity objects
   * @returns {Object|null} Latest chat creation object or null
   */
  function findLatestCreateAction(activities) {
    return activities.reduce((latest, obj) => {
      if (!latest || latest.value.published < obj.value.published) {
        return obj;
      }
      return latest;
    }, null)?.value.action !== 'Delete' ? activities.reduce((latest, obj) => {
      if (!latest || latest.value.published < obj.value.published) {
        return obj;
      }
      return latest;
    }, null) : null;
  }

  // ============================================================
  // ACTIONS - Join Existing Chat
  // ============================================================
  
  /**
   * Join an existing chat by its ID
   * Validates chat exists before adding user to membership
   * @returns {boolean} Success status of join operation
   */
  async function joinChat() {
    // Validate user is logged in and chat ID is provided
    if (!session.value.actor || !joinChatId.value) return false;

    // Reset status flags
    isJoining.value = true;
    joinError.value = false;
    joinSuccess.value = false;

    try {
      // Check if chat exists by querying its activity log
      const { objects: activities } = useGraffitiDiscover(
        () => [`chat:${joinChatId.value}:Activities`],
        {
          properties: {
            value: {
              required: ['action', 'chatId', 'chatName', 'published', 'parentChatId', 'rootChatId'],
              properties: {
                action: { type: 'string', enum: ['Create', 'Delete', 'Rename'] },
                parentChatId: { type: 'string' },
                chatId: { type: 'string' },
                chatName: { type: 'string' },
                published: { type: 'number' },
                rootChatId: { type: 'string' }
              }
            }
          },
        },
        session,
        true
      );

      // Wait for activities to load, with fallback timeout
      const acts = await waitForActivities(activities);
      const chat = findLatestCreateAction(acts);

      if (chat != null) {
        // Prepare timestamp for all operations
        const now = Date.now();

        // Post both membership updates in parallel for better performance
        await Promise.all([
          // Post join membership to chat's membership channel
          graffiti.post(
            {
              value: {
                action: 'Membership',
                value: 'Join',
                user: session.value.actor,
                published: now,
              },
              channels: [`chat:${joinChatId.value}:Membership`],
            },
            session.value
          ),
          // Post join membership to user's membership channel
          graffiti.post(
            {
              value: {
                action: 'Membership',
                value: 'Join',
                chatId: joinChatId.value,
                chatName: chat.value.chatName,
                published: now,
              },
              channels: [`user:${session.value.actor}:Membership`],
              allowed: []
            },
            session.value
          )
        ]);

        // Show success and clear input
        joinSuccess.value = true;
        setTimeout(() => {
          joinSuccess.value = false;
        }, 1500);
        joinChatId.value = '';
      } else {
        // Chat doesn't exist or was deleted
        joinError.value = true;
      }
    } catch (err) {
      joinError.value = true;
    } finally {
      isJoining.value = false;
    }

    return !joinError.value;
  }


  // ============================================================
  // ACTIONS - Leave Chat
  // ============================================================
  
  /**
   * Leave an existing chat
   * Posts leave action to membership channels and clears active chat state
   * @param {string|null} chatId - ID of chat to leave
   * @returns {boolean} Success status of leave operation
   */
  async function leaveChat(chatId = null) {
    // Validate user is logged in and chat ID is provided
    if (!session.value.actor || chatId === null) return false;

    // Reset status flags
    isLeaving.value = true;
    leaveError.value = false;
    leaveSuccess.value = false;

    try {
      const now = Date.now();

      // Post both leave actions in parallel
      await Promise.all([
        // 1. Post leave action to chat's membership channel
        graffiti.post(
          {
            value: {
              action: 'Membership',
              value: 'Leave',
              user: session.value.actor,
              published: now,
            },
            channels: [`chat:${chatId}:Membership`],
          },
          session.value
        ),
        // 2. Post leave action to user's membership channel
        graffiti.post(
          {
            value: {
              action: 'Membership',
              value: 'Leave',
              chatId: chatId,
              published: now,
            },
            channels: [`user:${session.value.actor}:Membership`],
            allowed: []
          },
          session.value
        )
      ]);

      // Clear active chat state if leaving the currently open chat
      if (activeChatId.value === chatId) {
        activeChatId.value = null;
        activeChatName.value = null;
        activeChatRootId.value = null;
        activeChatParentId.value = null;
      }

      // Show success message
      leaveSuccess.value = true;
      setTimeout(() => {
        leaveSuccess.value = false;
      }, 1500);
    } catch (err) {
      leaveError.value = true;
    } finally {
      isLeaving.value = false;
    }

    return !leaveError.value;
  }

  // ============================================================
  // EXPORTS - Store API
  // ============================================================
  
  // Return public API for use in components
  return {
    // Active chat state
    activeChatId,
    activeChatName,
    activeChatRootId,
    activeChatParentId,
    activeChatImageUrl,
    chatImageUrls,

    // Chat list
    chatList,

    // Create chat
    newChatName,
    createNewChat,
    isCreating,
    createError,
    createSuccess,

    // Join chat
    joinChatId,
    joinChat,
    isJoining,
    joinError,
    joinSuccess,

    // Leave chat
    leaveChat,
    isLeaving,
    leaveError,
    leaveSuccess,

    // Rename chat
    renameChat,
    deleteBranch,
    updateChatImage,
    handleChatImageUpload,
    isRenaming,
    renameError,
    renameSuccess
  };
});


