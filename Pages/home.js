import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import loadChatList from "../Components/chatList.js";
import loadChatInput from "../Components/chatInput.js";
import loadChatFlow from "../Components/chatFlow.js";
import loadChatMembers from "../Components/chatMembers.js";
import loadProfile from "../Components/profile.js"
import loadCreateChatButton from '../Components/createChat.js'
import loadMediaAttachment from "../Components/mediaAttachment.js";

import { storeToRefs } from "pinia"
import { useChatStore } from "../stores/chat.js";
import { useProfileCacheStore } from "../stores/profileCache.js";

function setup() {
  const route = useRoute()
  const router = useRouter()
  const graffiti = useGraffiti();
  const session = useGraffitiSession();
  const chatStore = useChatStore();
  const profileCache = useProfileCacheStore();
  const {activeChatId, 
    activeChatName, 
    newChatName, 
    chatList, 
    activeChatRootId,
    activeChatParentId,
    activeChatImageUrl,
    activeChatImageLoading,
    isCreating,
    createError,
    createSuccess,
    isRenaming,
    renameError,
    isLeaving,
    leaveSuccess} = storeToRefs(chatStore)
  const editedActiveChatName = ref("");
  const branchName = ref("");
  const branchParent = ref(null);
  const showBranchPanel = ref(false);
  const showTimestampColumn = ref(false);
  const showChatInfo = ref(false);
  const showPinnedMessages = ref(false);
  const isCustomizeChatOpen = ref(false);
  const isMembersOpen = ref(false);
  const isMediaOpen = ref(false);
  const showRenameDialog = ref(false);
  const showBranchRenameDialog = ref(false);
  const showDeleteBranchDialog = ref(false);
  const showLeaveChatDialog = ref(false);
  const branchBeingRenamed = ref(null);
  const branchPendingDelete = ref(null);
  const branchDeleteConfirmation = ref("");
  const chatPendingLeave = ref(null);
  const editedBranchName = ref("");
  const mobileHomeView = ref("chats");
  const isMobilePortrait = ref(
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 760px) and (orientation: portrait)").matches
      : false
  );
  const mobilePortraitQuery = typeof window !== "undefined"
    ? window.matchMedia("(max-width: 760px) and (orientation: portrait)")
    : null;

  function updateMobilePortraitState(event) {
    isMobilePortrait.value = event.matches;
  }

  if (mobilePortraitQuery) {
    if (mobilePortraitQuery.addEventListener) {
      mobilePortraitQuery.addEventListener("change", updateMobilePortraitState);
    } else {
      mobilePortraitQuery.addListener(updateMobilePortraitState);
    }
  }

  onBeforeUnmount(() => {
    if (!mobilePortraitQuery) return;

    if (mobilePortraitQuery.removeEventListener) {
      mobilePortraitQuery.removeEventListener("change", updateMobilePortraitState);
    } else {
      mobilePortraitQuery.removeListener(updateMobilePortraitState);
    }
  });

  const branchParentName = computed(() => {
    return branchParent.value?.name || activeChatName.value || "No chat selected";
  });

  const hasBranchCreateTarget = computed(() => {
    return Boolean(branchParent.value?.id || activeChatId.value);
  });

  const branchChannels = computed(() => {
    return session.value && activeChatRootId.value
      ? [`chat:${activeChatRootId.value}:Descendants`]
      : [];
  });

  const { objects: branchActivities } = useGraffitiDiscover(
    branchChannels,
    {
      properties: {
        value: {
          required: ["action", "chatId", "name", "published", "parentChatId", "rootChatId"],
          properties: {
            action: { type: "string" },
            chatId: { type: "string" },
            name: { type: "string" },
            published: { type: "number" },
            parentChatId: { type: "string" },
            rootChatId: { type: "string" },
          },
        },
      },
    },
    session
  );

  const activeMessageChannels = computed(() =>
    session.value && activeChatId.value
      ? [`chat:${activeChatId.value}:Messages`]
      : []
  );

  const { objects: activeMessages } = useGraffitiDiscover(
    activeMessageChannels,
    {
      properties: {
        value: {
          required: ["action", "content", "published", "user"],
          properties: {
            action: { const: "Message" },
            chatId: { type: "string" },
            clientId: { type: "string" },
            content: { type: "string" },
            media: {
              type: "array",
              items: {
                type: "object",
                required: ["url", "type", "mimeType", "name", "size"],
                properties: {
                  url: { type: "string" },
                  type: { type: "string" },
                  mimeType: { type: "string" },
                  name: { type: "string" },
                  size: { type: "number" },
                  originalSize: { type: "number" },
                  width: { type: "number" },
                  height: { type: "number" },
                  duration: { type: "number" },
                },
              },
            },
            published: { type: "number" },
            user: { type: "string" },
          },
        },
      },
    },
    session
  );

  const activeMessageInteractionChannels = computed(() =>
    session.value && activeChatId.value
      ? [`chat:${activeChatId.value}:MessageInteractions`]
      : []
  );

  const { objects: activeMessageInteractions } = useGraffitiDiscover(
    activeMessageInteractionChannels,
    {
      properties: {
        value: {
          required: ["action", "messageId", "published", "user"],
          properties: {
            action: { type: "string" },
            chatId: { type: "string" },
            clientId: { type: "string" },
            messageId: { type: "string" },
            value: { type: "string" },
            published: { type: "number" },
            user: { type: "string" },
          },
        },
      },
    },
    session
  );

  const pendingPinnedMessageInteractions = ref([]);

  function getMessageId(message) {
    return message.url || message.value.clientId || `${message.value.user}:${message.value.published}`;
  }

  const activeMessageInteractionsInView = computed(() => [
    ...activeMessageInteractions.value,
    ...pendingPinnedMessageInteractions.value,
  ]);

  const pinnedMessageIds = computed(() => {
    const latestPinByMessage = {};

    for (const obj of activeMessageInteractionsInView.value) {
      const { action, messageId, published } = obj.value;
      if (action !== "MessagePin" || !messageId || !published) continue;

      const existing = latestPinByMessage[messageId];
      if (!existing || existing.value.published < published) {
        latestPinByMessage[messageId] = obj;
      }
    }

    return new Set(
      Object.entries(latestPinByMessage)
        .filter(([, obj]) => obj.value.value === "Pin")
        .map(([messageId]) => messageId)
    );
  });

  const messageContentState = computed(() => {
    const latestEditByMessage = {};
    const latestRecallByMessage = {};

    for (const obj of activeMessageInteractionsInView.value) {
      const { action, messageId, published } = obj.value;
      if (!messageId || !published) continue;

      if (action === "MessageEdit") {
        latestEditByMessage[messageId] ??= {};
        const existing = latestEditByMessage[messageId][obj.value.user];
        if (!existing || existing.value.published < published) {
          latestEditByMessage[messageId][obj.value.user] = obj;
        }
      }

      if (action === "MessageRecall") {
        latestRecallByMessage[messageId] ??= {};
        const existing = latestRecallByMessage[messageId][obj.value.user];
        if (!existing || existing.value.published < published) {
          latestRecallByMessage[messageId][obj.value.user] = obj;
        }
      }
    }

    return {
      editByMessage: latestEditByMessage,
      recallByMessage: latestRecallByMessage,
    };
  });

  function getMessageDisplayState(message) {
    const messageId = getMessageId(message);
    const user = message.value.user;
    const edit = messageContentState.value.editByMessage[messageId]?.[user];
    const recall = messageContentState.value.recallByMessage[messageId]?.[user];
    const isRecalled = recall?.value.value === "Recall";
    const editedContent = edit?.value.value ?? null;

    return {
      isRecalled,
      isEdited: !isRecalled && typeof editedContent === "string" && editedContent !== message.value.content,
      displayContent: isRecalled ? "This message was recalled." : editedContent ?? message.value.content,
    };
  }

  const pinnedMessages = computed(() =>
    activeMessages.value
      .map(message => {
        const messageId = getMessageId(message);

        return {
          ...message,
          ...getMessageDisplayState(message),
          messageId,
          profile: profileCache.getProfile(message.value.user),
        };
      })
      .filter(message => pinnedMessageIds.value.has(message.messageId))
      .sort((a, b) => b.value.published - a.value.published)
  );

  async function unpinPinnedMessage(message) {
    if (!session.value?.actor || !activeChatId.value || !message?.messageId) return;

    const clientId = crypto.randomUUID();
    const interaction = {
      action: "MessagePin",
      value: "Unpin",
      clientId,
      messageId: message.messageId,
      chatId: activeChatId.value,
      published: Date.now(),
      user: session.value.actor,
    };

    pendingPinnedMessageInteractions.value.push({
      url: `pending-pinned-interaction:${clientId}`,
      value: interaction,
    });

    try {
      await graffiti.post(
        {
          value: interaction,
          channels: [`chat:${activeChatId.value}:MessageInteractions`],
        },
        session.value
      );
    } catch (err) {
      pendingPinnedMessageInteractions.value = pendingPinnedMessageInteractions.value.filter(
        pending => pending.value.clientId !== clientId
      );
      console.error("Failed to unpin message:", err);
    }
  }

  const recentMedia = computed(() =>
    activeMessages.value
      .flatMap(message => {
        const displayState = getMessageDisplayState(message);
        if (displayState.isRecalled) return [];

        return (message.value.media ?? []).map((attachment, index) => ({
          ...attachment,
          key: `${message.url || message.value.clientId || message.value.published}:${attachment.url}:${index}`,
          messageId: getMessageId(message),
          messageContent: displayState.displayContent,
          published: message.value.published,
          user: message.value.user,
          profile: profileCache.getProfile(message.value.user),
        }));
      })
      .sort((a, b) => b.published - a.published)
      .slice(0, 12)
  );

  watch(
    () => pinnedMessages.value.map(message => message.value.user),
    (users) => profileCache.ensureUsers(users),
    { immediate: true }
  );

  watch(
    activeMessageInteractions,
    (interactions) => {
      const confirmedClientIds = new Set(
        interactions.map(interaction => interaction.value.clientId).filter(Boolean)
      );

      pendingPinnedMessageInteractions.value = pendingPinnedMessageInteractions.value.filter(
        pending => !confirmedClientIds.has(pending.value.clientId)
      );
    },
    { immediate: true }
  );

  watch(
    () => recentMedia.value.map(media => media.user),
    (users) => profileCache.ensureUsers(users),
    { immediate: true }
  );

  const membershipChannels = computed(() => {
    const membershipChatId = activeChatRootId.value ?? activeChatId.value;
    return session.value && membershipChatId
      ? [`chat:${membershipChatId}:Membership`]
      : [];
  });

  const { objects: membershipActivities } = useGraffitiDiscover(
    membershipChannels,
    {
      properties: {
        value: {
          required: ["action", "value", "user", "published"],
          properties: {
            action: { const: "Membership" },
            value: { type: "string" },
            user: { type: "string" },
            published: { type: "number" },
          },
        },
      },
    },
    session,
    true,
  );

  const infoMemberActors = computed(() => {
    if (membershipActivities.value.every(obj => obj.value.value === "Join")) {
      const users = membershipActivities.value
        .filter(obj => obj.value.user && obj.value.published);
      const uniqueUsers = new Set(users.map(obj => obj.value.user));

      if (uniqueUsers.size === users.length) {
        return users
          .sort((a, b) => a.value.published - b.value.published)
          .map(obj => obj.value.user);
      }
    }

    const latestByUser = membershipActivities.value.reduce((acc, obj) => {
      const { user, published } = obj.value;
      if (!user || !published) return acc;

      if (!acc[user] || acc[user].value.published < published) {
        acc[user] = obj;
      }

      return acc;
    }, {});

    return Object.values(latestByUser)
      .filter(obj => obj.value.value === "Join")
      .sort((a, b) => a.value.published - b.value.published)
      .map(obj => obj.value.user);
  });

  watch(infoMemberActors, (users) => {
    profileCache.ensureUsers(users);
  }, { immediate: true });

  const infoMembers = computed(() =>
    infoMemberActors.value.map(user => ({
      user,
      profile: profileCache.getProfile(user),
    })),
  );

  const previewMembers = computed(() => infoMembers.value.slice(0, 4));

  const activeChatAvatar = computed(() => {
    if (activeChatImageLoading.value) {
      return {
        type: "loading",
        imageUrl: null,
        members: [],
      };
    }

    if (activeChatImageUrl.value) {
      return {
        type: "image",
        imageUrl: activeChatImageUrl.value,
        members: [],
      };
    }

    if (previewMembers.value.length > 0) {
      return {
        type: "members",
        imageUrl: null,
        members: previewMembers.value,
      };
    }

    return {
      type: "empty",
      imageUrl: null,
      members: [],
    };
  });

  const branchMap = computed(() => {
    return branchActivities.value.reduce((acc, obj) => {
      const v = obj.value;

      if (
        (v.action !== "Create" && v.action !== "Rename" && v.action !== "Delete") ||
        !v.chatId ||
        !v.parentChatId ||
        !v.rootChatId ||
        !v.published
      ) {
        return acc;
      }

      const existing = acc[v.chatId];

      if (!existing || existing.published < v.published) {
        acc[v.chatId] = {
          ...existing,
          ...v,
        };
      }

      return acc;
    }, {});
  });

  const chatListMap = computed(() => {
    return chatList.value.reduce((acc, chat) => {
      acc[chat.value.chatId] = chat.value;
      return acc;
    }, {});
  });

  const activeChatRootName = computed(() => {
    const rootChat = chatListMap.value[activeChatRootId.value];
    return rootChat?.displayChatName
      ?? rootChat?.chatName
      ?? (activeChatId.value === activeChatRootId.value ? activeChatName.value : null)
      ?? "Untitled chat";
  });

  function getBreadcrumbNode(chatId) {
    if (!chatId) return null;

    const branch = branchMap.value[chatId];
    const chat = chatListMap.value[chatId];

    if (branch?.action === "Delete") return null;
    if (!branch && !chat && chatId !== activeChatId.value) return null;

    return {
      id: chatId,
      name: branch?.name || chat?.displayChatName || chat?.chatName || (chatId === activeChatId.value ? activeChatName.value : null) || "Untitled chat",
      rootChatId: branch?.rootChatId || chat?.rootChatId || activeChatRootId.value || chatId,
      parentChatId: branch?.parentChatId || chat?.parentChatId || chatId,
    };
  }

  const fullBreadcrumb = computed(() => {
    const trail = [];
    const visited = new Set();
    let chatId = activeChatId.value;

    while (chatId && !visited.has(chatId)) {
      visited.add(chatId);

      const node = getBreadcrumbNode(chatId);
      if (!node) break;

      trail.unshift(node);

      if (node.parentChatId === chatId) break;
      chatId = node.parentChatId;
    }

    return trail;
  });

  const chatBreadcrumb = computed(() => {
    const needsEllipsis = fullBreadcrumb.value.length > 3;
    const visibleItems = needsEllipsis
      ? fullBreadcrumb.value.slice(-3)
      : [...fullBreadcrumb.value];
    const items = needsEllipsis
      ? [
        {
          ...visibleItems[0],
          displayName: "...",
          isEllipsis: true,
          showAvatar: true,
        },
        ...visibleItems.map(item => ({
          ...item,
          showAvatar: false,
        })),
      ]
      : visibleItems.map((item, index) => ({
        ...item,
        showAvatar: index === 0,
      }));

    return items.map(item => ({
      ...item,
      displayName: item.displayName || item.name,
    }));
  });

  const mobileChatHeader = computed(() => {
    const rootName = activeChatRootName.value || activeChatName.value || "Untitled chat";

    if (!activeChatId.value || activeChatId.value === activeChatRootId.value) {
      return {
        title: rootName,
        subtitle: "",
      };
    }

    const activeNode = getBreadcrumbNode(activeChatId.value);
    const branchName = activeNode?.name || activeChatName.value || "Untitled branch";

    return {
      title: rootName,
      subtitle: branchName && branchName !== rootName ? branchName : "",
    };
  });

  const mobileChatHeaderTitle = computed(() => mobileChatHeader.value.title);
  const mobileChatHeaderSubtitle = computed(() => mobileChatHeader.value.subtitle);

  const mobileBranchOptions = computed(() => {
    const rootId = activeChatRootId.value || activeChatId.value;
    if (!rootId) return [];

    const options = [];
    const visited = new Set();

    function collect(chatId, depth = 0) {
      if (!chatId || visited.has(chatId)) return;
      visited.add(chatId);

      const node = getBreadcrumbNode(chatId);
      if (!node) return;

      options.push({
        ...node,
        depth,
      });

      Object.values(branchMap.value)
        .filter(branch =>
          branch.action !== "Delete" &&
          branch.rootChatId === rootId &&
          branch.parentChatId === chatId &&
          branch.chatId !== chatId
        )
        .sort((a, b) => a.published - b.published)
        .forEach(branch => collect(branch.chatId, depth + 1));
    }

    collect(rootId);
    return options;
  });

  const branchPendingDeleteSubtree = computed(() => {
    const branch = branchPendingDelete.value;
    if (!branch) return [];

    const descendants = [];
    const visited = new Set();

    function collect(node) {
      if (!node?.id || visited.has(node.id)) return;

      visited.add(node.id);
      descendants.push(node);

      for (const child of node.children ?? []) {
        collect(child);
      }
    }

    collect(branch);
    return descendants;
  });

  const branchPendingDeleteSubBranchCount = computed(() =>
    Math.max(0, branchPendingDeleteSubtree.value.length - 1)
  );

  const branchDeleteRequiresConfirmation = computed(() =>
    branchPendingDeleteSubBranchCount.value > 0
  );

  const canConfirmBranchDelete = computed(() =>
    !branchDeleteRequiresConfirmation.value ||
    branchDeleteConfirmation.value.trim() === "DELETE"
  );

  watch(
    activeChatName,
    (name) => {
      editedActiveChatName.value = name ?? "";
    },
    { immediate: true }
  );

  watch(
    activeChatId,
    (chatId) => {
      if (!chatId) {
        showChatInfo.value = false;
        showPinnedMessages.value = false;
        mobileHomeView.value = "chats";
      }
    }
  );

  /**
   * Set active chat and update route
   * Chat-list selections pass their own chat ID as rootId.
   * Branch-tree selections pass the branch ID as chatId and keep the original rootId.
   */
  function setActiveChat(chatId, chatName, rootId, parentId) {
    activeChatId.value = chatId;
    activeChatName.value = chatName;
    activeChatRootId.value = rootId ?? chatId;
    activeChatParentId.value = parentId ?? chatId;
    router.push({ name: "chat", params: { chatId } });
  }

  /**
   * Clear active chat selection
   */
  function clearActive() {
    setActiveChat(null, null, null);
  }

  function openMobileChats() {
    mobileHomeView.value = "chats";
  }

  function openMobileProfile() {
    mobileHomeView.value = "profile";
  }

  function openMobileChatList() {
    closeDetailPanels();
    router.push({ name: "home" });
  }

  function closeDetailPanels() {
    showChatInfo.value = false;
    showPinnedMessages.value = false;
  }

  /**
   * Leave active chat and navigate home
   */
  async function leaveActiveChat(chatId) {
    await chatStore.leaveChat(chatId);
    router.push({ name: "home" });
  }

  function openLeaveChatDialog() {
    if (!activeChatRootId.value) return;

    chatPendingLeave.value = {
      id: activeChatRootId.value,
      name: activeChatRootName.value,
    };
    showLeaveChatDialog.value = true;
  }

  async function confirmLeaveChat() {
    const chat = chatPendingLeave.value;
    if (!chat?.id) return;

    const success = await chatStore.leaveChat(chat.id);

    if (success) {
      showLeaveChatDialog.value = false;
      chatPendingLeave.value = null;
      router.push({ name: "home" });
    }
  }

  async function renameActiveChat() {
    if (!activeChatId.value || !editedActiveChatName.value) return;

    const success = await chatStore.renameChat(
      activeChatId.value,
      editedActiveChatName.value,
      activeChatRootId.value,
      activeChatParentId.value
    );

    if (success) {
      editedActiveChatName.value = activeChatName.value ?? editedActiveChatName.value;
      showRenameDialog.value = false;
    }
  }

  function openRenameDialog() {
    editedActiveChatName.value = activeChatName.value ?? "";
    showRenameDialog.value = true;
  }

  function openBranchRenameDialog(branch) {
    if (!branch?.id || branch.id === branch.rootChatId) return;

    branchBeingRenamed.value = branch;
    editedBranchName.value = branch.name ?? "";
    showBranchRenameDialog.value = true;
  }

  async function renameSelectedBranch() {
    const branch = branchBeingRenamed.value;

    if (!branch?.id || !editedBranchName.value.trim()) return;

    const success = await chatStore.renameChat(
      branch.id,
      editedBranchName.value,
      branch.rootChatId,
      branch.parentChatId
    );

    if (success) {
      showBranchRenameDialog.value = false;
      branchBeingRenamed.value = null;
      editedBranchName.value = "";
    }
  }

  async function uploadActiveChatImage(event) {
    await chatStore.handleChatImageUpload(event, activeChatRootId.value);
  }

  async function openBranchPanel(parent = null) {
    branchParent.value = parent;
    showBranchPanel.value = true;
  }

  function closeBranchPanel() {
    showBranchPanel.value = false;
  }

  async function createBranchUnderActiveChat() {
    const name = branchName.value.trim();

    const parentId = branchParent.value?.id || activeChatId.value;
    const rootId = branchParent.value?.rootChatId || activeChatRootId.value;

    if (!name || !parentId || !rootId) return;

    const previousChatName = newChatName.value;
    newChatName.value = name;

    try {
      const success = await chatStore.createNewChat(
        parentId,
        rootId,
      );

      if (success) {
        branchName.value = "";
        branchParent.value = null;
        closeBranchPanel();
      }
    } finally {
      newChatName.value = previousChatName;
    }
  }

  async function deleteBranch(branch) {
    if (!branch?.id || branch.id === branch.rootChatId) return;

    branchPendingDelete.value = branch;
    branchDeleteConfirmation.value = "";
    showDeleteBranchDialog.value = true;
  }

  function closeDeleteBranchDialog() {
    showDeleteBranchDialog.value = false;
    branchPendingDelete.value = null;
    branchDeleteConfirmation.value = "";
  }

  async function confirmDeleteBranch() {
    const branch = branchPendingDelete.value;

    if (!branch?.id || branch.id === branch.rootChatId) return;
    if (!canConfirmBranchDelete.value) return;

    const branchesToDelete = branchPendingDeleteSubtree.value;
    const deleteResults = await Promise.all(
      branchesToDelete.map(branchNode =>
        chatStore.deleteBranch(
          branchNode.id,
          branchNode.rootChatId,
          branchNode.parentChatId,
          branchNode.name
        )
      )
    );
    const success = deleteResults.every(Boolean);

    if (success && branchesToDelete.some(branchNode => branchNode.id === activeChatId.value)) {
      const rootChat = chatList.value.find(
        chat => chat.value.chatId === branch.rootChatId
      );

      setActiveChat(
        branch.rootChatId,
        rootChat?.value.displayChatName ?? rootChat?.value.chatName ?? "Untitled chat",
        branch.rootChatId,
        branch.rootChatId
      );
    }

    if (success) {
      closeDeleteBranchDialog();
    }
  }

  function toggleTimestampColumn() {
    showTimestampColumn.value = !showTimestampColumn.value;
  }

  function toggleChatInfo() {
    if (!showChatInfo.value) showPinnedMessages.value = false;
    showChatInfo.value = !showChatInfo.value;
  }

  function togglePinnedMessages() {
    if (!showPinnedMessages.value) showChatInfo.value = false;
    showPinnedMessages.value = !showPinnedMessages.value;
  }

  function navigateBreadcrumb(item) {
    if (!item?.id || item.isEllipsis || item.id === activeChatId.value) return;

    setActiveChat(item.id, item.name, item.rootChatId, item.parentChatId);
  }

  function closeMobileBranchDropdown(event) {
    const dropdown = event?.currentTarget?.closest?.("wa-dropdown");
    if (dropdown) dropdown.open = false;
  }

  function selectMobileBranch(branch, event) {
    if (!branch) return;

    if (branch.id === activeChatId.value) {
      closeMobileBranchDropdown(event);
      return;
    }

    setActiveChat(branch.id, branch.name, branch.rootChatId, branch.parentChatId);
    closeMobileBranchDropdown(event);
  }

  function createMobileBranch(branch, event) {
    if (!branch?.id) return;

    openBranchPanel(branch);
    closeMobileBranchDropdown(event);
  }

  /**
   * Combined watch: Handle route changes and update chat info from list
   * - Update active chat ID when route changes (page refresh support)
   * - Use chat list data for root chats
   * - Preserve the known root ID for branch chats, which are not in chatList
   */
  watch(
    () => [route.params.chatId, chatList.value, isMobilePortrait.value],
    ([chatId, chats]) => {
      const routeChatId = chatId || null;
      const knownActiveName = activeChatName.value;
      const knownRootId = activeChatRootId.value;
      const knownParentId = activeChatParentId.value;

      // Update active chat from route params
      activeChatId.value = routeChatId;

      if (!routeChatId) {
        const firstChat = chats?.[0]?.value;

        if (firstChat?.chatId && !isMobilePortrait.value) {
          router.replace({ name: "chat", params: { chatId: firstChat.chatId } });
          return;
        }

        activeChatName.value = null;
        activeChatRootId.value = null;
        activeChatParentId.value = null;
        return;
      }

      // Find and extract info from chat list
      if (chats) {
        const activeChat = chats.find(
          chat => chat.value.chatId === routeChatId
        );

        if (activeChat) {
          activeChatName.value = activeChat.value.displayChatName;
          activeChatRootId.value = activeChat.value.rootChatId ?? activeChat.value.chatId;
          activeChatParentId.value = activeChat.value.parentChatId ?? activeChat.value.chatId;
          return;
        }
      }

      activeChatName.value = knownActiveName;
      activeChatRootId.value = knownRootId ?? routeChatId;
      activeChatParentId.value = knownParentId ?? routeChatId;
    },
    { immediate: true }
  );

  return {
    setActiveChat,
    clearActive,
    mobileHomeView,
    isMobilePortrait,
    mobileChatHeaderTitle,
    mobileChatHeaderSubtitle,
    mobileBranchOptions,
    openMobileChats,
    openMobileProfile,
    openMobileChatList,
    closeDetailPanels,
    activeChatId,
    activeChatName,
    activeChatRootId,
    activeChatParentId,
    activeChatRootName,
    activeChatAvatar,
    infoMembers,
    previewMembers,
    branchName,
    branchParentName,
    showBranchPanel,
    hasBranchCreateTarget,
    chatBreadcrumb,
    isCreating,
    createError,
    createSuccess,
    openBranchPanel,
    closeBranchPanel,
    createBranchUnderActiveChat,
    deleteBranch,
    confirmDeleteBranch,
    branchPendingDelete,
    branchPendingDeleteSubBranchCount,
    branchDeleteRequiresConfirmation,
    branchDeleteConfirmation,
    canConfirmBranchDelete,
    showDeleteBranchDialog,
    closeDeleteBranchDialog,
    openBranchRenameDialog,
    renameSelectedBranch,
    editedBranchName,
    showBranchRenameDialog,
    editedActiveChatName,
    isRenaming,
    renameError,
    renameActiveChat,
    uploadActiveChatImage,
    createNewChat: chatStore.createNewChat,
    newChatName,
    leaveActiveChat,
    openLeaveChatDialog,
    confirmLeaveChat,
    chatPendingLeave,
    showLeaveChatDialog,
    isLeaving,
    leaveSuccess,
    showTimestampColumn,
    toggleTimestampColumn,
    showChatInfo,
    toggleChatInfo,
    showPinnedMessages,
    togglePinnedMessages,
    pinnedMessages,
    unpinPinnedMessage,
    isCustomizeChatOpen,
    isMembersOpen,
    isMediaOpen,
    showRenameDialog,
    openRenameDialog,
    navigateBreadcrumb,
    selectMobileBranch,
    createMobileBranch,
    recentMedia
  }
}

export default async () => ({
  setup,
  components: {
    ChatList: await loadChatList(),
    ChatInput: await loadChatInput(),
    ChatFlow: await loadChatFlow(),
    ChatMembers: await loadChatMembers(),
    Profile: await loadProfile(),
    CreateChatButton: await loadCreateChatButton(),
    MediaAttachment: await loadMediaAttachment(),
  },
  template: await fetch(new URL("./home.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
