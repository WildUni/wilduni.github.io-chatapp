import { ref, computed, watch } from "vue";
import { useUserStore } from "../stores/user.js";
import { storeToRefs } from "pinia"



function setup() {
  const userStore = useUserStore();
  const {profileName, profileImageUrl, profileImageLoading, profileBio} = storeToRefs(userStore);

  const editedName = ref("");
  const editedBio = ref("");

  const isSaving = ref(false);
  const saveError = ref(false);
  const saveSuccess = ref(false);

  function delay(ms = 1000) {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  // sync when store updates
  watch(profileName, (val) => {
    editedName.value = val;
  }, { immediate: true });

  watch(profileBio, (val) => {
    editedBio.value = val;
  }, { immediate: true });


  async function saveChanges(){

    if(!editedName.value) return

    isSaving.value = true;
    saveError.value = false;
    saveSuccess.value = false;
    
    try{
      await userStore.updateProfileName(editedName.value);
      await userStore.updateProfileBio(editedBio.value);


      await delay();
      saveSuccess.value = true;
      setTimeout(() => {
        saveSuccess.value = false;
      }, 1500);
      
    }catch(e){
      saveError.value = true
    }finally{
      isSaving.value = false
    }
  }


  return{
    profileName,
    profileImageUrl,
    profileImageLoading,
    profileBio,
    handleFileUpload: userStore.handleFileUpload,
    saveChanges,
    editedName,
    editedBio,
    isSaving,
    saveSuccess
    
  }
}

export default async () => ({
  setup,
  template: await fetch(new URL("./profile.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
