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


    try {
      // Only perform full setup if this is a root-level chat (not a child)
      if (!root) {
        // 1. Post membership record to user's channel (user learns about new chat)
        await graffiti.post(
          {
            value: {
              action: 'Membership',
              value: 'Join',
              chatId: chatId,
              chatName: newChatName.value,
              published: Date.now(),
            },
            channels: [`user:${session.value.actor}:Membership`],
            allowed: []
          },
          session.value
        );

        // 2. Post creation activity to chat channel (chat activity log)
        await graffiti.post(
          {
            value: {
              action: 'Create',
              chatId: chatId,
              chatName: newChatName.value,
              published: Date.now(),
              parentChatId: parentChatId,
              rootChatId: rootChatId,
            },
            channels: [`chat:${chatId}:Activities`],
          },
          session.value
        );

        // 3. Post user membership to chat channel (chat learns about user)
        await graffiti.post(
          {
            value: {
              action: 'Membership',
              value: 'Join',
              user: session.value.actor,
              published: Date.now(),
            },
            channels: [`chat:${chatId}:Membership`],
          },
          session.value
        );
      }

      // Post chat creation to root chat's descendants channel (for threaded chats)
      await graffiti.post(
        {
          value: {
            action: 'Create',
            chatId: chatId,
            name: newChatName.value,
            published: Date.now(),
            parentChatId: parentChatId,
            rootChatId: rootChatId,
          },
          channels: [`chat:${rootChatId}:Descendants`],
        },
        session.value
      );

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
                action: { type: 'string', enum: ['Create', 'Delete'] },
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

      /**
       * Wait for activities to load (with timeout)
       * Resolves with activities or empty array if timeout
       */
      function waitForActivities(timeout = 2000) {
        return new Promise(resolve => {
          const stop = watch(activities, (val) => {
            if (val.length > 0) {
              stop();
              resolve(val);
            }
          }, { immediate: true });

          setTimeout(() => {
            stop();
            resolve([]); // Treat timeout as no chat found
          }, timeout);
        });
      }

      /**
       * Check if chat exists by finding a Create action
       */
      async function checkChatExists() {
        const acts = await waitForActivities();

        // Find the most recent activity
        let latest = null;
        for (const obj of acts) {
          if (!latest || latest.value.published < obj.value.published) {
            latest = obj;
          }
        }

        // Return chat only if latest action is 'Create' (not deleted)
        return latest?.value.action === 'Create' ? latest : null;
      }

      // Validate chat exists
      const chat = await checkChatExists();

      if (chat != null) {
        // 1. Post join membership to chat's membership channel
        await graffiti.post(
          {
            value: {
              action: 'Membership',
              value: 'Join',
              user: session.value.actor,
              published: Date.now(),
            },
            channels: [`chat:${joinChatId.value}:Membership`],
          },
          session.value
        );

        // 2. Post join membership to user's membership channel
        await graffiti.post(
          {
            value: {
              action: 'Membership',
              value: 'Join',
              chatId: joinChatId.value,
              chatName: chat.value.chatName,
              published: Date.now(),
            },
            channels: [`user:${session.value.actor}:Membership`],
            allowed: []
          },
          session.value
        );

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
    // Reset status flags
    isLeaving.value = true;
    leaveError.value = false;
    leaveSuccess.value = false;

    // Validate user is logged in and chat ID is provided
    if (!session.value.actor || chatId === null) return false;

    try {
      // 1. Post leave action to chat's membership channel
      await graffiti.post(
        {
          value: {
            action: 'Membership',
            value: 'Leave',
            user: session.value.actor,
            published: Date.now(),
          },
          channels: [`chat:${chatId}:Membership`],
        },
        session.value
      );

      // 2. Post leave action to user's membership channel
      await graffiti.post(
        {
          value: {
            action: 'Membership',
            value: 'Leave',
            chatId: chatId,
            published: Date.now(),
          },
          channels: [`user:${session.value.actor}:Membership`],
          allowed: []
        },
        session.value
      );

      // Clear active chat state if leaving the currently open chat
      if (activeChatId.value === chatId) {
        activeChatId.value = null;
        activeChatName.value = null;
        activeChatRootId.value = null;
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
    leaveSuccess
  };
});


