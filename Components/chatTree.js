import { ref, computed, watch } from "vue";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import { useChatStore } from "../stores/chat.js";
import { storeToRefs } from "pinia"

function setup(props, { emit }) {
    const graffiti = useGraffiti();
    const session = useGraffitiSession();
    const chatStore = useChatStore();
    const {activeChatRootId} = storeToRefs(chatStore);

    const channels = computed(() => {
      return session.value ? [`chat:${activeChatRootId.value}:Descendants`] : [];
    });

    const {objects:branchActivities} = useGraffitiDiscover(
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
    )
    

    const branches = computed(() => {
      return Object.values(
        branchActivities.value.reduce((acc, obj) => {
          const v = obj.value;

          if (!v.chatId || !v.published) return acc;

          const existing = acc[v.chatId];

          if (!existing || existing.value.published < v.published) {
            acc[v.chatId] = obj;
          }

          return acc;
        }, {})
      );
    });


    const chatTree = computed(()=>{
      const chat_to_parent = {}
      console.log(branches.value)
      for(const branch of branches.value){
        chat_to_parent[branch.value.chatId] = branch.value.parentChatId;
      }
      
      const parent_to_chats = {}
      for(const [chat, parent] of Object.entries(chat_to_parent)){
        if(!parent_to_chats[parent]){
          parent_to_chats[parent] = [];
        }
        if(chat === parent) continue
        parent_to_chats[parent].push(chat)
      }

      return parent_to_chats
    })


    const chatMap = computed(() => {
      const map = {};
      for (const branch of branches.value) {
        map[branch.value.chatId] = branch.value;
      }
      return map;
    });

    const nestedTree = ref([]);

    watch(
      activeChatRootId,
      () => {
        const parentMap = chatTree.value;
        const map = chatMap.value;

        function buildNode(chatId) {
          const node = map[chatId];

          return {
            id: chatId,
            name: node?.name || "General",
            rootChatId: node?.rootChatId || activeChatRootId.value,
            children: (parentMap[chatId] || []).map(buildNode)
          };
        }

        const roots = activeChatRootId.value ? [activeChatRootId.value] : [];
        nestedTree.value = roots.map(buildNode);
      },
      { immediate: true }
    );



    function emitUpdateChat(chatId, chatName, rootId) {
      console.log(chatId, chatName, rootId)
      console.log(nestedTree.value)
      emit("update-active-chat", chatId, chatName, rootId);
    }
    return {
      chatTree,
      nestedTree,
      emitUpdateChat
    };
}

const TreeNode = {
  props: ["node"],
  emits: ["update-active-chat"],
  template: `
    <wa-tree-item>
      <span @click.stop="$emit('select-chat', node.id, node.name, node.rootChatId)">
        {{ node.name }}
      </span>

      <TreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
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
