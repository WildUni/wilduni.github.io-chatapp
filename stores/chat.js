import { ref, computed, watch} from "vue";
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
  const joinChatId = ref('');



  const isCreating = ref(false);
  const createError = ref(false);
  const createSuccess = ref(false)
  const isJoining = ref(false);
  const joinError = ref(false);
  const joinSuccess = ref(false)
  const isLeaving = ref(false);
  const leaveError = ref(false);
  const leaveSuccess = ref(false)



  async function createNewChat(parent = null, root = null){
      if(!newChatName.value){
        return false
      }


      isCreating.value = true;
      createError.value = false;
      createSuccess.value = false;


      const chatId = crypto.randomUUID();
      const parentChatId = parent ? parent : chatId 
      const rootChatId = root ? root : chatId
      


      try {
        
        if(!root){
          //membership to user channel
          await graffiti.post(
            {
              value:{
                action: 'Membership',
                value: 'Join',
                chatId: chatId, 
                chatName: newChatName.value,
                published: Date.now(),
              },
              channels: [`user:${session.value.actor}:Membership`],
              allowed: []
            },
            session.value      
          )

          //posted to chat activity + Descendants
          await graffiti.post(
            {
              value:{
                action: 'Create',
                chatId: chatId, 
                chatName: newChatName.value,
                published: Date.now(),
                parentChatId: parentChatId,
                rootChatId: rootChatId,
              },
              channels: [`chat:${chatId}:Activities`],
            },
            session.value      
          )
          //posted to chat membership
          await graffiti.post(
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

        await graffiti.post(
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
        createSuccess.value = true
        setTimeout(() => {
          createSuccess.value = false;
        }, 1500);
        
        newChatName.value = "";

      }catch (err) {
        createError.value = true;
      } finally{
        isCreating.value = false;
      }
      return !createError.value
      
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
          required: ['action', 'value', 'chatId', 'published'],
          properties: {
            action: { type: 'string'},
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
    const latestByChat = activities.value.reduce((acc, obj) => {
      const { chatId, published } = obj.value;

      if (!chatId || !published) return acc;

      const existing = acc[chatId];

      if (!existing || existing.value.published < published) {
        acc[chatId] = obj;
      }

      return acc;
    }, {});

    // keep only chats where latest action is "Join"
    const ret = Object.values(latestByChat).filter(
      chat => chat.value.value === 'Join'
    );

    // console.log(ret)
    return ret
  });


  async function joinChat(){

    if(!session.value.actor || !joinChatId.value) return false;
    isJoining.value = true;
    joinError.value = false;
    joinSuccess.value = false;

    try{
      //gets chat activity log to see if chat exists
      const {objects: activities} =  useGraffitiDiscover(
        ()=>[`chat:${joinChatId.value}:Activities`],
        {
          properties:{
            value: {
              required: ['action', 'chatId', 'chatName', 'published', 'parentChatId', 'rootChatId'],
              properties: {
                action: { type: 'string', enum: ['Create', 'Delete'] },
                parentChatId: { type: 'string' },
                chatId: { type: 'string' },
                chatName: { type: 'string' },
                published: { type: 'number' },
                rootChatId: { type: 'string'}
              }
            }
          },
        },
        session,
        true
      )

      function waitForActivities(timeout = 2000) {
        return new Promise(resolve => {
          const stop = watch(activities, (val) => {
            if (val.length > 0) {
              stop();
              resolve(val);
            }
          }, { immediate: true });

          setTimeout(() => {
            stop();
            resolve([]); // treat as no chat
          }, timeout);
        });
      }

      async function checkChatExists() {
        const acts = await waitForActivities();

        let latest = null;
        for (const obj of acts) {
          if (!latest || latest.value.published < obj.value.published) {
            latest = obj;
          }
        }
        return latest?.value.action === 'Create' ? latest: null;
      }

      const chat = await checkChatExists();

      if(chat != null){
        //posting to chat membership channel
        await graffiti.post(
          {
            value:{
              action: 'Membership',
              value: 'Join',
              user: session.value.actor,
              published: Date.now(),
            },
            channels: [`chat:${joinChatId.value}:Membership`],
          },
          session.value      
        )

        //posting to user membership channel
        await graffiti.post(
          {
            value:{
              action: 'Membership',
              value: 'Join',
              chatId: joinChatId.value, 
              chatName: chat.value.chatName,
              published: Date.now(),
            },
            channels: [`user:${session.value.actor}:Membership`],
            allowed: []
          },
          session.value      
        )
        joinSuccess.value = true
        setTimeout(() => {
          joinSuccess.value = false;
        }, 1500);
        joinChatId.value = ''
      }
      else {
        joinError.value = true;
      }
    }catch (err) {
      joinError.value = true;
    } finally{
      isJoining.value = false;
    }
    return !joinError.value
  }


  async function leaveChat(chatId = null) {
    // console.log('called')

    isLeaving.value = true;
    leaveError.value = false;
    leaveSuccess.value = false;
    
    if(!session.value.actor || chatId === null) return false

    // Post leave action to chat membership channel
    try{
      await graffiti.post(
        {
          value:{
            action: 'Membership',
            value: 'Leave',
            user: session.value.actor,
            published: Date.now(),
          },
          channels: [`chat:${chatId}:Membership`],
        },
        session.value
      )

      // Post leave action to user membership channel
      await graffiti.post(
        {
          value:{
            action: 'Membership',
            value: 'Leave',
            chatId: chatId,
            published: Date.now(),
          },
          channels: [`user:${session.value.actor}:Membership`],
          allowed: []
        },
        session.value
      )

      // Clear active chat if leaving the current one
      if(activeChatId.value === chatId) {
        activeChatId.value = null;
        activeChatName.value = null;
        activeChatRootId.value = null;
      }

      leaveSuccess.value = true
      setTimeout(() => {
        leaveSuccess.value = false;
      }, 1500);
    }catch (err) {
        leaveError.value = true;
    } finally{
      isLeaving.value = false;
    }
    return !leaveError.value
  }




  return {
      activeChatId,
      activeChatName,
      activeChatRootId,
      newChatName,
      createNewChat,
      chatList,
      leaveChat,
      joinChat,
      joinChatId,
      isCreating,
      isJoining,
      isLeaving,
      createError,
      joinError,
      leaveError,
      createSuccess,
      joinSuccess,
      leaveSuccess
  }
});


