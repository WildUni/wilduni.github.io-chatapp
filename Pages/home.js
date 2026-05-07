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

import { delay } from "../index.js";


function setup() {
  const route = useRoute()
  const router = useRouter()
  const session = useGraffitiSession();
  const chatStore = useChatStore();
  const {activeChatId, 
    activeChatName, 
    newChatName, 
    chatList, 
    activeChatRootId,
    activeChatParentId,
    activeChatImageUrl,
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

  function getBreadcrumbNode(chatId) {
    if (!chatId) return null;

    const branch = branchMap.value[chatId];
    const chat = chatListMap.value[chatId];

    if (branch?.action === "Delete") return null;
    if (!branch && !chat && chatId !== activeChatId.value) return null;

    return {
      id: chatId,
      name: branch?.name || chat?.chatName || (chatId === activeChatId.value ? activeChatName.value : null) || "Untitled chat",
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
    await delay();
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
      const drawer = document.querySelector("#chat-settings-drawer");
      if (drawer) drawer.open = false;
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
        await delay();
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
        rootChat?.value.chatName ?? "Untitled chat",
        branch.rootChatId,
        branch.rootChatId
      );
    }
  }

  function toggleTimestampColumn() {
    showTimestampColumn.value = !showTimestampColumn.value;
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
          activeChatName.value = activeChat.value.chatName;
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
    activeChatImageUrl,
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
