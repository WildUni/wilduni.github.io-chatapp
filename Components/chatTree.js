import { computed } from "vue";
import {
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import { useChatStore } from "../stores/chat.js";
import { storeToRefs } from "pinia";

function setup(props, { emit }) {
    const session = useGraffitiSession();
    const chatStore = useChatStore();
    const {
      activeChatId,
      activeChatRootId,
      chatList,
      hasUnreadByChatId,
    } = storeToRefs(chatStore);

    const channels = computed(() => {
      return session.value && activeChatRootId.value
        ? [`chat:${activeChatRootId.value}:Descendants`]
        : [];
    });

    const { objects: branchActivities } = useGraffitiDiscover(
      channels,
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
    
    const branches = computed(() => {
      return Object.values(
        branchActivities.value.reduce((acc, obj) => {
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

          if (!existing) {
            acc[v.chatId] = obj;
            return acc;
          }

          if (existing.value.published < v.published) {
            acc[v.chatId] = {
              ...obj,
              value: {
                ...existing.value,
                ...obj.value,
              },
            };
          }

          return acc;
        }, {})
      ).filter(branch => branch.value.action !== "Delete")
        .sort((a, b) => a.value.published - b.value.published);
    });


    const childrenByParent = computed(() => {
      const children = {};

      for (const branch of branches.value) {
        const { chatId, parentChatId } = branch.value;

        if (chatId === parentChatId) continue;

        if (!children[parentChatId]) {
          children[parentChatId] = [];
        }

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

    const rootChatName = computed(() => {
      const rootChat = chatList.value.find(
        chat => chat.value.chatId === activeChatRootId.value
      );

      return rootChat?.value.displayChatName ?? rootChat?.value.chatName ?? null;
    });

    function constructTree(rootChatId, visited = new Set()) {
      if (!rootChatId || visited.has(rootChatId)) return null;

      visited.add(rootChatId);

      const node = chatMap.value[rootChatId];
      const fallbackName = rootChatId === activeChatRootId.value
        ? rootChatName.value + " (General)"
        : null;
      const childNodes = (childrenByParent.value[rootChatId] || [])
        .map(childId => constructTree(childId, new Set(visited)))
        .filter(Boolean);

      return {
        id: rootChatId,
        name: node?.name || fallbackName || "Untitled chat",
        parentChatId: node?.parentChatId || rootChatId,
        rootChatId: node?.rootChatId || activeChatRootId.value || rootChatId,
        hasUnread: Boolean(hasUnreadByChatId.value[rootChatId]),
        children: childNodes,
      };
    }

    const nestedTree = computed(() => {
      const root = constructTree(activeChatRootId.value);
      return root ? [root] : [];
    });

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

    function syncSelectedBranch(event) {
      const tree = event.currentTarget;

      tree?.querySelectorAll("wa-tree-item").forEach((item) => {
        item.selected = item.dataset.chatId === activeChatId.value;
      });
    }

    return {
      chatTree: childrenByParent,
      constructTree,
      nestedTree,
      emitUpdateChat,
      emitCreateBranch,
      emitDeleteBranch,
      emitRenameBranch,
      syncSelectedBranch,
      activeChatId
    };
}

const TreeNode = {
  name: "TreeNode",
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

      <TreeNode
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
    TreeNode: null
  }
};
// self-reference (important for recursion)
TreeNode.components.TreeNode = TreeNode;






export default async () => ({
  setup,
  emits: ["update-active-chat", "create-branch", "delete-branch", "rename-branch"],
  components: {
    TreeNode,
  },
  template: await fetch(new URL("./chatTree.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
