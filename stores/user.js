import { ref, computed, watch} from "vue";
import { defineStore } from "pinia";
import {
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover
} from "@graffiti-garden/wrapper-vue";

export const useUserStore = defineStore("user", () => {
  const graffiti = useGraffiti();
  const session = useGraffitiSession();

  const channels = computed(() => {
    return session.value ? [`user:${session.value.actor}:Activities`] : [];
  });
  const {objects:activities} = useGraffitiDiscover(
    channels,
    {
      properties: {
        value: {
          required: ["action", "published", 'user'],
          properties: {
            action: { type: "string" },
            published: { type: "number" },

            // optional fields depending on action
            name: { type: "string" },
            content: { type: "string" },
            url: { type: "string" }
          }
        }
      }
    },
    session,
    true
  )

  const userInformation = computed(() => {
    return activities.value.reduce((acc, obj) => {
      const {action, published} = obj.value;
      if (!acc[action] || acc[action].value.published < published) {
        acc[action] = obj;
      }
      return acc;
    }, {})
  });
  const profileImageRawUrl = computed(() =>
    userInformation.value.ProfileImage?.value?.url ?? null
  );

  const profileImageUrl = ref();
  let currentObjectUrl = null;

  watch(
    () => profileImageRawUrl.value,
    async (url) => {
      if (!url) return;
      // cleanup old object URL
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
      const blob = await graffiti.getMedia(url, session.value);
      currentObjectUrl = URL.createObjectURL(blob.data);
      profileImageUrl.value = currentObjectUrl;
    },
    { immediate: true }
  );

  const profileName = computed(() =>{
    // console.log(userInformation.value.ProfileName.value)
    return userInformation.value.ProfileName?.value?.name ?? null
  }
  );

  const profileBio = computed(() =>
    userInformation.value.ProfileBio?.value?.content ?? null
  );


  //update functions for posting
  async function updateProfileName(name){
    const trimmed = name.trim();
    if (!trimmed) return;
    graffiti.post({
      value:{
        user:session.value.actor,
        action: 'ProfileName',
        name: name,
        published: Date.now(),
      },
      channels: [`user:${session.value.actor}:Activities`],
    },
    session.value)
    console.log('name posted')
  }

  async function updateProfileImage(file){

    const mediaUrl = await graffiti.postMedia(
      {
        data: file
      },
      session.value
    )
    const oldUrl = profileImageRawUrl.value
    
    graffiti.post({
      value:{
        user:session.value.actor,
        action: 'ProfileImage',
        url: mediaUrl,
        published: Date.now(),
      },
      channels: [`user:${session.value.actor}:Activities`],
    },
    session.value)

    if (oldUrl) {
      try {
        await graffiti.deleteMedia(oldUrl, session.value);
      } catch (e) {
        console.log("delete failed", e);
      }
    }

  }

  async function updateProfileBio(content){
    graffiti.post({
      value:{
        user:session.value.actor,
        action: 'ProfileBio',
        content: content,
        published: Date.now(),
      },
      channels: [`user:${session.value.actor}:Activities`],
    },
    session.value)
  }

  async function handleFileUpload(event) {
    console.log('yes');
    const file = event.target.files[0];
    if (!file) return;
    await updateProfileImage(file);
    event.target.value = "";
  }

  const hasProfileName = computed(() =>
    !!profileName.value?.trim()
  );

  return{
    profileName,
    profileImageUrl,
    profileBio,
    handleFileUpload,
    updateProfileImage,
    updateProfileName,
    updateProfileBio,
    hasProfileName
  }

})