import { computed, ref } from "vue";
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
      isCreating,
      createError,
      createSuccess,
      newChatName,
    } = storeToRefs(chatStore);
    const branchName = ref("");

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
            v.action !== "Create" ||
            !v.chatId ||
            !v.parentChatId ||
            !v.rootChatId ||
            !v.published
          ) {
            return acc;
          }

          const existing = acc[v.chatId];

          if (!existing || existing.value.published < v.published) {
            acc[v.chatId] = obj;
          }

          return acc;
        }, {})
      ).sort((a, b) => a.value.published - b.value.published);
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

      return rootChat?.value.chatName ?? null;
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
        rootChatId: node?.rootChatId || activeChatRootId.value || rootChatId,
        children: childNodes,
      };
    }

    const nestedTree = computed(() => {
      const root = constructTree(activeChatRootId.value);
      return root ? [root] : [];
    });

    function emitUpdateChat(chatId, chatName, rootId) {
      emit("update-active-chat", chatId, chatName, rootId);
    }

    async function createBranchUnderActiveChat() {
      const name = branchName.value.trim();

      if (!name || !activeChatId.value || !activeChatRootId.value) return;

      const previousChatName = newChatName.value;
      newChatName.value = name;

      try {
        const success = await chatStore.createNewChat(
          activeChatId.value,
          activeChatRootId.value,
        );

        if (success) {
          branchName.value = "";
        }
      } finally {
        newChatName.value = previousChatName;
      }
    }

    return {
      chatTree: childrenByParent,
      constructTree,
      nestedTree,
      branchName,
      isCreating,
      createError,
      createSuccess,
      createBranchUnderActiveChat,
      emitUpdateChat,
      activeChatId
    };
}

const TreeNode = {
  name: "TreeNode",
  props: ["node", "activeChatId"],
  emits: ["select-chat"],
  template: `
    <wa-tree-item
      expanded
      :selected.prop="node.id === activeChatId"
      @click.stop="$emit('select-chat', node.id, node.name, node.rootChatId)"
    >
      <span class="tree-node-label">
        {{ node.name }}
      </span>

      <TreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :active-chat-id="activeChatId"
        @select-chat="(...args) => $emit('select-chat', ...args)"
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
  emits: ["update-active-chat"],
  components: {
    TreeNode,
  },
  template: await fetch(new URL("./chatTree.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
