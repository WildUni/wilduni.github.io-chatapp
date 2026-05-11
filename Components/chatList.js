import { computed, nextTick, ref } from "vue";
import loadChatListItem from "./chatListItem.js";
import { useChatStore } from "../stores/chat.js";
import { storeToRefs } from "pinia"
import {
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";

function setup(props, { emit }) {
    const session = useGraffitiSession();
    const chatStore = useChatStore()
    const now = ref(Date.now());
    const openBranchRootIds = ref({});
    const {
      activeChatId,
      chatList,
      chatImageUrls,
      chatImageLoadingByChat,
      chatDefaultImageUrlsByChatId,
      chatDefaultImageLoadingByChatId,
      chatPreviewMembersByChatId,
      hasUnreadByChatId,
      hasUnreadByRootChatId,
      latestMessageByRootChatId,
      areChatMessagesReady,
      isChatListLoading
    } = storeToRefs(chatStore)

    const branchChannels = computed(() => {
      return session.value
        ? chatList.value.map(chat => `chat:${chat.value.chatId}:Descendants`)
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

    const latestBranchByChatId = computed(() => {
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

        if (!acc[v.chatId] || acc[v.chatId].value.published < v.published) {
          acc[v.chatId] = obj;
        }

        return acc;
      }, {});
    });

    const branches = computed(() =>
      Object.values(latestBranchByChatId.value)
        .filter(branch => branch.value.action !== "Delete")
        .sort((a, b) => a.value.published - b.value.published)
    );

    const childrenByParent = computed(() => {
      const children = {};

      for (const branch of branches.value) {
        const { chatId, parentChatId } = branch.value;

        if (chatId === parentChatId) continue;

        if (!children[parentChatId]) children[parentChatId] = [];
        children[parentChatId].push(chatId);
      }

      return children;
    });

    const chatMap = computed(() => {
      const map = {};
      for (const branch of branches.value) {
        map[branch.value.chatId] = branch.value;
      }
      return map;
    });

    const rootChatNameById = computed(() => {
      return chatList.value.reduce((acc, chat) => {
        acc[chat.value.chatId] = chat.value.displayChatName ?? chat.value.chatName ?? "Untitled chat";
        return acc;
      }, {});
    });

    function constructTree(rootChatId, visited = new Set()) {
      if (!rootChatId || visited.has(rootChatId)) return null;

      visited.add(rootChatId);

      const node = chatMap.value[rootChatId];
      const childNodes = (childrenByParent.value[rootChatId] || [])
        .map(childId => constructTree(childId, visited))
        .filter(Boolean);
      visited.delete(rootChatId);

      return {
        id: rootChatId,
        name: node?.name || `${rootChatNameById.value[rootChatId] || "Untitled chat"} (General)`,
        parentChatId: node?.parentChatId || rootChatId,
        rootChatId: node?.rootChatId || rootChatId,
        hasUnread: Boolean(hasUnreadByChatId.value[rootChatId]),
        children: childNodes,
      };
    }

    const branchTreesByRootId = computed(() => {
      return chatList.value.reduce((acc, chat) => {
        const rootChatId = chat.value.chatId;
        const tree = constructTree(rootChatId);
        acc[rootChatId] = tree ? [tree] : [];
        return acc;
      }, {});
    });

    const branchCountByRootId = computed(() => {
      return Object.fromEntries(
        chatList.value.map(chat => {
          const rootChatId = chat.value.chatId;
          const count = branches.value.filter(branch =>
            branch.value.rootChatId === rootChatId &&
            branch.value.chatId !== rootChatId
          ).length;
          return [rootChatId, count];
        })
      );
    });

    function isBranchesOpen(chatId) {
      return Boolean(openBranchRootIds.value[chatId]);
    }

    function toggleBranches(chatId) {
      openBranchRootIds.value = {
        ...openBranchRootIds.value,
        [chatId]: !openBranchRootIds.value[chatId],
      };
    }

    function emitUpdateChat(chatId, chatName, rootId, parentId) {
      emit("update-active-chat", chatId, chatName, rootId, parentId);
    }

    function emitCreateBranch(parentBranch) {
      emit("create-branch", parentBranch);
    }

    function emitDeleteBranch(branch) {
      emit("delete-branch", branch);
    }

    function emitRenameBranch(branch) {
      emit("rename-branch", branch);
    }

    async function syncSelectedBranch(event) {
      const tree = event.currentTarget;

      await nextTick();

      tree?.querySelectorAll("wa-tree-item").forEach((item) => {
        item.selected = item.dataset.chatId === activeChatId.value;
      });
    }

    return {
      emitUpdateChat, 
      emitCreateBranch,
      emitDeleteBranch,
      emitRenameBranch,
      toggleBranches,
      isBranchesOpen,
      syncSelectedBranch,
      activeChatId,
      chatList,
      chatImageUrls,
      chatImageLoadingByChat,
      chatDefaultImageUrlsByChatId,
      chatDefaultImageLoadingByChatId,
      chatPreviewMembersByChatId,
      hasUnreadByRootChatId,
      latestMessageByRootChatId,
      areChatMessagesReady,
      isChatListLoading,
      branchTreesByRootId,
      branchCountByRootId,
      now,
    };
}

const BranchNode = {
  name: "BranchNode",
  props: ["node", "activeChatId"],
  emits: ["select-chat", "create-branch", "delete-branch", "rename-branch"],
  methods: {
    closeOtherDropdowns(event) {
      const currentDropdown = event.currentTarget.closest("wa-dropdown");

      document.querySelectorAll("wa-dropdown").forEach((dropdown) => {
        if (dropdown !== currentDropdown) {
          dropdown.open = false;
        }
      });
    },
    handleBranchAction(event) {
      const action = event.detail.item.value;

      if (action === "create-branch") {
        this.$emit("create-branch", this.node);
      }

      if (action === "rename-branch" && this.node.id !== this.node.rootChatId) {
        this.$emit("rename-branch", this.node);
      }

      if (action === "delete-branch" && this.node.id !== this.node.rootChatId) {
        this.$emit("delete-branch", this.node);
      }
    },
  },
  template: `
    <wa-tree-item
      :selected.prop="node.id === activeChatId"
      :data-chat-id="node.id"
    >
      <span class="tree-node-row">
        <span
          class="tree-node-label"
          :class="{ 'long-branch-name': node.name.length > 20 }"
          @click.stop="$emit('select-chat', node.id, node.name, node.rootChatId, node.parentChatId)"
        >
          <span
            v-if="node.hasUnread"
            class="unread-dot branch-unread-dot"
            aria-label="Unread messages"
          ></span>
          {{ node.name }}
        </span>

        <wa-dropdown
          class="branch-actions-dropdown"
          @click.stop
          @wa-show="closeOtherDropdowns"
          @wa-select="handleBranchAction"
        >
          <wa-button
            slot="trigger"
            appearance="plain"
            class="branch-actions-trigger"
            title="Branch actions"
            aria-label="Branch actions"
            @click="closeOtherDropdowns"
          >
            <wa-icon name="ellipsis"></wa-icon>
          </wa-button>

          <wa-dropdown-item value="create-branch">
            <wa-icon name="code-branch" slot="start"></wa-icon>
            Create New Branch
          </wa-dropdown-item>
          <wa-dropdown-item
            value="rename-branch"
            :disabled.prop="node.id === node.rootChatId"
          >
            <wa-icon name="pen-to-square" slot="start"></wa-icon>
            Rename Branch
          </wa-dropdown-item>
          <wa-dropdown-item
            value="delete-branch"
            :disabled.prop="node.id === node.rootChatId"
            class="danger-dropdown-item"
          >
            <wa-icon name="trash" slot="start"></wa-icon>
            Delete Branch
          </wa-dropdown-item>
        </wa-dropdown>
      </span>

      <BranchNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :active-chat-id="activeChatId"
        @select-chat="(...args) => $emit('select-chat', ...args)"
        @create-branch="branch => $emit('create-branch', branch)"
        @rename-branch="branch => $emit('rename-branch', branch)"
        @delete-branch="branch => $emit('delete-branch', branch)"
      />
    </wa-tree-item>
  `,
  components: {
    BranchNode: null
  }
};
BranchNode.components.BranchNode = BranchNode;

export default async () => ({
    setup,
    components:{
      ChatListItem: await loadChatListItem(),
      BranchNode,
    },
    emits: ["update-active-chat", "create-branch", "delete-branch", "rename-branch"],
    template: await fetch(new URL("./chatList.html", import.meta.url)).then((r) =>
        r.text(),
    ),
});
