import { ref, computed, watch } from "vue";
import { useUserStore } from "../stores/user.js";
import { storeToRefs } from "pinia"



function setup() {
  const userStore = useUserStore();
  const {profileName, profileImageUrl, profileBio} = storeToRefs(userStore);

  const editedName = ref("");
  const editedBio = ref("");

  // sync when store updates
  watch(profileName, (val) => {
    editedName.value = val;
  }, { immediate: true });

  watch(profileBio, (val) => {
    editedBio.value = val;
  }, { immediate: true });


  async function saveChanges(){
    await userStore.updateProfileName(editedName.value);
    await userStore.updateProfileBio(editedBio.value);
  }


  return{
    profileName,
    profileImageUrl,
    profileBio,
    handleFileUpload: userStore.handleFileUpload,
    saveChanges,
    editedName,
    editedBio,
  }
}

export default async () => ({
  setup,
  template: await fetch(new URL("./profile.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
