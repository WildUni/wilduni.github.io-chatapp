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
import { useProfileCacheStore } from "./profileCache.js";

// ============================================================
// PINIA STORE - Chat State Management
// ============================================================
export const useChatStore = defineStore("chat", () => {
  // Access Graffiti API and user session
  const graffiti = useGraffiti();
  const session = useGraffitiSession();
  const profileCache = useProfileCacheStore();

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
  const activeChatImageLoading = ref(false);
  const replyTarget = ref(null);
  const editTarget = ref(null);
  const mentionRequest = ref(null);
  let currentChatImageObjectUrl = null;
  const successTimers = {
    create: null,
    join: null,
    leave: null,
    rename: null,
  };

  function setTimedSuccess(flag, key) {
    flag.value = true;
    clearTimeout(successTimers[key]);
    successTimers[key] = setTimeout(() => {
      flag.value = false;
      successTimers[key] = null;
    }, 1500);
  }

  function isOwnObject(obj) {
    return obj?.actor === session.value?.actor;
  }

  async function deleteOwnObjects(objects) {
    const urls = [...new Set(
      objects
        .filter(obj => isOwnObject(obj) && obj.url)
        .map(obj => obj.url)
    )];

    await Promise.all(
      urls.map(url =>
        graffiti.delete(url, session.value).catch(() => null)
      )
    );
  }

  async function deleteOwnUserMembershipObjects(chatId, keepUrl = null) {
    if (!chatId) return;

    await deleteOwnObjects(
      activities.value.filter(obj =>
        obj.value?.action === 'Membership' &&
        obj.value?.chatId === chatId &&
        obj.url !== keepUrl
      )
    );
  }

  async function compactOwnUserMembership(chatId, keepObject = null) {
    if (!chatId) return;
    await deleteOwnUserMembershipObjects(chatId, keepObject?.url ?? null);
  }

  async function deleteOwnChatMembershipObjects(chatId, keepUrl = null) {
    if (!chatId) return;

    await deleteOwnObjects(
      allMembershipActivities.value.filter(obj =>
        getMembershipChatId(obj) === chatId &&
        obj.value?.action === 'Membership' &&
        obj.value?.user === session.value?.actor &&
        obj.url !== keepUrl
      )
    );
  }

  async function postUserMembershipJoin(chatId, chatName, published = Date.now()) {
    const joinObject = await graffiti.post(
      {
        value: {
          action: 'Membership',
          value: 'Join',
          chatId,
          chatName,
          published,
        },
        channels: [`user:${session.value.actor}:Membership`],
        allowed: []
      },
      session.value
    );

    compactOwnUserMembership(chatId, joinObject);
    return joinObject;
  }

  async function postChatMembershipJoin(chatId, published = Date.now()) {
    const joinObject = await graffiti.post(
      {
        value: {
          action: 'Membership',
          value: 'Join',
          user: session.value.actor,
          published,
        },
        channels: [`chat:${chatId}:Membership`],
      },
      session.value
    );

    compactOwnChatMembership(chatId, joinObject);
    return joinObject;
  }

  async function compactOwnChatMembership(chatId, keepObject = null) {
    if (!chatId) return;
    await deleteOwnChatMembershipObjects(chatId, keepObject?.url ?? null);
  }

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
    const trimmedChatName = newChatName.value.trim();

    if (root && !trimmedChatName) return false;

    // Reset status flags
    isCreating.value = true;
    createError.value = false;
    createSuccess.value = false;

    // Generate unique IDs for chat hierarchy
    const chatId = crypto.randomUUID();
    const parentChatId = parent ? parent : chatId;
    const rootChatId = root ? root : chatId;
    console.log(trimmedChatName, parentChatId, rootChatId)

    try {
      const now = Date.now();
      const postOperations = [];

      // Only perform full setup if this is a root-level chat (not a child)
      if (!root) {
        // Collect all posts for root-level chat setup
        postOperations.push(
          // 1. Post membership record to user's channel
          postUserMembershipJoin(chatId, trimmedChatName, now),
          // 2. Post creation activity to chat channel
          graffiti.post(
            {
              value: {
                action: 'Create',
                chatId: chatId,
                chatName: trimmedChatName,
                published: now,
                parentChatId: parentChatId,
                rootChatId: rootChatId,
              },
              channels: [`chat:${chatId}:Activities`],
            },
            session.value
          ),
          // 3. Post user membership to chat channel
          postChatMembershipJoin(chatId, now)
        );
      }

      // Post chat creation to root chat's descendants channel
      postOperations.push(
        graffiti.post(
          {
            value: {
              action: 'Create',
              chatId: chatId,
              name: trimmedChatName,
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
      setTimedSuccess(createSuccess, "create");

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
          postUserMembershipJoin(chatId, trimmedName, now)
        );
      }

      await Promise.all(postOperations);

      if (activeChatId.value === chatId) {
        activeChatName.value = trimmedName;
      }

      setTimedSuccess(renameSuccess, "rename");
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
  const { objects: activities, isFirstPoll: isMembershipFirstPoll } = useGraffitiDiscover(
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

  const compactingUserMembershipChats = new Set();

  watch(
    () => activities.value.map(obj => `${obj.url}:${obj.value.chatId}:${obj.value.value}:${obj.value.published}`).join('|'),
    async () => {
      if (!session.value?.actor || isMembershipFirstPoll.value) return;

      const latestByChat = activities.value.reduce((acc, obj) => {
        const { chatId, published } = obj.value;
        if (!chatId || !published || !isOwnObject(obj)) return acc;
        if (!acc[chatId] || acc[chatId].value.published < published) acc[chatId] = obj;
        return acc;
      }, {});

      await Promise.all(
        Object.entries(latestByChat).map(async ([chatId, latest]) => {
          if (compactingUserMembershipChats.has(chatId)) return;
          compactingUserMembershipChats.add(chatId);

          try {
            if (latest.value.value === 'Join') {
              await compactOwnUserMembership(chatId, latest);
            } else {
              await deleteOwnUserMembershipObjects(chatId);
            }
          } finally {
            compactingUserMembershipChats.delete(chatId);
          }
        })
      );
    },
    { immediate: true }
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
        activeChatImageLoading.value = false;
        return;
      }

      try {
        cleanupActiveChatImage();
        activeChatImageLoading.value = true;
        const blob = await graffiti.getMedia(url, session.value);
        currentChatImageObjectUrl = URL.createObjectURL(blob.data);
        activeChatImageUrl.value = currentChatImageObjectUrl;
      } catch (err) {
        console.error("Failed to load chat image:", err);
        activeChatImageUrl.value = null;
      } finally {
        activeChatImageLoading.value = false;
      }
    },
    { immediate: true }
  );

  /**
   * Compute list of active chats for the current user
   * New membership state is represented by the presence of Join objects.
   * The legacy reducer path keeps old Join/Leave logs correct while compaction deletes them.
   */
  const joinedChatList = computed(() => {
    if (activities.value.every(obj => obj.value.value === 'Join')) {
      const seenChatIds = new Set();
      let hasDuplicateChat = false;

      for (const obj of activities.value) {
        const chatId = obj.value.chatId;
        if (!chatId) continue;
        if (seenChatIds.has(chatId)) {
          hasDuplicateChat = true;
          break;
        }
        seenChatIds.add(chatId);
      }

      if (!hasDuplicateChat) {
        return activities.value
          .filter(obj => obj.value.chatId)
          .sort((a, b) => b.value.published - a.value.published);
      }
    }

    if (activities.value.every(obj => obj.value.value === 'Join')) {
      const latestByChat = activities.value
        .reduce((latestByChat, obj) => {
          const { chatId, published } = obj.value;
          if (!chatId || !published) return latestByChat;
          if (!latestByChat[chatId] || latestByChat[chatId].value.published < published) {
            latestByChat[chatId] = obj;
          }
          return latestByChat;
        }, {});

      return Object.values(latestByChat);
    }

    const latestByChat = activities.value.reduce((acc, obj) => {
      const { chatId, published } = obj.value;

      if (!chatId || !published) return acc;

      const existing = acc[chatId];

      if (!existing || existing.value.published < published) {
        acc[chatId] = obj;
      }

      return acc;
    }, {});

    return Object.values(latestByChat).filter(
      chat => chat.value.value === 'Join'
    );
  });

  const isBaseChatListLoading = computed(() => {
    return session.value === undefined || isMembershipFirstPoll.value;
  });

  const shouldLoadChatNames = computed(() => {
    return session.value && !isBaseChatListLoading.value && joinedChatList.value.length > 0;
  });

  const allMembershipChannels = computed(() => {
    return shouldLoadChatNames.value
      ? joinedChatList.value.map(chat => `chat:${chat.value.chatId}:Membership`)
      : [];
  });

  const { objects: allMembershipActivities, isFirstPoll: isAllMembershipFirstPoll } = useGraffitiDiscover(
    allMembershipChannels,
    {
      properties: {
        value: {
          required: ['action', 'value', 'user', 'published'],
          properties: {
            action: { const: 'Membership' },
            value: { type: 'string' },
            user: { type: 'string' },
            published: { type: 'number' },
          }
        }
      },
    },
    session,
    true
  );

  function getMembershipChatId(obj) {
    const channels = [
      ...(obj.channels ?? []),
      ...(obj.object?.channels ?? []),
      obj.channel,
    ].filter(Boolean);
    const membershipChannel = channels.find(channel => /^chat:[^:]+:Membership$/.test(channel));

    return membershipChannel?.split(':')[1] ?? null;
  }

  const compactingChatMemberships = new Set();

  watch(
    () => allMembershipActivities.value.map(obj => `${obj.url}:${getMembershipChatId(obj)}:${obj.value.user}:${obj.value.value}:${obj.value.published}`).join('|'),
    async () => {
      if (!session.value?.actor || isAllMembershipFirstPoll.value) return;

      const latestOwnByChat = allMembershipActivities.value.reduce((acc, obj) => {
        const chatId = getMembershipChatId(obj);
        const { user, published } = obj.value;
        if (!chatId || user !== session.value.actor || !published || !isOwnObject(obj)) return acc;
        if (!acc[chatId] || acc[chatId].value.published < published) acc[chatId] = obj;
        return acc;
      }, {});

      await Promise.all(
        Object.entries(latestOwnByChat).map(async ([chatId, latest]) => {
          if (compactingChatMemberships.has(chatId)) return;
          compactingChatMemberships.add(chatId);

          try {
            if (latest.value.value === 'Join') {
              await compactOwnChatMembership(chatId, latest);
            } else {
              await deleteOwnChatMembershipObjects(chatId);
            }
          } finally {
            compactingChatMemberships.delete(chatId);
          }
        })
      );
    },
    { immediate: true }
  );

  const memberActorsByChatId = computed(() => {
    if (allMembershipActivities.value.every(obj => obj.value.value === 'Join')) {
      const seenMemberships = new Set();
      let hasDuplicateMembership = false;

      for (const obj of allMembershipActivities.value) {
        const chatId = getMembershipChatId(obj);
        const user = obj.value.user;
        if (!chatId || !user) continue;
        const key = `${chatId}:${user}`;
        if (seenMemberships.has(key)) {
          hasDuplicateMembership = true;
          break;
        }
        seenMemberships.add(key);
      }

      if (hasDuplicateMembership) {
        return Object.fromEntries(
          Object.entries(
            allMembershipActivities.value.reduce((acc, obj) => {
              const chatId = getMembershipChatId(obj);
              const { user, published } = obj.value;
              if (!chatId || !user || !published) return acc;
              acc[chatId] ??= {};
              if (!acc[chatId][user] || acc[chatId][user].value.published < published) {
                acc[chatId][user] = obj;
              }
              return acc;
            }, {})
          ).map(([chatId, latestByUser]) => [
            chatId,
            Object.values(latestByUser)
              .sort((a, b) => a.value.published - b.value.published)
              .map(obj => obj.value.user),
          ])
        );
      }

      const joinedByChat = allMembershipActivities.value.reduce((acc, obj) => {
        const chatId = getMembershipChatId(obj);
        const { user, published } = obj.value;

        if (!chatId || !user || !published) return acc;

        acc[chatId] ??= [];
        acc[chatId].push(obj);
        return acc;
      }, {});

      return Object.fromEntries(
        Object.entries(joinedByChat).map(([chatId, joins]) => [
          chatId,
          joins
            .sort((a, b) => a.value.published - b.value.published)
            .map(obj => obj.value.user),
        ])
      );
    }

    const latestByChatAndUser = allMembershipActivities.value.reduce((acc, obj) => {
      const chatId = getMembershipChatId(obj);
      const { user, published } = obj.value;

      if (!chatId || !user || !published) return acc;

      acc[chatId] ??= {};
      if (!acc[chatId][user] || acc[chatId][user].value.published < published) {
        acc[chatId][user] = obj;
      }

      return acc;
    }, {});

    return Object.fromEntries(
      Object.entries(latestByChatAndUser).map(([chatId, latestByUser]) => [
        chatId,
        Object.values(latestByUser)
          .filter(obj => obj.value.value === 'Join')
          .sort((a, b) => a.value.published - b.value.published)
          .map(obj => obj.value.user),
      ])
    );
  });

  watch(
    memberActorsByChatId,
    (membersByChat) => {
      const users = new Set(session.value?.actor ? [session.value.actor] : []);

      for (const actors of Object.values(membersByChat)) {
        for (const actor of actors) users.add(actor);
      }

      profileCache.ensureUsers([...users]);
    },
    { immediate: true }
  );

  watch(
    () => session.value?.actor,
    (actor) => {
      if (actor) profileCache.ensureUsers([actor]);
    },
    { immediate: true }
  );

  function getProfileName(user) {
    return profileCache.getProfile(user).name || user;
  }

  const chatPreviewMembersByChatId = computed(() =>
    Object.fromEntries(
      Object.entries(memberActorsByChatId.value).map(([chatId, actors]) => [
        chatId,
        actors.slice(0, 4).map(user => ({
          user,
          profile: profileCache.getProfile(user),
        })),
      ])
    )
  );

  function getAutomaticChatName(chatId) {
    const memberActors = memberActorsByChatId.value[chatId] ?? [];
    const ownActor = session.value?.actor;

    if (memberActors.length === 2 && ownActor) {
      const otherActor = memberActors.find(user => user !== ownActor);
      if (otherActor) return getProfileName(otherActor);
    }

    if (memberActors.length > 0) {
      return memberActors.map(getProfileName).join(', ');
    }

    return ownActor ? getProfileName(ownActor) : 'Untitled chat';
  }

  const areChatNamesReady = computed(() => {
    if (isBaseChatListLoading.value) return false;
    if (joinedChatList.value.length === 0) return true;

    return joinedChatList.value.every((chat) => {
      if (chat.value.chatName) return true;
      if (!shouldLoadChatNames.value) return false;
      return !isAllMembershipFirstPoll.value;
    });
  });

  const chatList = computed(() => {
    return joinedChatList.value.map(chat => ({
      ...chat,
      value: {
        ...chat.value,
        displayChatName: chat.value.chatName || getAutomaticChatName(chat.value.chatId),
      },
    })).sort((a, b) => {
      const latestA = latestActivityAtByRootChatId.value[a.value.chatId] ?? a.value.published ?? 0;
      const latestB = latestActivityAtByRootChatId.value[b.value.chatId] ?? b.value.published ?? 0;

      return latestB - latestA;
    });
  });

  const chatActivityChannels = computed(() => {
    return session.value && areChatNamesReady.value
      ? joinedChatList.value.map(chat => `chat:${chat.value.chatId}:Activities`)
      : [];
  });

  const { objects: chatImageActivities, isFirstPoll: isChatActivitiesFirstPoll } = useGraffitiDiscover(
    chatActivityChannels,
    {
      properties: {
        value: {
          required: ['action', 'chatId', 'published'],
          properties: {
            action: { type: 'string' },
            chatId: { type: 'string' },
            url: { type: 'string' },
            content: { type: 'string' },
            user: { type: 'string' },
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
  const chatImageLoadingByChat = ref({});
  const chatImageObjectUrls = new Map();
  let chatImageLoadRun = 0;

  watch(
    chatImageRawByChat,
    async (imagesByChat) => {
      const run = ++chatImageLoadRun;
      const nextUrls = {};
      const nextLoading = {};
      const activeUrls = new Set();
      const imagesToLoad = [];

      for (const [chatId, image] of Object.entries(imagesByChat)) {
        activeUrls.add(image.url);

        if (!chatImageObjectUrls.has(image.url)) {
          nextLoading[chatId] = true;
          imagesToLoad.push([chatId, image.url]);
        }

        nextUrls[chatId] = chatImageObjectUrls.get(image.url);
        nextLoading[chatId] = false;
      }

      if (imagesToLoad.length > 0) {
        if (run === chatImageLoadRun) {
          chatImageLoadingByChat.value = {
            ...chatImageLoadingByChat.value,
            ...Object.fromEntries(imagesToLoad.map(([chatId]) => [chatId, true])),
          };
        }

        await Promise.all(
          imagesToLoad.map(async ([chatId, url]) => {
            try {
              const blob = await graffiti.getMedia(url, session.value);
              chatImageObjectUrls.set(url, URL.createObjectURL(blob.data));
            } catch (err) {
              console.error("Failed to load chat list image:", err);
              chatImageObjectUrls.set(url, null);
            }

            nextUrls[chatId] = chatImageObjectUrls.get(url);
            nextLoading[chatId] = false;
          })
        );
      }

      for (const [url, objectUrl] of chatImageObjectUrls.entries()) {
        if (!activeUrls.has(url)) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          chatImageObjectUrls.delete(url);
        }
      }

      if (run === chatImageLoadRun) {
        chatImageUrls.value = nextUrls;
        chatImageLoadingByChat.value = nextLoading;
      }
    },
    { immediate: true }
  );

  const latestMessageAtByChatId = computed(() => {
    return chatImageActivities.value.reduce((acc, obj) => {
      const { action, chatId, published } = obj.value;

      if (action !== 'LatestMessage' || !chatId || !published) return acc;

      acc[chatId] = Math.max(acc[chatId] ?? 0, published);
      return acc;
    }, {});
  });

  const latestIncomingMessageAtByChatId = computed(() => {
    return chatImageActivities.value.reduce((acc, obj) => {
      const { action, chatId, published, user } = obj.value;

      if (action !== 'LatestMessage' || !chatId || !published || user === session.value?.actor) return acc;

      acc[chatId] = Math.max(acc[chatId] ?? 0, published);
      return acc;
    }, {});
  });

  const latestActivityAtByRootChatId = computed(() => {
    return latestMessageAtByChatId.value;
  });

  watch(
    () => [...new Set(chatImageActivities.value
      .filter(obj => obj.value.action === 'LatestMessage')
      .map(message => message.value.user)
      .filter(Boolean))],
    (users) => profileCache.ensureUsers(users),
    { immediate: true }
  );

  const latestMessageByRootChatId = computed(() => {
    return chatImageActivities.value.reduce((acc, obj) => {
      const { action, chatId, content, published, user } = obj.value;

      if (action !== 'LatestMessage' || !chatId || !content || !published || !user) return acc;

      if (!acc[chatId] || acc[chatId].published < published) {
        acc[chatId] = {
          content,
          published,
          user,
          senderName: getProfileName(user),
        };
      }

      return acc;
    }, {});
  });

  const readReceiptChannels = computed(() => {
    return session.value ? [`user:${session.value.actor}:ReadReceipts`] : [];
  });

  const { objects: readReceipts } = useGraffitiDiscover(
    readReceiptChannels,
    {
      properties: {
        value: {
          required: ['action', 'chatId', 'published'],
          properties: {
            action: { const: 'Read' },
            chatId: { type: 'string' },
            published: { type: 'number' },
          }
        }
      },
    },
    session,
    true
  );

  const latestReadAtByChatId = computed(() => {
    return readReceipts.value.reduce((acc, obj) => {
      const { chatId, published } = obj.value;

      if (!chatId || !published) return acc;

      acc[chatId] = Math.max(acc[chatId] ?? 0, published);
      return acc;
    }, {});
  });

  const hasUnreadByChatId = computed(() => {
    return Object.fromEntries(
      Object.entries(latestIncomingMessageAtByChatId.value).map(([chatId, latestIncomingAt]) => [
        chatId,
        latestIncomingAt > (latestReadAtByChatId.value[chatId] ?? 0),
      ])
    );
  });

  const hasUnreadByRootChatId = computed(() => {
    return hasUnreadByChatId.value;
  });

  const areChatMessagesReady = computed(() => {
    return joinedChatList.value.length === 0 ||
      (areChatNamesReady.value && !isChatActivitiesFirstPoll.value);
  });

  const isChatListLoading = computed(() => {
    return isBaseChatListLoading.value || !areChatNamesReady.value;
  });

  async function recordLatestMessage(message) {
    if (!session.value?.actor || !message?.chatId || !message?.content) return false;

    try {
      const previewObject = await graffiti.post(
        {
          value: {
            action: 'LatestMessage',
            chatId: message.chatId,
            content: message.content,
            published: message.published ?? Date.now(),
            user: message.user ?? session.value.actor,
          },
          channels: [`chat:${message.chatId}:Activities`],
        },
        session.value
      );

      await deleteOwnObjects(
        chatImageActivities.value.filter(obj =>
          obj.value?.action === 'LatestMessage' &&
          obj.value?.chatId === message.chatId &&
          obj.url !== previewObject.url
        )
      );
    } catch (err) {
      return false;
    }

    return true;
  }

  async function markChatRead(chatId) {
    if (!session.value?.actor || !chatId) return false;

    try {
      await graffiti.post(
        {
          value: {
            action: 'Read',
            chatId,
            published: Date.now(),
          },
          channels: [`user:${session.value.actor}:ReadReceipts`],
          allowed: []
        },
        session.value
      );
    } catch (err) {
      return false;
    }

    return true;
  }

  function setReplyTarget(message) {
    editTarget.value = null;
    replyTarget.value = message;
  }

  function clearReplyTarget() {
    replyTarget.value = null;
  }

  function setEditTarget(message) {
    replyTarget.value = null;
    editTarget.value = message;
  }

  function clearEditTarget() {
    editTarget.value = null;
  }

  function queueMention(userName) {
    if (!userName) return;

    mentionRequest.value = {
      id: crypto.randomUUID(),
      text: `@${userName} `,
    };
  }


  // ============================================================
  // UTILITY - Wait for Graffiti Activities
  // ============================================================
  
  /**
   * Helper to wait for activities to populate or finish their first poll.
   * @param {Array} activities - Reactive activities array to monitor
   * @param {Ref<boolean>} isFirstPoll - Whether Graffiti is still loading initial data
   * @returns {Promise<Array>} Resolves with activities or empty array
   */
  function waitForActivities(activities, isFirstPoll) {
    return new Promise(resolve => {
      const stop = watch(
        () => [activities.value, isFirstPoll.value],
        ([val, firstPoll]) => {
          if (val.length > 0 || !firstPoll) {
            stop();
            resolve(val);
          }
        },
        { immediate: true }
      );
    });
  }

  /**
   * Find the most recent Create action in activities
   * Returns null if latest action is Delete (chat was deleted)
   * @param {Array} activities - Array of activity objects
   * @returns {Object|null} Latest chat creation object or null
   */
  function findLatestCreateAction(activities) {
    const latestActivity = activities.reduce((latest, obj) => {
      if (!latest || latest.value.published < obj.value.published) {
        return obj;
      }
      return latest;
    }, null);

    return latestActivity?.value.action !== 'Delete' ? latestActivity : null;
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
      const { objects: activities, isFirstPoll } = useGraffitiDiscover(
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

      // Wait until activities load or the first poll confirms there are none.
      const acts = await waitForActivities(activities, isFirstPoll);
      const chat = findLatestCreateAction(acts);

      if (chat != null) {
        // Prepare timestamp for all operations
        const now = Date.now();

        // Post both membership updates in parallel for better performance
        await Promise.all([
          // Post join membership to chat's membership channel
          postChatMembershipJoin(joinChatId.value, now),
          // Post join membership to user's membership channel
          postUserMembershipJoin(joinChatId.value, chat.value.chatName, now)
        ]);

        // Show success and clear input
        setTimedSuccess(joinSuccess, "join");
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
      await Promise.all([
        deleteOwnUserMembershipObjects(chatId),
        deleteOwnChatMembershipObjects(chatId),
      ]);

      // Clear active chat state if leaving the currently open chat
      if (activeChatId.value === chatId) {
        activeChatId.value = null;
        activeChatName.value = null;
        activeChatRootId.value = null;
        activeChatParentId.value = null;
      }

      // Show success message
      setTimedSuccess(leaveSuccess, "leave");
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
    activeChatImageLoading,
    replyTarget,
    editTarget,
    mentionRequest,
    chatImageUrls,
    chatImageLoadingByChat,
    chatPreviewMembersByChatId,

    // Chat list
    chatList,
    isChatListLoading,
    hasUnreadByChatId,
    hasUnreadByRootChatId,
    latestMessageByRootChatId,
    areChatMessagesReady,
    recordLatestMessage,
    markChatRead,
    setReplyTarget,
    clearReplyTarget,
    setEditTarget,
    clearEditTarget,
    queueMention,

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


