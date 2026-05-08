import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import loadChatList from "../Components/chatList.js";
import loadChatTree from "../Components/chatTree.js";
import loadChatInput from "../Components/chatInput.js";
import loadChatFlow from "../Components/chatFlow.js";
import loadChatMembers from "../Components/chatMembers.js";
import loadProfile from "../Components/profile.js"
import loadCreateChatButton from '../Components/createChat.js'

import { storeToRefs } from "pinia"
import { useChatStore } from "../stores/chat.js";
import { useProfileCacheStore } from "../stores/profileCache.js";

function setup() {
  const route = useRoute()
  const router = useRouter()
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
  const activeNavigationTab = ref("chats");
  const branchName = ref("");
  const branchParent = ref(null);
  const showTimestampColumn = ref(false);
  const showChatInfo = ref(false);
  const showPinnedMessages = ref(false);
  const isCustomizeChatOpen = ref(false);
  const isMembersOpen = ref(false);
  const showRenameDialog = ref(false);
  const showBranchRenameDialog = ref(false);
  const branchBeingRenamed = ref(null);
  const editedBranchName = ref("");

  const branchParentName = computed(() => {
    return branchParent.value?.name || activeChatName.value || "No chat selected";
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

  function getMessageId(message) {
    return message.url || message.value.clientId || `${message.value.user}:${message.value.published}`;
  }

  const pinnedMessageIds = computed(() => {
    const latestPinByMessage = {};

    for (const obj of activeMessageInteractions.value) {
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

  const pinnedMessages = computed(() =>
    activeMessages.value
      .map(message => ({
        ...message,
        messageId: getMessageId(message),
        profile: profileCache.getProfile(message.value.user),
      }))
      .filter(message => pinnedMessageIds.value.has(message.messageId))
      .sort((a, b) => b.value.published - a.value.published)
  );

  watch(
    () => pinnedMessages.value.map(message => message.value.user),
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
      if (!chatId && activeNavigationTab.value === "branches") {
        activeNavigationTab.value = "chats";
      }

      if (!chatId) {
        showChatInfo.value = false;
        showPinnedMessages.value = false;
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

  /**
   * Leave active chat and navigate home
   */
  async function leaveActiveChat(chatId) {
    await chatStore.leaveChat(chatId);
    router.push({ name: "home" });
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

  async function openBranchDrawer(parent = null) {
    branchParent.value = parent;
    await nextTick();

    const drawer = document.querySelector("#create-branch-drawer");
    if (drawer) drawer.open = true;
  }

  async function createBranchUnderActiveChat() {
    const name = branchName.value.trim();

    if (!name || !activeChatId.value || !activeChatRootId.value) return;

    const parentId = branchParent.value?.id || activeChatId.value;
    const rootId = branchParent.value?.rootChatId || activeChatRootId.value;
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
        const drawer = document.querySelector("#create-branch-drawer");
        if (drawer) drawer.open = false;
      }
    } finally {
      newChatName.value = previousChatName;
    }
  }

  async function deleteBranch(branch) {
    if (!branch?.id || branch.id === branch.rootChatId) return;

    const success = await chatStore.deleteBranch(
      branch.id,
      branch.rootChatId,
      branch.parentChatId,
      branch.name
    );

    if (success && activeChatId.value === branch.id) {
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

  /**
   * Combined watch: Handle route changes and update chat info from list
   * - Update active chat ID when route changes (page refresh support)
   * - Use chat list data for root chats
   * - Preserve the known root ID for branch chats, which are not in chatList
   */
  watch(
    () => [route.params.chatId, chatList.value],
    ([chatId, chats]) => {
      const routeChatId = chatId || null;
      const knownActiveName = activeChatName.value;
      const knownRootId = activeChatRootId.value;
      const knownParentId = activeChatParentId.value;

      // Update active chat from route params
      activeChatId.value = routeChatId;

      if (!routeChatId) {
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
    activeChatId,
    activeChatName,
    activeChatRootId,
    activeChatParentId,
    activeChatRootName,
    activeChatAvatar,
    infoMembers,
    previewMembers,
    activeNavigationTab,
    branchName,
    branchParentName,
    chatBreadcrumb,
    isCreating,
    createError,
    createSuccess,
    openBranchDrawer,
    createBranchUnderActiveChat,
    deleteBranch,
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
    isLeaving,
    leaveSuccess,
    showTimestampColumn,
    toggleTimestampColumn,
    showChatInfo,
    toggleChatInfo,
    showPinnedMessages,
    togglePinnedMessages,
    pinnedMessages,
    isCustomizeChatOpen,
    isMembersOpen,
    showRenameDialog,
    openRenameDialog,
    navigateBreadcrumb
  }
}

export default async () => ({
  setup,
  components: {
    ChatList: await loadChatList(),
    ChatTree: await loadChatTree(),
    ChatInput: await loadChatInput(),
    ChatFlow: await loadChatFlow(),
    ChatMembers: await loadChatMembers(),
    Profile: await loadProfile(),
    CreateChatButton: await loadCreateChatButton(),
  },
  template: await fetch(new URL("./home.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
