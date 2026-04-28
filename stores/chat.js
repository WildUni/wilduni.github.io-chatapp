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


  const joinChatId = ref(null);

  const newChatName = ref('');


  async function createNewChat(parent = null){
      if(!newChatName.value) return
      
      const parentChatId = parent ? parent : 'rootChat'
      const chatId = crypto.randomUUID();
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
      graffiti.post(
          {
              value:{
                  action: 'Create',
                  chatId: chatId, 
                  name: newChatName.value,
                  published: Date.now(),
              },
              channels: [`Chat:${chatId}:Activity`],
          },
          session.value      
      )
      graffiti.post(
          {
              value:{
                  action: 'Membership',
                  value: 'Join',
                  user: session.value.actor,
                  published: Date.now(),
                  parentChatId
              },
              channels: [`Chat:${chatId}:Membership`],
          },
          session.value      
      )
      newChatName.value = "";
      console.log('chat-posted')
  }


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
      newChatName,
      createNewChat,
      joinChatId,
      chatList
      
  }
});


