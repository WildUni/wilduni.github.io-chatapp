import { ref, watch } from "vue";
import { useUserStore } from "../stores/user.js";
import { storeToRefs } from "pinia"



function setup() {
  const userStore = useUserStore();
  const {
    profileName,
    profileImageUrl,
    profileImageLoading,
    profileBio,
    profilePronouns,
    isProfileUpdating,
    profileUpdateError,
    profileUpdateSuccess,
  } = storeToRefs(userStore);

  const editedName = ref("");
  const editedBio = ref("");
  const editedPronouns = ref("");
  const showProfilePanel = ref(false);
  const savedTheme = localStorage.getItem("chatapp-theme");
  const theme = ref(savedTheme || document.documentElement.dataset.theme || "light");

  const isSaving = ref(false);
  const saveError = ref(false);
  const saveSuccess = ref(false);
  let saveSuccessTimer = null;

  function showSaveSuccess() {
    saveSuccess.value = true;
    clearTimeout(saveSuccessTimer);
    saveSuccessTimer = setTimeout(() => {
      saveSuccess.value = false;
      saveSuccessTimer = null;
    }, 1500);
  }

  // sync when store updates
  watch(profileName, (val) => {
    editedName.value = val ?? "";
  }, { immediate: true });

  watch(profileBio, (val) => {
    editedBio.value = val ?? "";
  }, { immediate: true });

  watch(profilePronouns, (val) => {
    editedPronouns.value = val ?? "";
  }, { immediate: true });

  function applyTheme(nextTheme) {
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    localStorage.setItem("chatapp-theme", nextTheme);
  }

  function toggleTheme() {
    theme.value = theme.value === "dark" ? "light" : "dark";
  }

  watch(theme, applyTheme, { immediate: true });

  async function saveChanges(){

    if(!editedName.value.trim()) return

    isSaving.value = true;
    saveError.value = false;
    saveSuccess.value = false;
    
    try{
      await Promise.all([
        userStore.updateProfileName(editedName.value),
        userStore.updateProfileBio(editedBio.value ?? ""),
        userStore.updateProfilePronouns(editedPronouns.value ?? ""),
      ]);

      showSaveSuccess();
      
    }catch(e){
      saveError.value = true;
      console.error("Failed to save profile:", e);
    }finally{
      isSaving.value = false
    }
  }

  function closeProfilePanel() {
    showProfilePanel.value = false;
  }


  return{
    profileName,
    profileImageUrl,
    profileImageLoading,
    profileBio,
    profilePronouns,
    handleFileUpload: userStore.handleFileUpload,
    isProfileUpdating,
    profileUpdateError,
    profileUpdateSuccess,
    saveChanges,
    editedName,
    editedBio,
    isSaving,
    saveError,
    saveSuccess,
    showProfilePanel,
    editedPronouns,
    theme,
    toggleTheme,
    closeProfilePanel
  }
}

export default async () => ({
  props: {
    embedded: {
      type: Boolean,
      default: false,
    },
  },
  setup,
  template: await fetch(new URL("./profile.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
