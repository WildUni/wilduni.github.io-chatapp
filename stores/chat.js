import { ref, computed} from "vue";
import { defineStore } from "pinia";
import {
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover
} from "@graffiti-garden/wrapper-vue";

export const useChatStore = defineStore("chat", () => {
  const graffiti = useGraffiti();
  const session = useGraffitiSession();


  const activeChatId = ref(null);
  const activeChatName = ref(null);
  const activeChatRootId = ref(null);

  const newChatName = ref('');
  const joinChatId = ref('')


  async function createNewChat(parent = null, root = null){
      if(!newChatName.value) return
      const chatId = crypto.randomUUID();
      const parentChatId = parent ? parent : chatId 
      const rootChatId = root ? root : chatId
      

      //membership to user channel
      if(!root)
      {
        graffiti.post(
            {
              value:{
                action: 'Membership',
                value: 'Join',
                chatId: chatId, 
                chatName: newChatName.value,
                published: Date.now(),
              },
              channels: [`user:${session.value.actor}:Membership`],
              // channels: [`user:${session.value.actor}:Membership`],
              allowed: []
            },
            session.value      
        )
        //posted to chat activity + Descendants
        graffiti.post(
          {
            value:{
              action: 'Create',
              chatId: chatId, 
              name: newChatName.value,
              published: Date.now(),
              parentChatId: parentChatId,
              rootChatId: rootChatId,
            },
            channels: [`chat:${chatId}:Activity`],
          },
          session.value      
        )

        //posted to chat membership
        graffiti.post(
          {
            value:{
              action: 'Membership',
              value: 'Join',
              user: session.value.actor,
              published: Date.now(),
            },
            channels: [`chat:${chatId}:Membership`],
          },
          session.value      
        )
      }

      graffiti.post(
        {
          value:{
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
      )
      newChatName.value = "";
      console.log(parentChatId, rootChatId)
      console.log('chat-posted')
  }





  //computing chatlist based on user activity
  const channels = computed(() => {
    return session.value ? [`user:${session.value.actor}:Membership`] : [];
  });

  const {objects: activities} =  useGraffitiDiscover(
    channels,
    {
      properties:{
        value: {
          required: ['action', 'value', 'chatId', 'chatName', 'published'],
          properties: {
            action: { type: 'string' },
            value: { type: 'string' },
            chatId: { type: 'string' },
            chatName: { type: 'string' },
            published: { type: 'number' },
          }
        }
      },
    },
    session,
    true
  )

  const chatList = computed(() => {
    return Object.values(
      activities.value.reduce((acc, obj) => {
        const {chatId, published } = obj.value;
        if (!acc[chatId] || acc[chatId].value.published < published) {
          acc[chatId] = obj;
        }
        return acc;
      }, {})
    );
  });



  return {
      activeChatId,
      activeChatName,
      activeChatRootId,
      newChatName,
      createNewChat,
      chatList
      
  }
});


